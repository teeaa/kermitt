import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useDeferredValue,
} from "react";
import {
  Terminal,
  SquareTerminal,
  FileText,
  X,
  Maximize2,
  Minimize2,
  ChevronDown,
  Trash2,
  ArrowDownCircle,
  Copy,
  Check,
  Search,
  Clock,
  WrapText,
  SlidersHorizontal,
  ChevronUp,
  Pin,
  Box,
  Layers,
  History,
  Tag,
  Radio,
  Plus,
  AlertTriangle,
  Braces,
} from "lucide-react";
import { ipc } from "../../../wailsjs/go/models";
import { kubeApi } from "../../services/kubeApi";
import {
  LogFilterRule,
  extractFilterPatterns,
  matchesLogFilterRules,
} from "../../hooks/useLogFilters";
import { copyText } from "../../utils/clipboard";
import {
  parseLogLevel,
  getLogLevelStyles,
  extractJsonPayload,
  tokenizeJson,
  ExtractedJsonPayload,
  LogLevel,
  ProcessedLogLine,
  createProcessedLogLine,
} from "../../utils/logParser";
import { logFilterWorkerClient } from "../../utils/logFilterWorkerClient";
import { LogFilterModal } from "./LogFilterModal";
import { AddStreamPopover } from "./AddStreamPopover";
import { ExecTerminalView } from "./ExecTerminalView";

const STORAGE_KEY_DRAWER_HEIGHT = "kermitt_log_drawer_height";

// Vibrant terminal colors for multiplexed pod tagging
export const STREAM_COLORS = [
  "#38bdf8", // sky-400
  "#34d399", // emerald-400
  "#fbbf24", // amber-400
  "#a78bfa", // violet-400
  "#f472b6", // pink-400
  "#2dd4bf", // teal-400
  "#fb923c", // orange-400
  "#c084fc", // purple-400
  "#4ade80", // green-400
  "#60a5fa", // blue-400
  "#e879f9", // fuchsia-400
  "#f87171", // red-400
];

export const getDeterministicColor = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % STREAM_COLORS.length;
  return STREAM_COLORS[index];
};

export type LogLine = ProcessedLogLine;

export type FilterRule = LogFilterRule;

export interface LogStreamTarget {
  streamId: string;
  namespace: string;
  podName: string;
  containerName: string;
  color: string;
  status?: "connecting" | "streaming" | "live" | "ended" | "error";
  errorMessage?: string;
  isTerminated?: boolean;
}

export type LogStream = LogStreamTarget;

export interface LogTabSession {
  id: string;
  title: string;
  isCustomTitle?: boolean; // Set to true only if the user explicitly renamed the tab
  kind?: string;
  namespace: string;
  targetName: string;
  containerName?: string;
  activeStreams: LogStream[];
  lines: LogLine[];
  searchQuery: string;
  filterRules: FilterRule[];
  autoScroll: boolean;
  showPrefixes: boolean;
  isPrevious?: boolean;
  status?: "connecting" | "streaming" | "live" | "ended" | "error";
  errorMessage?: string;
  isTerminated?: boolean;
}

export const deriveTabTitle = (streams: LogStreamTarget[]): string => {
  if (!streams || streams.length === 0) {
    return "Log Viewer";
  }
  if (streams.length === 1) {
    return streams[0].podName || "Log Viewer";
  }
  const uniquePods = new Set(streams.map((s) => s.podName)).size;
  if (uniquePods > 1) {
    return `Combined (${uniquePods} pods)`;
  }
  return `${streams[0].podName || "Pod"} (${streams.length} containers)`;
};

export const formatErrorMessage = (rawError?: string): string => {
  if (!rawError) return "An unexpected error occurred while opening the log stream.";
  let cleaned = rawError;
  cleaned = cleaned.replace(/^failed to open log stream:\s*/i, "");
  cleaned = cleaned.replace(/^failed to open log stream for pod [^:]+:\s*/i, "");
  return cleaned.trim();
};

export interface WorkloadTarget {
  kind: string;
  name: string;
  namespace: string;
  title?: string;
}

export interface LogDrawerProps {
  pod?: ipc.PodSummary | null;
  execPod?: ipc.PodSummary | null;
  execTimestamp?: number;
  workload?: WorkloadTarget | null;
  combinedPods?: ipc.PodSummary[] | null;
  allPods?: ipc.PodSummary[];
  containers?: ipc.ContainerDetail[];
  selectedContainer?: string;
  onSelectContainer?: (containerName: string) => void;
  onClose: () => void;
  isPinned?: boolean;
  onTogglePin?: () => void;
  initialPrevious?: boolean;
  onToast?: (msg: string) => void;
}

export const LogDrawer: React.FC<LogDrawerProps> = ({
  pod,
  execPod,
  execTimestamp,
  workload,
  combinedPods,
  allPods,
  containers: containersProp,
  selectedContainer: selectedContainerProp,
  onSelectContainer: onSelectContainerProp,
  onClose,
  isPinned = false,
  onTogglePin,
  initialPrevious = false,
  onToast,
}) => {
  // Tab sessions state
  const [tabs, setTabs] = useState<LogTabSession[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");

  // Set of line IDs whose JSON is expanded in pretty-print multi-line view
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set());
  const [copiedJsonLineId, setCopiedJsonLineId] = useState<string | null>(null);
  const [drawerToast, setDrawerToast] = useState<string | null>(null);

  // Hidden pod names in multiplexed view per tab (allows toggling individual pods on/off)
  const [hiddenPodsByTab, setHiddenPodsByTab] = useState<Record<string, string[]>>({});

  // Single-pod container list state (for single pod tabs)
  const [podContainers, setPodContainers] = useState<Record<string, ipc.ContainerDetail[]>>({});
  const [activeContainerOverride, setActiveContainerOverride] = useState<Record<string, string>>({});
  const [containerDropdownOpen, setContainerDropdownOpen] = useState(false);

  // Global drawer settings
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [wrapLines, setWrapLines] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [filterModalOpen, setFilterModalOpen] = useState(false);

  // Vertical Drag Height Resizing State
  const [drawerHeightPx, setDrawerHeightPx] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_DRAWER_HEIGHT);
      if (stored) {
        const val = parseInt(stored, 10);
        if (!isNaN(val) && val >= 150 && val <= 1400) {
          return val;
        }
      }
    } catch {}
    return typeof window !== "undefined" ? Math.round(window.innerHeight * 0.38) : 340;
  });

  const [isDraggingHeight, setIsDraggingHeight] = useState(false);
  const dragHeightRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // Add stream popover state
  const [addStreamOpen, setAddStreamOpen] = useState(false);

  // Tab title inline renaming state
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const isCancelingRenameRef = useRef(false);

  // Refs for auto-scroll and elements
  const logContainerRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Registry of all active stream subscriptions: streamId -> { unsubscribe, stop }
  const activeStreamsRegistryRef = useRef<
    Map<string, { tabId: string; unsubscribe: () => void; stop: () => void }>
  >(new Map());

  // Ingestion buffer queue to decouple high-frequency stream events from React render passes
  const incomingQueuesRef = useRef<Map<string, ProcessedLogLine[]>>(new Map());

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setContainerDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Persist drawer height
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_DRAWER_HEIGHT, String(drawerHeightPx));
    } catch {}
  }, [drawerHeightPx]);

  // Auto-focus and select tab title input when entering rename mode
  useEffect(() => {
    if (editingTabId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingTabId]);

  // High-throughput stream ingestion batching: flush queued logs every 60ms into React state
  useEffect(() => {
    const interval = setInterval(() => {
      let hasItems = false;
      incomingQueuesRef.current.forEach((queue) => {
        if (queue.length > 0) hasItems = true;
      });
      if (!hasItems) return;

      setTabs((prevTabs) => {
        let changed = false;
        const nextTabs = prevTabs.map((t) => {
          const queue = incomingQueuesRef.current.get(t.id);
          if (!queue || queue.length === 0) return t;

          changed = true;
          const drained = queue.splice(0, queue.length);
          const combined = t.lines.concat(drained);
          const MAX_BUFFER = 10000;
          const capped =
            combined.length > MAX_BUFFER
              ? combined.slice(combined.length - MAX_BUFFER)
              : combined;

          return {
            ...t,
            lines: capped,
            status: t.status === "connecting" ? "streaming" : t.status,
          };
        });
        return changed ? nextTabs : prevTabs;
      });
    }, 60);

    return () => clearInterval(interval);
  }, []);

  // Clean up all active streams on component unmount
  useEffect(() => {
    return () => {
      activeStreamsRegistryRef.current.forEach(({ unsubscribe, stop }) => {
        try {
          unsubscribe();
        } catch {}
        try {
          stop();
        } catch {}
      });
      activeStreamsRegistryRef.current.clear();
      incomingQueuesRef.current.clear();
    };
  }, []);

  // Helper to safely append an incoming log line to a tab session's buffer queue
  const appendLogLine = useCallback((tabId: string, lineData: any) => {
    const processed: ProcessedLogLine =
      lineData && "lower" in lineData && "level" in lineData
        ? (lineData as ProcessedLogLine)
        : createProcessedLogLine({
            id: lineData.id,
            streamId: lineData.streamId,
            namespace: lineData.namespace,
            podName: lineData.podName,
            containerName: lineData.containerName || "",
            timestamp: lineData.timestamp,
            line: lineData.line,
            raw: lineData.raw,
            isStderr: Boolean(lineData.isStderr),
            color: lineData.color || "#38bdf8",
          });

    let queue = incomingQueuesRef.current.get(tabId);
    if (!queue) {
      queue = [];
      incomingQueuesRef.current.set(tabId, queue);
    }
    queue.push(processed);
  }, []);

  // Memoized callback for exec/log tab status changes
  const handleTabStatusChange = useCallback(
    (tabId: string, status: "connecting" | "live" | "ended" | "error", errMsg?: string) => {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === tabId ? { ...tab, status, errorMessage: errMsg } : tab
        )
      );
    },
    []
  );

  // Helper to start streaming a specific pod container and wire to tab
  const startStreamForPod = useCallback(
    async (
      tabId: string,
      namespace: string,
      podName: string,
      containerName: string,
      color: string,
      previous = false
    ): Promise<LogStreamTarget | null> => {
      // Transition tab into connecting state and clear any previous error
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId ? { ...t, status: "connecting", errorMessage: undefined } : t
        )
      );

      try {
        const streamId = await kubeApi.startLogStream(
          new ipc.LogStreamRequest({
            namespace,
            podName,
            containerName,
            follow: !previous,
            previous,
            timestamps: true,
          })
        );

        if (!streamId) {
          throw new Error(`Failed to initialize stream session for ${podName}`);
        }

        const unsubscribe = kubeApi.subscribeToStream(
          streamId,
          (payload) => {
            const line = createProcessedLogLine({
              streamId,
              namespace,
              podName,
              containerName: payload.containerName || containerName,
              timestamp: payload.timestamp,
              line: payload.line,
              raw: payload.line,
              isStderr: payload.isStderr,
              color,
            });
            appendLogLine(tabId, line);
          },
          (reason) => {
            console.debug("[LOGS] Stream concluded:", { streamId, reason });
            setTabs((prev) =>
              prev.map((t) => {
                if (t.id !== tabId) return t;
                return {
                  ...t,
                  status: t.lines.length > 0 ? "ended" : t.status,
                  activeStreams: t.activeStreams.map((s) =>
                    s.streamId === streamId ? { ...s, status: "ended" } : s
                  ),
                };
              })
            );
          },
          (streamErr) => {
            console.warn("[LOGS] Stream error event received:", { streamId, streamErr });
            const errMsg =
              streamErr?.error || streamErr?.message || String(streamErr) || "Stream encountered an error";
            setTabs((prev) =>
              prev.map((t) => {
                if (t.id !== tabId) return t;
                return {
                  ...t,
                  status: "error",
                  errorMessage: errMsg,
                  activeStreams: t.activeStreams.map((s) =>
                    s.streamId === streamId
                      ? { ...s, status: "error", errorMessage: errMsg }
                      : s
                  ),
                };
              })
            );
          }
        );

        const stop = () => {
          kubeApi.stopLogStream(streamId).catch(() => {});
        };

        activeStreamsRegistryRef.current.set(streamId, { tabId, unsubscribe, stop });

        return {
          streamId,
          namespace,
          podName,
          containerName,
          color,
          status: "live",
        };
      } catch (err: any) {
        console.error("[LOGS] Failed to start stream for pod:", { podName, err });
        const errMsg = err?.message || String(err) || `Failed to open log stream for ${podName}`;
        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== tabId) return t;
            return {
              ...t,
              status: "error",
              errorMessage: errMsg,
            };
          })
        );
        return null;
      }
    },
    [appendLogLine]
  );

  // Create or switch to Pod tab session when `pod` prop changes
  useEffect(() => {
    if (!pod) return;
    // Guard against running when combinedPods is active
    if (combinedPods && combinedPods.length > 0) return;

    const tabId = `pod-${pod.namespace}-${pod.name}${initialPrevious ? "-prev" : ""}`;

    const chosenContainer =
      selectedContainerProp ||
      activeContainerOverride[tabId] ||
      pod.containers?.[0] ||
      "";

    let shouldStart = false;

    setTabs((currentTabs) => {
      const existing = currentTabs.find((t) => t.id === tabId);
      if (existing) {
        return currentTabs;
      }

      shouldStart = true;

      const newSession: LogTabSession = {
        id: tabId,
        title: pod.name,
        isCustomTitle: false,
        kind: "Pod",
        namespace: pod.namespace,
        targetName: pod.name,
        activeStreams: [],
        lines: [],
        searchQuery: "",
        filterRules: [],
        autoScroll: !initialPrevious,
        showPrefixes: false,
        isPrevious: initialPrevious,
        status: "connecting",
      };

      return currentTabs.length === 0 ? [newSession] : [...currentTabs, newSession];
    });

    setActiveTabId(tabId);

    if (shouldStart) {
      // Async start streaming for pod
      startStreamForPod(
        tabId,
        pod.namespace,
        pod.name,
        chosenContainer,
        getDeterministicColor(pod.name),
        initialPrevious
      ).then((streamTarget) => {
        if (streamTarget) {
          setTabs((prev) =>
            prev.map((t) =>
              t.id === tabId ? { ...t, activeStreams: [streamTarget] } : t
            )
          );
        }
      });
    }

    // Async fetch container details if not provided
    if (!containersProp || containersProp.length === 0) {
      kubeApi
        .getContainerDetails(pod.namespace, pod.name)
        .then((details) => {
          setPodContainers((prev) => ({ ...prev, [tabId]: details || [] }));
        })
        .catch(() => {});
    } else {
      setPodContainers((prev) => ({ ...prev, [tabId]: containersProp }));
    }
  }, [pod, initialPrevious, selectedContainerProp, startStreamForPod, containersProp, activeContainerOverride, combinedPods]);

  // Listen for real-time pod lifecycle terminations via Informers (k8s:resource:changed)
  useEffect(() => {
    const unsub = kubeApi.subscribeToResourceChanges((event) => {
      if (event.resourceType !== "pod") return;
      const { action, name: podName, namespace, phase } = event;
      const isTerminated =
        action === "delete" ||
        phase === "Terminated" ||
        phase === "Failed" ||
        phase === "Completed";

      if (!isTerminated) return;

      setTabs((prevTabs) => {
        let anyModified = false;
        const updatedTabs = prevTabs.map((tab) => {
          const matchingStreams = tab.activeStreams.filter(
            (s) => s.podName === podName && (!namespace || s.namespace === namespace)
          );
          const isDirectPod =
            tab.kind === "Pod" &&
            tab.targetName === podName &&
            (!namespace || tab.namespace === namespace);

          if (matchingStreams.length === 0 && !isDirectPod) {
            return tab;
          }

          if (tab.isTerminated) {
            return tab;
          }

          anyModified = true;

          // Disconnect active streams for terminated pod
          matchingStreams.forEach((s) => {
            const activeEntry = activeStreamsRegistryRef.current.get(s.streamId);
            if (activeEntry) {
              activeEntry.unsubscribe();
              activeEntry.stop();
              activeStreamsRegistryRef.current.delete(s.streamId);
            }
          });

          const nowIso = new Date().toISOString();
          const systemNoticeLine = createProcessedLogLine({
            streamId: matchingStreams[0]?.streamId || "system",
            namespace: namespace || tab.namespace,
            podName: podName,
            containerName: matchingStreams[0]?.containerName || "system",
            timestamp: nowIso,
            line: `[SYSTEM] Pod "${podName}" terminated / deleted from cluster. Log stream disconnected at ${nowIso}.`,
            raw: `[SYSTEM] Pod "${podName}" terminated / deleted from cluster. Log stream disconnected at ${nowIso}.`,
            isStderr: false,
            color: "#f59e0b",
            isSystemBanner: true,
          });

          return {
            ...tab,
            isTerminated: true,
            status: "ended" as const,
            autoScroll: false,
            lines: [...tab.lines, systemNoticeLine],
            activeStreams: tab.activeStreams.map((s) =>
              s.podName === podName && (!namespace || s.namespace === namespace)
                ? { ...s, status: "ended" as const, isTerminated: true }
                : s
            ),
          };
        });

        return anyModified ? updatedTabs : prevTabs;
      });
    });

    return () => {
      unsub();
    };
  }, []);

  // Create or switch to Exec tab session when `execPod` or `execTimestamp` changes
  useEffect(() => {
    if (!execPod) return;

    const tabId = `exec-${execPod.namespace}-${execPod.name}`;
    const chosenContainer =
      selectedContainerProp ||
      activeContainerOverride[tabId] ||
      execPod.containers?.[0] ||
      "";

    setTabs((currentTabs) => {
      const existing = currentTabs.find((t) => t.id === tabId);
      if (existing) {
        return currentTabs;
      }

      const newSession: LogTabSession = {
        id: tabId,
        title: `>_ sh: ${execPod.name}`,
        isCustomTitle: false,
        kind: "Exec",
        namespace: execPod.namespace,
        targetName: execPod.name,
        containerName: chosenContainer,
        activeStreams: [],
        lines: [],
        searchQuery: "",
        filterRules: [],
        autoScroll: false,
        showPrefixes: false,
        status: "connecting",
      };

      return currentTabs.length === 0 ? [newSession] : [...currentTabs, newSession];
    });

    setActiveTabId(tabId);

    // Fetch container details for container selector
    if (!containersProp || containersProp.length === 0) {
      kubeApi
        .getContainerDetails(execPod.namespace, execPod.name)
        .then((details) => {
          setPodContainers((prev) => ({ ...prev, [tabId]: details || [] }));
        })
        .catch(() => {});
    } else {
      setPodContainers((prev) => ({ ...prev, [tabId]: containersProp }));
    }
  }, [execPod, execTimestamp, selectedContainerProp, containersProp, activeContainerOverride]);

  // Create or switch to Controller tab session when `workload` prop changes
  useEffect(() => {
    if (!workload) return;
    if (combinedPods && combinedPods.length > 0) return;

    const tabId = `workload-${workload.kind.toLowerCase()}-${workload.namespace}-${workload.name}`;

    let shouldFetch = false;

    setTabs((currentTabs) => {
      const existing = currentTabs.find((t) => t.id === tabId);
      if (existing) {
        return currentTabs;
      }

      shouldFetch = true;

      const newSession: LogTabSession = {
        id: tabId,
        title: `${workload.name} (${workload.kind})`,
        isCustomTitle: false,
        kind: workload.kind,
        namespace: workload.namespace,
        targetName: workload.name,
        activeStreams: [],
        lines: [],
        searchQuery: "",
        filterRules: [],
        autoScroll: true,
        showPrefixes: true,
      };

      return currentTabs.length === 0 ? [newSession] : [...currentTabs, newSession];
    });

    setActiveTabId(tabId);

    if (shouldFetch) {
      // Resolve controller pods and stream simultaneously
      kubeApi
        .getControllerPods(workload.namespace, workload.kind, workload.name)
        .then(async (resolvedPods) => {
          if (!resolvedPods || resolvedPods.length === 0) {
            appendLogLine(tabId, {
              id: `sys-${Date.now()}`,
              streamId: "system",
              namespace: workload.namespace,
              podName: workload.name,
              containerName: "controller",
              line: `[INFO] No active pods currently found matching ${workload.kind} "${workload.name}" in namespace "${workload.namespace}".`,
              isStderr: false,
              color: "#94a3b8",
            });
            return;
          }

          // Update tab title with pod count
          setTabs((prev) =>
            prev.map((t) =>
              t.id === tabId
                ? {
                    ...t,
                    title: t.isCustomTitle
                      ? t.title
                      : `${workload.name} (${resolvedPods.length} ${
                          resolvedPods.length === 1 ? "pod" : "pods"
                        })`,
                  }
                : t
            )
          );

          // Stream up to 25 pods concurrently
          const streamPromises = resolvedPods.slice(0, 25).map((p, idx) => {
            const color = STREAM_COLORS[idx % STREAM_COLORS.length];
            const defaultCont = p.containers?.[0] || "";
            return startStreamForPod(
              tabId,
              p.namespace,
              p.name,
              defaultCont,
              color,
              false
            );
          });

          const results = await Promise.all(streamPromises);
          const validStreams = results.filter(
            (s): s is LogStreamTarget => s !== null
          );

          setTabs((prev) =>
            prev.map((t) =>
              t.id === tabId ? { ...t, activeStreams: validStreams } : t
            )
          );
        })
        .catch((err) => {
          console.error("[LOGS] Failed to resolve controller pods:", err);
          appendLogLine(tabId, {
            id: `sys-${Date.now()}`,
            streamId: "system",
            namespace: workload.namespace,
            podName: workload.name,
            containerName: "controller",
            line: `[ERROR] Failed to resolve pods for ${workload.kind} "${workload.name}": ${err?.message || err}`,
            isStderr: true,
            color: "#f87171",
          });
        });
    }
  }, [workload, startStreamForPod, appendLogLine, combinedPods]);

  // Track opened combined signatures to avoid re-creating on re-renders
  const lastOpenedCombinedSigRef = useRef<string>("");

  // Create or switch to Combined Pods tab session when `combinedPods` prop changes
  useEffect(() => {
    if (!combinedPods || combinedPods.length === 0) return;

    const signature = combinedPods
      .map((p) => p.name)
      .sort()
      .join("-");
    const tabId = `combined-${signature}`;

    // If this combined session was already opened, just focus it
    if (lastOpenedCombinedSigRef.current === signature) {
      setActiveTabId(tabId);
      return;
    }
    lastOpenedCombinedSigRef.current = signature;

    const title = `Combined (${combinedPods.length} pods)`;
    const namespace = combinedPods[0]?.namespace || "";

    const newSession: LogTabSession = {
      id: tabId,
      title,
      isCustomTitle: false,
      kind: "Combined",
      namespace,
      targetName: title,
      activeStreams: [],
      lines: [],
      searchQuery: "",
      filterRules: [],
      autoScroll: true,
      showPrefixes: true,
    };

    let shouldStart = false;

    // Atomically set new tab: replace empty state or append cleanly without triggering single-pod openers
    setTabs((prev) => {
      const existing = prev.find((t) => t.id === tabId);
      if (existing) {
        return prev;
      }
      shouldStart = true;
      return prev.length === 0 ? [newSession] : [...prev, newSession];
    });

    setActiveTabId(tabId);

    if (shouldStart) {
      // Concurrently stream all pods in combinedPods (up to 25 pods)
      const streamPromises = combinedPods.slice(0, 25).map((p, idx) => {
        const color = STREAM_COLORS[idx % STREAM_COLORS.length];
        const defaultCont = p.containers?.[0] || p.name;
        return startStreamForPod(
          tabId,
          p.namespace,
          p.name,
          defaultCont,
          color,
          false
        );
      });

      Promise.all(streamPromises).then((results) => {
        const validStreams = results.filter(
          (s): s is LogStreamTarget => s !== null
        );
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId ? { ...t, activeStreams: validStreams } : t
          )
        );
      });
    }
  }, [combinedPods, startStreamForPod]);

  // Active Tab reference
  const activeTab = useMemo(() => {
    return tabs.find((t) => t.id === activeTabId) || tabs[0] || null;
  }, [tabs, activeTabId]);

  // Close a specific tab and release all its stream sessions
  const handleCloseTab = useCallback(
    (e: React.MouseEvent, tabIdToClose: string) => {
      e.stopPropagation();

      // Clean up streams for this tab
      activeStreamsRegistryRef.current.forEach(({ tabId, unsubscribe, stop }, streamId) => {
        if (tabId === tabIdToClose) {
          try {
            unsubscribe();
          } catch {}
          try {
            stop();
          } catch {}
          activeStreamsRegistryRef.current.delete(streamId);
        }
      });

      incomingQueuesRef.current.delete(tabIdToClose);
      setTabs((prev) => {
        const remaining = prev.filter((t) => t.id !== tabIdToClose);
        if (remaining.length === 0) {
          onClose();
          return [];
        }
        if (activeTabId === tabIdToClose) {
          const nextActive = remaining[remaining.length - 1];
          setActiveTabId(nextActive.id);
        }
        return remaining;
      });
    },
    [activeTabId, onClose]
  );

  // Close entire drawer and all open streams
  const handleCloseAll = useCallback(() => {
    activeStreamsRegistryRef.current.forEach(({ unsubscribe, stop }) => {
      try {
        unsubscribe();
      } catch {}
      try {
        stop();
      } catch {}
    });
    activeStreamsRegistryRef.current.clear();
    incomingQueuesRef.current.clear();
    setTabs([]);
    onClose();
  }, [onClose]);

  // Tab mutator helpers
  const updateActiveTab = useCallback(
    (updater: (current: LogTabSession) => LogTabSession) => {
      if (!activeTabId) return;
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? updater(t) : t))
      );
    },
    [activeTabId]
  );

  const togglePrefixes = useCallback(() => {
    updateActiveTab((t) => ({ ...t, showPrefixes: !t.showPrefixes }));
  }, [updateActiveTab]);

  const toggleAutoScroll = useCallback(() => {
    updateActiveTab((t) => ({ ...t, autoScroll: !t.autoScroll }));
  }, [updateActiveTab]);

  const handleClearActiveTabLogs = useCallback(() => {
    if (activeTabId) {
      incomingQueuesRef.current.delete(activeTabId);
    }
    updateActiveTab((t) => ({ ...t, lines: [] }));
  }, [activeTabId, updateActiveTab]);

  // Tab title renaming handlers
  const handleStartRename = useCallback((tab: LogTabSession, e?: React.MouseEvent) => {
    e?.stopPropagation();
    isCancelingRenameRef.current = false;
    setEditingTabId(tab.id);
    setEditingTitle(tab.title);
  }, []);

  const handleSaveRename = useCallback((tabId: string) => {
    if (isCancelingRenameRef.current) {
      isCancelingRenameRef.current = false;
      return;
    }
    const trimmed = editingTitle.trim();
    if (trimmed) {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? {
                ...t,
                title: trimmed,
                isCustomTitle: true,
              }
            : t
        )
      );
    }
    setEditingTabId(null);
  }, [editingTitle]);

  // Remove a specific stream from the active tab and stop its backend stream
  const handleRemoveStream = useCallback(
    (streamIdToRemove: string) => {
      const entry = activeStreamsRegistryRef.current.get(streamIdToRemove);
      if (entry) {
        try {
          entry.unsubscribe();
        } catch {}
        try {
          entry.stop();
        } catch {}
        activeStreamsRegistryRef.current.delete(streamIdToRemove);
      }

      updateActiveTab((t) => {
        const remaining = t.activeStreams.filter((s) => s.streamId !== streamIdToRemove);
        return {
          ...t,
          activeStreams: remaining,
          title: t.isCustomTitle ? t.title : deriveTabTitle(remaining),
        };
      });
    },
    [updateActiveTab]
  );

  // Add another pod stream to the active tab session
  const handleAddStream = useCallback(
    async (targetPod: ipc.PodSummary) => {
      if (!activeTab) return;
      setAddStreamOpen(false);

      // Pick a distinct color not currently in use if possible
      const usedColors = new Set(activeTab.activeStreams.map((s) => s.color));
      const chosenColor =
        STREAM_COLORS.find((c) => !usedColors.has(c)) ||
        getDeterministicColor(targetPod.name);

      const defaultContainer = targetPod.containers?.[0] || targetPod.name;
      const streamTarget = await startStreamForPod(
        activeTab.id,
        targetPod.namespace,
        targetPod.name,
        defaultContainer,
        chosenColor,
        false
      );

      if (streamTarget) {
        updateActiveTab((t) => {
          const updatedStreams = [...t.activeStreams, streamTarget];
          return {
            ...t,
            activeStreams: updatedStreams,
            showPrefixes: true,
            title: t.isCustomTitle ? t.title : deriveTabTitle(updatedStreams),
          };
        });
      }
    },
    [activeTab, startStreamForPod, updateActiveTab]
  );

  // Container selector for single-pod or exec tabs
  const handleSelectContainer = useCallback(
    async (containerName: string) => {
      if (!activeTab || (activeTab.kind !== "Pod" && activeTab.kind !== "Exec")) return;
      setActiveContainerOverride((prev) => ({
        ...prev,
        [activeTab.id]: containerName,
      }));
      onSelectContainerProp?.(containerName);

      if (activeTab.kind === "Exec") {
        updateActiveTab((t) => ({ ...t, containerName }));
        return;
      }

      // Stop old stream
      activeStreamsRegistryRef.current.forEach(({ tabId, unsubscribe, stop }, sId) => {
        if (tabId === activeTab.id) {
          try {
            unsubscribe();
          } catch {}
          try {
            stop();
          } catch {}
          activeStreamsRegistryRef.current.delete(sId);
        }
      });

      // Restart stream on new container
      updateActiveTab((t) => ({ ...t, lines: [], activeStreams: [] }));
      const newStream = await startStreamForPod(
        activeTab.id,
        activeTab.namespace,
        activeTab.targetName,
        containerName,
        STREAM_COLORS[0],
        activeTab.isPrevious
      );
      if (newStream) {
        updateActiveTab((t) => ({ ...t, activeStreams: [newStream] }));
      }
    },
    [activeTab, onSelectContainerProp, startStreamForPod, updateActiveTab]
  );

  // Quick action: switch active tab from previous logs to live logs
  const handleSwitchToLiveLogs = useCallback(async () => {
    if (!activeTab) return;

    // Stop old stream(s) for this tab
    activeStreamsRegistryRef.current.forEach(({ tabId, unsubscribe, stop }, sId) => {
      if (tabId === activeTab.id) {
        try {
          unsubscribe();
        } catch {}
        try {
          stop();
        } catch {}
        activeStreamsRegistryRef.current.delete(sId);
      }
    });

    // Clear lines, error states, and toggle isPrevious to false
    updateActiveTab((t) => ({
      ...t,
      isPrevious: false,
      autoScroll: true,
      lines: [],
      activeStreams: [],
      status: "connecting",
      errorMessage: undefined,
    }));

    const targetContainer =
      activeContainerOverride[activeTab.id] ||
      activeTab.activeStreams[0]?.containerName ||
      (podContainers[activeTab.id]?.[0]?.name) ||
      selectedContainerProp ||
      "";

    const newStream = await startStreamForPod(
      activeTab.id,
      activeTab.namespace,
      activeTab.targetName,
      targetContainer,
      STREAM_COLORS[0],
      false // live streaming
    );

    if (newStream) {
      updateActiveTab((t) => ({
        ...t,
        activeStreams: [newStream],
        status: "streaming",
      }));
    }
  }, [
    activeTab,
    activeContainerOverride,
    podContainers,
    selectedContainerProp,
    startStreamForPod,
    updateActiveTab,
  ]);

  // Toggle hiding a pod from the multiplexed timeline
  const togglePodVisibility = useCallback(
    (podName: string) => {
      if (!activeTab) return;
      setHiddenPodsByTab((prev) => {
        const list = prev[activeTab.id] || [];
        const isHidden = list.includes(podName);
        const next = isHidden
          ? list.filter((p) => p !== podName)
          : [...list, podName];
        return { ...prev, [activeTab.id]: next };
      });
    },
    [activeTab]
  );

  // Height Resizing
  const handleHeightResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragHeightRef.current = {
      startY: e.clientY,
      startHeight: drawerHeightPx,
    };
    setIsDraggingHeight(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!dragHeightRef.current) return;
      const { startY, startHeight } = dragHeightRef.current;

      // Account for container zoom scale
      let zoomFactor = 1.0;
      if (typeof document !== "undefined") {
        const docZoom = document.documentElement.style.getPropertyValue("--app-zoom");
        if (docZoom) {
          const parsed = parseFloat(docZoom);
          if (!isNaN(parsed) && parsed > 0) zoomFactor = parsed;
        }
      }

      const deltaY = (startY - moveEvent.clientY) / zoomFactor;
      const minH = window.innerHeight * 0.2;
      const maxH = window.innerHeight * 0.85;
      const nextH = Math.min(maxH, Math.max(minH, startHeight + deltaY));
      setDrawerHeightPx(Math.round(nextH));
    };

    const onMouseUp = () => {
      setIsDraggingHeight(false);
      dragHeightRef.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.removeProperty("user-select");
      document.body.style.removeProperty("cursor");
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const handleToggleExpand = () => {
    const maxHeight = Math.round(window.innerHeight * 0.82);
    if (drawerHeightPx >= maxHeight - 15) {
      setDrawerHeightPx(Math.round(window.innerHeight * 0.38));
    } else {
      setDrawerHeightPx(maxHeight);
    }
  };

  // Local immediate state for search input to decouple keystroke typing from background filtering
  const [searchInput, setSearchInput] = useState("");
  const deferredQuery = useDeferredValue(searchInput);
  const [workerFilteredIndices, setWorkerFilteredIndices] = useState<number[] | null>(null);

  // Virtualized list scroll tracking
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRafRef = useRef<number | null>(null);

  // Synchronize local searchInput when switching active tab
  useEffect(() => {
    setSearchInput(activeTab?.searchQuery || "");
  }, [activeTab?.id]);

  // Keep activeTab.searchQuery updated with deferredQuery
  useEffect(() => {
    if (activeTab && activeTab.searchQuery !== deferredQuery) {
      updateActiveTab((t) => ({ ...t, searchQuery: deferredQuery }));
    }
  }, [deferredQuery, activeTab?.id, updateActiveTab]);

  // Web Worker off-thread filtering for buffers >= 2,000 lines
  useEffect(() => {
    if (!activeTab || activeTab.kind === "Exec") return;
    const q = deferredQuery.trim().toLowerCase();
    if (!q || !isSearchOpen) {
      setWorkerFilteredIndices(null);
      return;
    }

    if (activeTab.lines.length >= 2000) {
      let isSubscribed = true;
      const lowerLines = activeTab.lines.map((l) => l.lower);
      logFilterWorkerClient.filter(q, lowerLines).then((indices) => {
        if (isSubscribed) {
          setWorkerFilteredIndices(indices);
        }
      });
      return () => {
        isSubscribed = false;
      };
    } else {
      setWorkerFilteredIndices(null);
    }
  }, [deferredQuery, isSearchOpen, activeTab?.id, activeTab?.lines, activeTab?.kind]);

  // Filtered indices: uses worker results for >= 2000 lines, synchronous inline for < 2000 lines
  const filteredIndices = useMemo<number[] | null>(() => {
    if (!activeTab || !isSearchOpen) return null;
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return null;

    if (activeTab.lines.length >= 2000) {
      return workerFilteredIndices;
    }

    // Fast-path synchronous main-thread filtering for < 2000 lines using pre-lowercased string
    const matches: number[] = [];
    const lines = activeTab.lines;
    const len = lines.length;
    for (let i = 0; i < len; i++) {
      if (lines[i].lower.includes(q)) {
        matches.push(i);
      }
    }
    return matches;
  }, [activeTab, isSearchOpen, deferredQuery, workerFilteredIndices]);

  // Visible lines: zero-allocation evaluation of hidden pods and pre-lowercased filter rules
  const visibleLines = useMemo<ProcessedLogLine[]>(() => {
    if (!activeTab) return [];
    const hiddenList = hiddenPodsByTab[activeTab.id] || [];
    const { excludes, includes } = extractFilterPatterns(activeTab.filterRules || []);
    const hasExcludes = excludes.length > 0;
    const hasIncludes = includes.length > 0;
    const hasHidden = hiddenList.length > 0;

    const allLines = activeTab.lines;
    const result: ProcessedLogLine[] = [];

    if (filteredIndices !== null) {
      for (let k = 0; k < filteredIndices.length; k++) {
        const line = allLines[filteredIndices[k]];
        if (!line) continue;
        if (hasHidden && hiddenList.includes(line.podName)) continue;
        if ((hasExcludes || hasIncludes) && !matchesLogFilterRules(line.lower, excludes, includes)) {
          continue;
        }
        result.push(line);
      }
    } else {
      for (let i = 0; i < allLines.length; i++) {
        const line = allLines[i];
        if (hasHidden && hiddenList.includes(line.podName)) continue;
        if ((hasExcludes || hasIncludes) && !matchesLogFilterRules(line.lower, excludes, includes)) {
          continue;
        }
        result.push(line);
      }
    }

    return result;
  }, [activeTab, hiddenPodsByTab, filteredIndices]);

  // Count search matches in visible lines and build match-to-row index map
  const { totalSearchMatches, matchRowIndices } = useMemo(() => {
    if (!activeTab || !isSearchOpen) return { totalSearchMatches: 0, matchRowIndices: [] };
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return { totalSearchMatches: 0, matchRowIndices: [] };

    let count = 0;
    const rowIndices: number[] = [];
    const len = visibleLines.length;
    for (let r = 0; r < len; r++) {
      const lineLower = visibleLines[r].lower;
      let pos = 0;
      while ((pos = lineLower.indexOf(q, pos)) !== -1) {
        rowIndices.push(r);
        count++;
        pos += q.length;
      }
    }
    return { totalSearchMatches: count, matchRowIndices: rowIndices };
  }, [activeTab, isSearchOpen, deferredQuery, visibleLines]);

  useEffect(() => {
    if (activeMatchIndex >= totalSearchMatches && totalSearchMatches > 0) {
      setActiveMatchIndex(totalSearchMatches - 1);
    }
  }, [totalSearchMatches, activeMatchIndex]);

  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 50);
    }
  }, [isSearchOpen]);

  // Auto-scroll to active search match using virtual row position
  useEffect(() => {
    if (isSearchOpen && totalSearchMatches > 0 && matchRowIndices.length > 0) {
      const targetRow = matchRowIndices[activeMatchIndex];
      if (targetRow !== undefined && logContainerRef.current) {
        const rowHeight = 22;
        const targetScrollTop = Math.max(
          0,
          targetRow * rowHeight - logContainerRef.current.clientHeight / 2
        );
        logContainerRef.current.scrollTo({ top: targetScrollTop, behavior: "smooth" });
      }
    }
  }, [activeMatchIndex, isSearchOpen, totalSearchMatches, matchRowIndices]);

  // Determine which row and occurrence within that row is the active match
  const activeMatchRow = matchRowIndices[activeMatchIndex];
  const activeMatchOccurrenceInRow = useMemo(() => {
    if (activeMatchRow === undefined) return -1;
    let occurrence = 0;
    for (let i = 0; i < activeMatchIndex; i++) {
      if (matchRowIndices[i] === activeMatchRow) {
        occurrence++;
      }
    }
    return occurrence;
  }, [activeMatchRow, activeMatchIndex, matchRowIndices]);

  // Auto-scroll to bottom for new incoming log lines
  useEffect(() => {
    if (activeTab?.autoScroll && !isSearchOpen && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [visibleLines, activeTab?.autoScroll, isSearchOpen]);

  // Scroll detection to toggle auto-scroll and update virtualizer scroll top
  const handleContainerScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const currentScrollTop = target.scrollTop;

    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      setScrollTop(currentScrollTop);
    });

    if (!activeTab) return;
    const isAtBottom = target.scrollHeight - currentScrollTop - target.clientHeight < 40;
    if (!isAtBottom && activeTab.autoScroll) {
      updateActiveTab((t) => ({ ...t, autoScroll: false }));
    } else if (isAtBottom && !activeTab.autoScroll) {
      updateActiveTab((t) => ({ ...t, autoScroll: true }));
    }
  }, [activeTab, updateActiveTab]);

  const handleJumpToBottom = () => {
    updateActiveTab((t) => ({ ...t, autoScroll: true }));
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  };

  const handleCopyAllLogs = async () => {
    if (!activeTab || visibleLines.length === 0) return;
    const filteredLines = visibleLines;
    const text = filteredLines.map((l) => l.raw ?? l.line).join("\n");
    const success = await copyText(text);
    if (success) {
      setCopiedLogs(true);
      const msg = `Copied ${filteredLines.length} lines to clipboard`;
      setDrawerToast(msg);
      if (onToast) {
        onToast(msg);
      }
      setTimeout(() => setCopiedLogs(false), 2000);
      setTimeout(() => setDrawerToast(null), 3000);
    }
  };

  const toggleLineExpanded = useCallback((lineId: string) => {
    setExpandedLines((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
  }, []);

  const handleCopyJson = useCallback(async (lineId: string, jsonStr: string) => {
    const success = await copyText(jsonStr);
    if (success) {
      setCopiedJsonLineId(lineId);
      setDrawerToast("Copied JSON to clipboard");
      if (onToast) {
        onToast("Copied JSON to clipboard");
      }
      setTimeout(() => setCopiedJsonLineId(null), 2000);
      setTimeout(() => setDrawerToast(null), 3000);
    }
  }, [onToast]);

  const handleNextMatch = () => {
    if (totalSearchMatches === 0) return;
    setActiveMatchIndex((prev) => (prev + 1) % totalSearchMatches);
  };

  const handlePrevMatch = () => {
    if (totalSearchMatches === 0) return;
    setActiveMatchIndex((prev) => (prev - 1 + totalSearchMatches) % totalSearchMatches);
  };

  const handleClearSearch = useCallback(() => {
    setSearchInput("");
    setWorkerFilteredIndices(null);
    updateActiveTab((t) => ({ ...t, searchQuery: "" }));
    setActiveMatchIndex(0);
    searchInputRef.current?.focus();
  }, [updateActiveTab]);

  const handleCloseSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchInput("");
    setWorkerFilteredIndices(null);
    updateActiveTab((t) => ({ ...t, searchQuery: "" }));
    setActiveMatchIndex(0);
  }, [updateActiveTab]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrevMatch();
      } else {
        handleNextMatch();
      }
    } else if (e.key === "Escape") {
      handleCloseSearch();
    }
  };

  // Keyboard shortcut: Ctrl+F or Cmd+F opens search
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        if (activeTab && activeTab.kind !== "Exec") {
          e.preventDefault();
          setIsSearchOpen(true);
          setTimeout(() => {
            searchInputRef.current?.focus();
            searchInputRef.current?.select();
          }, 50);
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [activeTab]);

  const renderSearchHighlighted = (
    text: string,
    colorClass: string,
    q: string,
    tracker?: { current: number; activeTarget: number }
  ): React.ReactNode => {
    if (!q) {
      return <span className={colorClass}>{text}</span>;
    }

    const textLower = text.toLowerCase();
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let pos = 0;

    while ((pos = textLower.indexOf(q, lastIndex)) !== -1) {
      if (pos > lastIndex) {
        parts.push(text.slice(lastIndex, pos));
      }

      const isCurrentMatch = tracker ? tracker.current === tracker.activeTarget : false;
      if (tracker) {
        tracker.current++;
      }

      parts.push(
        <mark
          key={`m-${pos}`}
          className={
            isCurrentMatch
              ? "bg-amber-400 text-slate-950 font-bold px-0.5 rounded-xs ring-2 ring-amber-300 shadow-sm"
              : "bg-amber-500/35 text-amber-200 px-0.5 rounded-xs font-semibold"
          }
        >
          {text.slice(pos, pos + q.length)}
        </mark>
      );

      lastIndex = pos + q.length;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return <span className={colorClass}>{parts}</span>;
  };

  const renderFormattedJsonCode = (
    parsed: any,
    q: string,
    tracker?: { current: number; activeTarget: number }
  ) => {
    const formattedStr = JSON.stringify(parsed, null, 2);
    const lines = formattedStr.split("\n");

    return lines.map((lineText, lineIdx) => {
      const tokens = tokenizeJson(lineText);
      return (
        <div key={`json-line-${lineIdx}`} className="whitespace-pre">
          {tokens.map((token, tokenIdx) => {
            let colorClass = "text-slate-400";
            if (token.type === "key") colorClass = "text-sky-300/90 font-medium";
            else if (token.type === "string") colorClass = "text-emerald-300/90";
            else if (token.type === "number") colorClass = "text-amber-300";
            else if (token.type === "boolean") colorClass = "text-violet-300 font-medium";
            else if (token.type === "null") colorClass = "text-violet-400/90 italic";
            else if (token.type === "punctuation") colorClass = "text-slate-500";

            return (
              <React.Fragment key={`token-${tokenIdx}`}>
                {renderSearchHighlighted(token.value, colorClass, q, tracker)}
              </React.Fragment>
            );
          })}
        </div>
      );
    });
  };

  const renderLogLineContent = (
    entry: LogLine,
    jsonPayload: ExtractedJsonPayload | null,
    level: LogLevel,
    isExpanded: boolean,
    tracker?: { current: number; activeTarget: number }
  ) => {
    const q = isSearchOpen ? deferredQuery.trim().toLowerCase() : "";
    const levelStyles = getLogLevelStyles(level);

    if (!jsonPayload) {
      return renderSearchHighlighted(entry.line, levelStyles.textClass, q, tracker);
    }

    // Colors for prefix and suffix based on line level
    const prefixColor =
      level === "ERROR"
        ? "text-rose-400 font-semibold"
        : level === "WARN"
        ? "text-amber-400 font-medium"
        : levelStyles.textClass;
    const suffixColor = prefixColor;

    if (isExpanded) {
      return (
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          {jsonPayload.prefix && renderSearchHighlighted(jsonPayload.prefix, prefixColor, q, tracker)}
          <span className="text-cyan-400/80 italic font-mono text-[11px]">
            {jsonPayload.jsonStr.length > 80 ? `${jsonPayload.jsonStr.slice(0, 80)}...` : jsonPayload.jsonStr}
          </span>
          {jsonPayload.suffix && renderSearchHighlighted(jsonPayload.suffix, suffixColor, q, tracker)}
        </span>
      );
    }

    // Single-line mode: render prefix, tokenized JSON, and suffix
    const tokens = tokenizeJson(jsonPayload.jsonStr);

    return (
      <span>
        {jsonPayload.prefix && renderSearchHighlighted(jsonPayload.prefix, prefixColor, q, tracker)}
        {tokens.map((token, idx) => {
          let tokenClass = "text-slate-400";
          if (token.type === "key") {
            tokenClass = "text-sky-300/90 font-medium";
          } else if (token.type === "string") {
            tokenClass = "text-emerald-300/90";
          } else if (token.type === "number") {
            tokenClass = "text-amber-300";
          } else if (token.type === "boolean") {
            tokenClass = "text-violet-300 font-medium";
          } else if (token.type === "null") {
            tokenClass = "text-violet-400/90 italic";
          } else if (token.type === "punctuation") {
            tokenClass = "text-slate-400";
          }

          return (
            <React.Fragment key={`tok-${idx}`}>
              {renderSearchHighlighted(token.value, tokenClass, q, tracker)}
            </React.Fragment>
          );
        })}
        {jsonPayload.suffix && renderSearchHighlighted(jsonPayload.suffix, suffixColor, q, tracker)}
      </span>
    );
  };

  if (!tabs || tabs.length === 0 || !activeTab) return null;

  const currentContainers = (activeTab && podContainers[activeTab.id]) || [];
  const selectedContainer =
    (activeTab && activeContainerOverride[activeTab.id]) ||
    selectedContainerProp ||
    activeTab?.activeStreams[0]?.containerName ||
    "";

  const isAnyStreamLive = activeTab?.activeStreams.some((s) => s.status === "live");
  const hiddenPods = (activeTab && hiddenPodsByTab[activeTab.id]) || [];

  return (
    <div
      data-log-drawer="true"
      style={{ height: `${drawerHeightPx}px` }}
      className="log-container border-t border-slate-800 bg-slate-950 flex flex-col shadow-2xl relative z-30 flex-shrink-0 font-sans"
    >
      {/* Floating Visual Toast Notification Banner */}
      {drawerToast && (
        <div className="absolute top-12 right-6 z-50 px-3 py-1.5 rounded-md bg-slate-900/95 border border-cyan-500/50 text-cyan-300 text-xs shadow-xl flex items-center space-x-2 animate-in fade-in zoom-in-95 duration-150 pointer-events-none">
          <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span className="font-medium">{drawerToast}</span>
        </div>
      )}
      {/* Draggable Vertical Height Resizer Handle */}
      <div
        onMouseDown={handleHeightResizeStart}
        title="Drag up or down to resize log drawer height"
        className={`h-1.5 w-full cursor-row-resize border-t border-slate-700/80 transition-colors flex items-center justify-center relative z-40 group/resizer ${
          isDraggingHeight
            ? "bg-sky-500 border-sky-400"
            : "hover:bg-sky-500/60 hover:border-sky-400"
        }`}
      >
        <div
          className={`h-0.5 w-10 rounded-full transition-colors ${
            isDraggingHeight ? "bg-white" : "bg-zinc-600/70 group-hover/resizer:bg-white"
          }`}
        />
      </div>

      {/* 1. Header Tab Bar (Tabbed Architecture) */}
      <div className="bg-slate-900 border-b border-slate-800 flex items-center justify-between px-2 pt-1 gap-2 select-none flex-shrink-0 overflow-x-auto scrollbar-thin">
        {/* Scrollable Tabs List */}
        <div className="flex items-center space-x-1 min-w-0 overflow-x-auto py-0.5">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const tabIsLive = tab.activeStreams.some((s) => s.status === "live");

            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                onDoubleClick={(e) => handleStartRename(tab, e)}
                className={`group flex items-center space-x-2 px-3 py-1.5 rounded-t-md text-xs font-mono transition-all cursor-pointer border-t-2 ${
                  isActive
                    ? "bg-slate-950 text-cyan-300 border-cyan-400 shadow-sm font-semibold"
                    : "bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border-transparent"
                }`}
              >
                {/* Live / Paused / Error / Terminated Status Indicator */}
                {tab.status === "error" || tab.errorMessage ? (
                  <AlertTriangle className="w-3 h-3 text-rose-400 flex-shrink-0" />
                ) : tab.isTerminated ? (
                  <span className="w-2 h-2 rounded-full bg-slate-500 flex-shrink-0" title="Pod terminated" />
                ) : tab.isPrevious ? (
                  <History className="w-3 h-3 text-amber-400 flex-shrink-0" />
                ) : (tab.kind === "Exec" && tab.status === "live") || tabIsLive ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-slate-600 flex-shrink-0" />
                )}

                {/* Tab Icon */}
                {tab.kind === "Exec" ? (
                  <SquareTerminal className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                ) : tab.kind === "Deployment" || tab.kind === "StatefulSet" || tab.kind === "DaemonSet" || tab.kind === "Job" || tab.kind === "Combined" ? (
                  <Layers className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                )}

                {/* Tab Title */}
                {editingTabId === tab.id ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSaveRename(tab.id);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        isCancelingRenameRef.current = true;
                        setEditingTabId(null);
                      }
                    }}
                    onBlur={() => handleSaveRename(tab.id)}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    className="bg-slate-800 text-cyan-200 border border-cyan-500 rounded px-1.5 py-0.5 text-xs font-mono max-w-[140px] sm:max-w-[200px] outline-none"
                    autoFocus
                  />
                ) : (
                  <span
                    className="truncate max-w-[140px] sm:max-w-[200px]"
                    title={tab.title}
                    onDoubleClick={(e) => handleStartRename(tab, e)}
                  >
                    {tab.title}
                  </span>
                )}

                {/* Terminated Badge */}
                {tab.isTerminated && (
                  <span className="text-[9px] font-semibold px-1 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700 font-sans flex-shrink-0">
                    [Terminated]
                  </span>
                )}

                {/* Stream Count Badge if multiplexed */}
                {tab.activeStreams.length > 1 && (
                  <span className="text-[10px] px-1 py-0.2 rounded bg-slate-800 text-slate-300 font-sans">
                    {tab.activeStreams.length}
                  </span>
                )}

                {/* Close Tab Button */}
                <button
                  type="button"
                  onClick={(e) => handleCloseTab(e, tab.id)}
                  onDoubleClick={(e) => e.stopPropagation()}
                  title="Close tab"
                  className="p-0.5 rounded-full text-slate-500 hover:text-rose-400 hover:bg-slate-800/80 transition-colors ml-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Global Window Actions */}
        <div className="flex items-center space-x-1.5 pb-1 flex-shrink-0">
          {onTogglePin && (
            <button
              type="button"
              onClick={onTogglePin}
              title={isPinned ? "Unpin workload" : "Pin workload to sidebar"}
              className={`p-1 rounded transition-colors ${
                isPinned
                  ? "text-amber-400 bg-amber-950/60 border border-amber-800/80"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Pin className={`w-3.5 h-3.5 ${isPinned ? "fill-amber-400" : ""}`} />
            </button>
          )}

          {/* Expand / Minimize Height */}
          <button
            type="button"
            onClick={handleToggleExpand}
            title={
              drawerHeightPx >= Math.round(window.innerHeight * 0.78)
                ? "Restore normal height"
                : "Expand drawer height"
            }
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            {drawerHeightPx >= Math.round(window.innerHeight * 0.78) ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Close Entire Drawer */}
          <button
            type="button"
            onClick={handleCloseAll}
            title="Close log viewer"
            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Active Tab Sub-Toolbar: Multiplexing Controls & Tools */}
      <div className="px-4 py-1.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-2 select-none flex-shrink-0 flex-wrap">
        {/* Left: Stream Context & Multiplexing Chips */}
        <div className="flex items-center space-x-2 min-w-0 py-0.5">
          {/* Status Badge */}
          {activeTab.kind === "Exec" ? (
            activeTab.status === "error" ? (
              <span className="inline-flex items-center space-x-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-700/80">
                <AlertTriangle className="w-3 h-3 text-rose-400" />
                <span>SHELL ERROR</span>
              </span>
            ) : activeTab.status === "ended" ? (
              <span className="inline-flex items-center space-x-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                <span>EXITED</span>
              </span>
            ) : activeTab.status === "live" ? (
              <span className="inline-flex items-center space-x-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>SHELL ACTIVE</span>
              </span>
            ) : (
              <span className="inline-flex items-center space-x-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                <span>CONNECTING</span>
              </span>
            )
          ) : activeTab.isTerminated ? (
            <span className="inline-flex items-center space-x-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              <span>TERMINATED</span>
            </span>
          ) : activeTab.status === "error" ? (
            <span className="inline-flex items-center space-x-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-700/80">
              <AlertTriangle className="w-3 h-3 text-rose-400" />
              <span>ERROR</span>
            </span>
          ) : activeTab.isPrevious ? (
            <span className="inline-flex items-center space-x-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-600/80">
              <History className="w-3 h-3 text-amber-400" />
              <span>PREVIOUS</span>
            </span>
          ) : isAnyStreamLive ? (
            <span className="inline-flex items-center space-x-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>LIVE ({activeTab.activeStreams.length} stream{activeTab.activeStreams.length === 1 ? "" : "s"})</span>
            </span>
          ) : (
            <span className="inline-flex items-center space-x-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              <span>PAUSED</span>
            </span>
          )}

          {/* Container Selector for single-pod or exec session */}
          {(activeTab.kind === "Pod" || activeTab.kind === "Exec") && currentContainers.length > 0 && (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setContainerDropdownOpen(!containerDropdownOpen)}
                className="bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-200 flex items-center space-x-1.5 transition-colors font-mono"
                title="Select container"
              >
                <Box className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                <span className="font-medium text-cyan-300">{selectedContainer || "Select..."}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {containerDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 bg-slate-900 border border-slate-700 rounded shadow-xl z-50 py-1 min-w-[160px]">
                  <div className="px-2 py-1 text-[10px] text-slate-400 uppercase font-semibold border-b border-slate-800">
                    Containers ({currentContainers.length})
                  </div>
                  {currentContainers.map((c) => {
                    const isSelected = c.name === selectedContainer;
                    return (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => {
                          handleSelectContainer(c.name);
                          setContainerDropdownOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center justify-between hover:bg-slate-800 font-mono ${
                          isSelected ? "bg-cyan-950 text-cyan-300 font-medium" : "text-slate-300"
                        }`}
                      >
                        <div className="flex items-center space-x-1.5 truncate">
                          <span>{c.name}</span>
                        </div>
                        {c.ready || c.state?.status === "running" ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Interactive Multiplexed Pod Stream Chips with Remove Button (Log tabs only) */}
          {activeTab.kind !== "Exec" && activeTab.activeStreams.length > 0 && (
            <div className="flex items-center space-x-1.5 overflow-x-auto max-w-[420px] scrollbar-none py-0.5">
              {activeTab.activeStreams.map((stream) => {
                const isHidden = hiddenPods.includes(stream.podName);
                return (
                  <div
                    key={stream.streamId}
                    className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-mono border transition-all ${
                      stream.isTerminated
                        ? "bg-slate-900/60 border-slate-700 text-slate-400"
                        : isHidden
                        ? "bg-slate-900/40 border-slate-800 text-slate-500 line-through opacity-60"
                        : "bg-slate-950/80 border-slate-700 text-slate-200"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => togglePodVisibility(stream.podName)}
                      title={
                        stream.isTerminated
                          ? `Pod ${stream.podName} is terminated`
                          : isHidden
                          ? `Show logs for ${stream.podName}`
                          : `Hide logs for ${stream.podName}`
                      }
                      className="inline-flex items-center space-x-1 cursor-pointer focus:outline-none"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          stream.isTerminated ? "bg-slate-500" : ""
                        }`}
                        style={{ backgroundColor: stream.isTerminated ? undefined : stream.color }}
                      />
                      <span className="truncate max-w-[115px]">{stream.podName}</span>
                      {stream.isTerminated && (
                        <span className="text-[9px] text-slate-400 bg-slate-800 px-1 rounded border border-slate-700 ml-1">
                          [Offline]
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveStream(stream.streamId);
                      }}
                      title={`Remove stream for ${stream.podName}`}
                      className="ml-0.5 text-slate-400 hover:text-rose-400 p-0.5 rounded transition-colors cursor-pointer"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* [+ Stream] Button & Popover (Log tabs only) */}
          {activeTab.kind !== "Exec" && (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setAddStreamOpen((prev) => !prev);
                }}
                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-950/80 hover:bg-cyan-900/90 text-cyan-300 border border-cyan-800 flex items-center space-x-1 transition-colors cursor-pointer shadow-xs"
                title="Add another pod stream to this tab"
              >
                <Plus className="w-3 h-3 text-cyan-400" />
                <span>Stream</span>
              </button>

              <AddStreamPopover
                isOpen={addStreamOpen}
                onClose={() => setAddStreamOpen(false)}
                allPods={allPods || []}
                activeStreams={activeTab.activeStreams}
                activeNamespace={activeTab.namespace}
                onSelectPod={handleAddStream}
              />
            </div>
          )}
        </div>

        {/* Right: Actions */}
        {activeTab.kind === "Exec" ? (
          <div className="flex items-center space-x-2 text-[11px] font-mono text-slate-400">
            <span className="inline-flex items-center space-x-1 text-slate-400">
              <SquareTerminal className="w-3.5 h-3.5 text-emerald-400" />
              <span>PTY Terminal</span>
            </span>
            <span className="text-slate-600">•</span>
            <span>xterm.js</span>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5">
          {/* Search Bar */}
          {isSearchOpen ? (
            <div className="flex items-center bg-slate-950 border border-cyan-500/70 rounded px-2 py-0.5 text-xs space-x-1 shadow-sm">
              <Search className="w-3 h-3 text-cyan-400 flex-shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setActiveMatchIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Find in logs..."
                className="bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none w-28 sm:w-40 font-mono"
              />
              <span className="text-[10px] font-mono text-slate-400 px-1 select-none flex-shrink-0">
                {searchInput.trim() === ""
                  ? ""
                  : totalSearchMatches === 0
                  ? "No matches"
                  : `${activeMatchIndex + 1}/${totalSearchMatches}`}
              </span>
              <button
                type="button"
                onClick={handlePrevMatch}
                disabled={totalSearchMatches === 0}
                title="Previous match (Shift + Enter)"
                className="p-0.5 text-slate-400 hover:text-slate-100 disabled:opacity-30 rounded hover:bg-slate-800"
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={handleNextMatch}
                disabled={totalSearchMatches === 0}
                title="Next match (Enter)"
                className="p-0.5 text-slate-400 hover:text-slate-100 disabled:opacity-30 rounded hover:bg-slate-800"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={handleCloseSearch}
                title="Close search (Esc)"
                className="p-0.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              title="Search logs (Ctrl+F)"
              className="p-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Filter Rules Engine Button */}
          <button
            type="button"
            onClick={() => setFilterModalOpen(true)}
            title="Manage filter rules"
            className={`p-1 rounded text-xs transition-colors border flex items-center space-x-1 ${
              activeTab.filterRules.length > 0
                ? "bg-cyan-950/80 border-cyan-700 text-cyan-300 font-medium"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {activeTab.filterRules.length > 0 && (
              <span className="w-3.5 h-3.5 rounded-full bg-cyan-500 text-slate-950 text-[9px] font-bold flex items-center justify-center">
                {activeTab.filterRules.length}
              </span>
            )}
          </button>

          {/* Pod/Container Prefixes Toggle */}
          <button
            type="button"
            onClick={togglePrefixes}
            title={activeTab.showPrefixes ? "Hide pod prefixes" : "Show pod/container prefixes"}
            className={`px-2 py-0.5 rounded text-xs transition-colors border flex items-center space-x-1 ${
              activeTab.showPrefixes
                ? "bg-cyan-950/80 border-cyan-700 text-cyan-300 font-medium"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <Tag className="w-3 h-3" />
            <span className="hidden sm:inline text-[10px]">Prefixes</span>
          </button>

          {/* Timestamps Toggle */}
          <button
            type="button"
            onClick={() => setShowTimestamps(!showTimestamps)}
            title={showTimestamps ? "Hide timestamps" : "Show timestamps"}
            className={`p-1 rounded text-xs transition-colors border ${
              showTimestamps
                ? "bg-cyan-950/60 border-cyan-800 text-cyan-400"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
          </button>

          {/* Wrap Lines Toggle */}
          <button
            type="button"
            onClick={() => setWrapLines(!wrapLines)}
            title={wrapLines ? "Disable word wrap" : "Enable word wrap"}
            className={`p-1 rounded text-xs transition-colors border ${
              wrapLines
                ? "bg-cyan-950/60 border-cyan-800 text-cyan-400"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <WrapText className="w-3.5 h-3.5" />
          </button>

          {/* Auto-scroll Toggle */}
          <button
            type="button"
            onClick={toggleAutoScroll}
            disabled={activeTab.isPrevious || activeTab.isTerminated}
            title={
              activeTab.isTerminated
                ? "Pod no longer active"
                : activeTab.isPrevious
                ? "Auto-scroll disabled for terminated previous logs"
                : activeTab.autoScroll
                ? "Disable auto-scroll"
                : "Enable auto-scroll"
            }
            className={`px-2 py-0.5 rounded text-xs flex items-center space-x-1 transition-colors border ${
              activeTab.isPrevious || activeTab.isTerminated
                ? "bg-slate-950/60 border-slate-800/60 text-slate-600 cursor-not-allowed opacity-50"
                : activeTab.autoScroll
                ? "bg-emerald-950/60 border-emerald-800 text-emerald-400"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <ArrowDownCircle className="w-3 h-3" />
            <span className="hidden sm:inline text-[10px]">Auto-scroll</span>
          </button>

          {/* Jump to bottom */}
          {!activeTab.autoScroll && visibleLines.length > 0 && (
            <button
              type="button"
              onClick={handleJumpToBottom}
              title="Jump to latest logs and re-enable auto-scroll"
              className="px-2 py-0.5 rounded text-xs flex items-center space-x-1 bg-cyan-950 hover:bg-cyan-900 border border-cyan-700 text-cyan-300 transition-colors animate-pulse"
            >
              <ArrowDownCircle className="w-3 h-3" />
              <span className="hidden sm:inline text-[10px] font-medium">Bottom</span>
            </button>
          )}

          {/* Copy All */}
          <button
            type="button"
            onClick={handleCopyAllLogs}
            title="Copy logs to clipboard"
            className="p-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            {copiedLogs ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Clear logs for active tab */}
          <button
            type="button"
            onClick={handleClearActiveTabLogs}
            title="Clear logs for active tab"
            className="p-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>

      {/* 3. Exec Terminal Sessions (Kept alive in DOM across tab switches) */}
      {tabs
        .filter((t) => t.kind === "Exec")
        .map((t) => (
          <div
            key={t.id}
            className={`flex-1 w-full h-full min-h-0 bg-[var(--terminal-bg)] relative ${
              t.id === activeTabId ? "flex flex-col" : "hidden"
            }`}
          >
            <ExecTerminalView
              namespace={t.namespace}
              podName={t.targetName}
              containerName={activeContainerOverride[t.id] || t.containerName}
              isActive={t.id === activeTabId}
              onStatusChange={(status, errMsg) => handleTabStatusChange(t.id, status, errMsg)}
            />
          </div>
        ))}

      {/* 3. Terminal Multiplexed Output Area (Log tabs) */}
      {activeTab.kind !== "Exec" && (
        <div
          ref={logContainerRef}
          data-log-drawer="true"
          onScroll={handleContainerScroll}
          style={{
            fontFamily: "var(--log-font-family, ui-monospace, monospace)",
            fontSize: "var(--log-font-size, 12px)",
          }}
          className="log-container flex-1 bg-[var(--terminal-bg)] text-slate-100 overflow-y-auto p-3 leading-5 select-text relative"
        >
          {visibleLines.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-xs p-4">
              {activeTab.lines.length === 0 ? (
                activeTab.status === "error" || activeTab.errorMessage ? (
                  <div className="max-w-xl w-full p-4 rounded-lg bg-rose-950/20 border border-rose-900/50 text-left space-y-3 animate-in fade-in duration-150">
                    <div className="flex items-start space-x-2.5">
                      <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="text-rose-400 font-semibold text-xs tracking-wide">
                          [STREAM ERROR] Unable to open log stream for pod {activeTab.namespace}/{activeTab.targetName}:
                        </div>
                        <div
                          style={{
                            fontFamily: "var(--log-font-family, ui-monospace, monospace)",
                            fontSize: "var(--log-font-size, 12px)",
                          }}
                          className="text-slate-300 leading-relaxed break-words bg-black/40 p-2.5 rounded border border-rose-950/80 select-text"
                        >
                          {formatErrorMessage(activeTab.errorMessage)}
                        </div>
                      </div>
                    </div>

                    {(activeTab.isPrevious ||
                      /previous terminated container .* not found/i.test(activeTab.errorMessage || "")) && (
                      <div className="pt-2 border-t border-rose-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="text-amber-300/90 text-[11px] flex items-center space-x-1.5 font-sans">
                          <History className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                          <span>
                            This container has not restarted yet, so no previous execution history is available.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleSwitchToLiveLogs}
                          className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-sans text-xs font-medium flex items-center space-x-1.5 transition-colors shadow-sm shadow-cyan-950/50 cursor-pointer flex-shrink-0"
                        >
                          <Radio className="w-3.5 h-3.5" />
                          <span>Switch to Live Logs</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                    <span>Connecting to log stream session for {activeTab.title}...</span>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center space-y-2">
                  <SlidersHorizontal className="w-5 h-5 text-slate-600" />
                  <span>All {activeTab.lines.length} lines hidden by active filters or pod toggles.</span>
                  <button
                    type="button"
                    onClick={() => setFilterModalOpen(true)}
                    className="text-cyan-400 hover:underline text-xs cursor-pointer"
                  >
                    Adjust filter rules ({activeTab.filterRules.length} configured)
                  </button>
                </div>
              )}
            </div>
          ) : (
            (() => {
              const ROW_HEIGHT = 22;
              const OVERSCAN = 30;
              const totalCount = visibleLines.length;

              const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
              const visibleCount = Math.ceil(
                Math.max(200, drawerHeightPx - 88) / ROW_HEIGHT
              );
              const endIndex = Math.min(totalCount, startIndex + visibleCount + 2 * OVERSCAN);

              let extraTopPadding = 0;
              if (expandedLines.size > 0) {
                for (let i = 0; i < startIndex; i++) {
                  if (expandedLines.has(visibleLines[i]?.id)) {
                    extraTopPadding += 160;
                  }
                }
              }

              const topPadding = startIndex * ROW_HEIGHT + extraTopPadding;
              const bottomPadding = Math.max(0, (totalCount - endIndex) * ROW_HEIGHT);
              const renderedLines = visibleLines.slice(startIndex, endIndex);

              return (
                <div
                  className="space-y-0.5"
                  style={{
                    paddingTop: `${topPadding}px`,
                    paddingBottom: `${bottomPadding}px`,
                  }}
                >
                  {renderedLines.map((entry, localIdx) => {
                    if (entry.isSystemBanner) {
                      return (
                        <div
                          key={entry.id}
                          className="my-2 px-3 py-2.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-xs shadow-xs select-text leading-relaxed"
                        >
                          <div className="text-amber-400 font-semibold mb-0.5 flex items-center space-x-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                            <span>[SYSTEM] Pod "{entry.podName}" terminated / deleted from cluster.</span>
                          </div>
                          <div className="text-amber-300/80 text-[11px]">
                            Log stream disconnected at {entry.timestamp || new Date().toISOString()}.
                          </div>
                        </div>
                      );
                    }

                    const actualIndex = startIndex + localIdx;
                    const isRowActiveMatch = actualIndex === activeMatchRow;
                    const activeOccurrence = isRowActiveMatch ? activeMatchOccurrenceInRow : -1;
                    const tracker = isRowActiveMatch
                      ? { current: 0, activeTarget: activeOccurrence }
                      : undefined;

                    const level = entry.level;
                    const jsonPayload = entry.isJson
                      ? extractJsonPayload(entry.raw ?? entry.line)
                      : null;
                    const isExpanded = expandedLines.has(entry.id);

                    return (
                      <div
                        key={entry.id}
                        className={`flex flex-col px-1.5 py-0.5 rounded transition-colors border-l-2 ${
                          level === "ERROR"
                            ? "bg-rose-950/25 hover:bg-rose-950/35 border-rose-500/80"
                            : level === "WARN"
                            ? "bg-amber-950/15 hover:bg-amber-950/25 border-amber-500/80"
                            : "hover:bg-slate-900/60 border-transparent"
                        }`}
                      >
                        <div
                          className={`flex items-start ${
                            wrapLines ? "break-all whitespace-pre-wrap" : "whitespace-pre"
                          }`}
                        >
                          {/* Colored Pod/Container Prefix Tag */}
                          {activeTab.showPrefixes && (
                            <span
                              className="select-none mr-2 font-bold flex-shrink-0"
                              style={{
                                color: entry.color,
                                fontSize: "calc(var(--log-font-size, 12px) - 1px)",
                              }}
                            >
                              [{entry.podName}{entry.containerName ? `/${entry.containerName}` : ""}]
                            </span>
                          )}

                          {/* Timestamps */}
                          {showTimestamps && entry.timestamp && (
                            <span
                              className="text-zinc-500 select-none mr-3 flex-shrink-0"
                              style={{
                                fontFamily: "var(--log-font-family, ui-monospace, monospace)",
                                fontSize: "calc(var(--log-font-size, 12px) - 1px)",
                              }}
                            >
                              {entry.timestamp}
                            </span>
                          )}

                          {/* Inline Expand Toggle for JSON Payload */}
                          {jsonPayload && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleLineExpanded(entry.id);
                              }}
                              title={isExpanded ? "Collapse JSON payload" : "Pretty-print JSON payload"}
                              className={`inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[10px] font-mono select-none flex-shrink-0 mr-1.5 transition-colors cursor-pointer border ${
                                isExpanded
                                  ? "bg-cyan-950 text-cyan-300 border-cyan-700 shadow-xs"
                                  : "bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-cyan-300 border-slate-700/80"
                              }`}
                            >
                              <Braces className="w-2.5 h-2.5" />
                              <span>{isExpanded ? "collapse" : "{}"}</span>
                            </button>
                          )}

                          {/* Log Line Payload */}
                          <div className="flex-1 min-w-0">
                            {renderLogLineContent(entry, jsonPayload, level, isExpanded, tracker)}
                          </div>
                        </div>

                        {/* Expanded Formatted JSON View */}
                        {jsonPayload && isExpanded && (
                          <div className="mt-1.5 mb-1 ml-4 p-2 rounded bg-slate-950/90 border border-slate-800/90 font-mono text-xs select-text shadow-lg">
                            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800/80 text-[10px] text-slate-400">
                              <div className="flex items-center space-x-1.5 font-medium text-slate-300">
                                <Braces className="w-3.5 h-3.5 text-cyan-400" />
                                <span>Formatted JSON</span>
                                <span className="text-slate-500">
                                  ({typeof jsonPayload.parsed === "object" && jsonPayload.parsed ? Object.keys(jsonPayload.parsed).length : 0} fields)
                                </span>
                              </div>
                              <div className="flex items-center space-x-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyJson(entry.id, JSON.stringify(jsonPayload.parsed, null, 2));
                                  }}
                                  title="Copy JSON to clipboard"
                                  className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white transition-colors cursor-pointer"
                                >
                                  {copiedJsonLineId === entry.id ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-400" />
                                      <span className="text-emerald-300 font-medium">Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>Copy JSON</span>
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleLineExpanded(entry.id);
                                  }}
                                  title="Collapse formatted view"
                                  className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Indentation guide and formatted syntax highlighted code */}
                            <div className="pl-3 border-l-2 border-cyan-500/30 overflow-x-auto space-y-0.5 font-mono text-xs leading-relaxed">
                              {renderFormattedJsonCode(
                                jsonPayload.parsed,
                                isSearchOpen ? deferredQuery.trim().toLowerCase() : "",
                                tracker
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {activeTab.status === "error" && activeTab.errorMessage && (
                    <div
                      style={{
                        fontFamily: "var(--log-font-family, ui-monospace, monospace)",
                        fontSize: "var(--log-font-size, 12px)",
                      }}
                      className="mt-2 p-2 rounded bg-rose-950/40 border border-rose-800/80 text-rose-300 flex items-center space-x-2"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                      <span>[STREAM ERROR] {formatErrorMessage(activeTab.errorMessage)}</span>
                    </div>
                  )}
                  <div ref={bottomAnchorRef} />
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* 4. Drawer Footer Status Bar */}
      <div className="px-4 py-1.5 bg-slate-900 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-3">
          {activeTab.kind === "Exec" ? (
            <div>
              <span className="text-slate-400 font-mono">
                Pod: <strong className="text-slate-200">{activeTab.targetName}</strong>
              </span>
              <span className="text-slate-500 mx-2">•</span>
              <span className="text-slate-400 font-mono">
                Container: <strong className="text-cyan-300">{activeContainerOverride[activeTab.id] || activeTab.containerName || "default"}</strong>
              </span>
            </div>
          ) : (
            <>
              <div>
                <span>Lines: </span>
                <span className="text-slate-200 font-mono">{visibleLines.length}</span>
                {activeTab.lines.length !== visibleLines.length && (
                  <span className="text-slate-500">
                    {" "}
                    (filtered from {activeTab.lines.length})
                  </span>
                )}
              </div>
              {isSearchOpen && searchInput.trim() !== "" && (
                <div className="text-cyan-400">
                  Matches: <span className="font-mono">{totalSearchMatches}</span>
                </div>
              )}
              {!activeTab.autoScroll && visibleLines.length > 0 && (
                <button
                  type="button"
                  onClick={handleJumpToBottom}
                  className="text-cyan-400 hover:text-cyan-300 underline font-medium cursor-pointer"
                >
                  ↓ Jump to bottom
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex items-center space-x-3">
          {activeTab.kind === "Exec" ? (
            <span className="text-slate-400">
              Press <kbd className="px-1 py-0.2 rounded bg-slate-800 text-slate-300 font-mono text-[9px]">Ctrl+D</kbd> or type <code className="text-cyan-300 font-mono">exit</code> to disconnect
            </span>
          ) : (
            <>
              <span>
                Target: <span className="text-slate-300 font-mono">{activeTab.targetName}</span>
              </span>
              <span>
                Namespace: <span className="text-cyan-400 font-mono">{activeTab.namespace}</span>
              </span>
              <span className="text-slate-500">
                Tabs: <span className="text-slate-300 font-mono">{tabs.length}</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* Log Filter Engine Modal */}
      <LogFilterModal
        isOpen={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        rules={activeTab.filterRules}
        onAddRule={(type, pattern) => {
          const newRule: FilterRule = {
            id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type,
            pattern,
            active: true,
          };
          updateActiveTab((t) => ({ ...t, filterRules: [...t.filterRules, newRule] }));
        }}
        onUpdateRule={(id, updates) => {
          updateActiveTab((t) => ({
            ...t,
            filterRules: t.filterRules.map((r) => (r.id === id ? { ...r, ...updates } : r)),
          }));
        }}
        onToggleRule={(id) => {
          updateActiveTab((t) => ({
            ...t,
            filterRules: t.filterRules.map((r) => (r.id === id ? { ...r, active: !r.active } : r)),
          }));
        }}
        onDeleteRule={(id) => {
          updateActiveTab((t) => ({
            ...t,
            filterRules: t.filterRules.filter((r) => r.id !== id),
          }));
        }}
        onClearRules={() => {
          updateActiveTab((t) => ({ ...t, filterRules: [] }));
        }}
      />
    </div>
  );
};
