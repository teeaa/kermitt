import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Sidebar } from "./components/Layout/Sidebar";
import { TopBar } from "./components/Layout/TopBar";
import { PodTable } from "./components/Workloads/PodTable";
import { LogDrawer } from "./components/Logs/LogDrawer";
import { PinCustomizeModal } from "./components/Pins/PinCustomizeModal";
import { SettingsModal } from "./components/Settings/SettingsModal";
import { PodDetailsModal } from "./components/Workloads/PodDetailsModal";
import { JobsView } from "./components/Workloads/JobsView";
import { DeploymentsView } from "./components/Workloads/DeploymentsView";
import { StatefulSetsView } from "./components/Workloads/StatefulSetsView";
import { ConfirmDialog } from "./components/Common/ConfirmDialog";
import { ErrorBoundary } from "./components/Common/ErrorBoundary";
import { ErrorAlert } from "./components/Common/ErrorAlert";
import { AppLogsModal } from "./components/Common/AppLogsModal";
import { AboutModal } from "./components/Common/AboutModal";
import { NodesView } from "./components/Cluster/NodesView";
import { ServicesIngressView } from "./components/Cluster/ServicesIngressView";
import { ConfigMapsSecretsView } from "./components/Cluster/ConfigMapsSecretsView";
import { reportApiError } from "./hooks/useNotificationStore";
import { usePinnedItems, PinnedItem } from "./hooks/usePinnedItems";
import { useQuickTools, QuickToolId } from "./hooks/useQuickTools";
import { useTheme } from "./hooks/useTheme";
import { clusterStore } from "./hooks/useClusterStore";
import { workloadsStore } from "./hooks/useWorkloadsStore";
import { kubeApi } from "./services/kubeApi";
import { ipc } from "../wailsjs/go/models";
import { EventsOn } from "../wailsjs/runtime/runtime";
import {
  AlertCircle,
  Server,
  Settings,
  CheckCircle2,
  PanelLeftOpen,
} from "lucide-react";

export function App() {
  // Theme management hook (applies CSS variables to document root)
  useTheme();

  // Quick tools configuration hook
  const { enabledTools } = useQuickTools();

  // Collapsible sidebar state
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("kermitt:sidebar-open");
      return stored !== null ? JSON.parse(stored) : true;
    } catch {
      return true;
    }
  });

  const setSidebarOpenPersisted = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setSidebarOpen((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        try {
          localStorage.setItem("kermitt:sidebar-open", JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    []
  );

  const toggleSidebar = useCallback(() => {
    setSidebarOpenPersisted((prev) => !prev);
  }, [setSidebarOpenPersisted]);

  const openSidebar = useCallback(() => {
    setSidebarOpenPersisted(true);
  }, [setSidebarOpenPersisted]);

  // Keyboard shortcut for toggling sidebar (Cmd+B or Ctrl+B)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  // Pinned items hook
  const {
    pinnedItems,
    addPin,
    updatePin,
    deletePin,
    isPinned,
    togglePin,
  } = usePinnedItems();

  const [editingPin, setEditingPin] = useState<PinnedItem | null>(null);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  // Settings modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Active Workload Resource View ("pods" | "deployments" | "statefulsets" | "jobs" | "cronjobs" | "nodes" | "services" | "configmaps")
  const [activeResource, setActiveResource] = useState<
    "pods" | "deployments" | "statefulsets" | "jobs" | "cronjobs" | "nodes" | "services" | "configmaps"
  >("pods");

  // Dynamic cluster and config resource counts
  const [clusterConfigCounts, setClusterConfigCounts] = useState<{
    nodeCount: number;
    serviceCount: number;
    ingressCount: number;
    configMapCount: number;
    secretCount: number;
  }>({
    nodeCount: 0,
    serviceCount: 0,
    ingressCount: 0,
    configMapCount: 0,
    secretCount: 0,
  });

  // Pod inspect details modal state
  const [detailsPod, setDetailsPod] = useState<ipc.PodSummary | null>(null);
  const [detailsInitialTab, setDetailsInitialTab] = useState<
    "containers" | "metadata" | "resources" | "events" | "yaml"
  >("containers");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Destructive action confirmation dialog state
  const [confirmAction, setConfirmAction] = useState<{
    type: "kill" | "restart";
    pod: ipc.PodSummary;
  } | null>(null);
  const [isForceTermination, setIsForceTermination] = useState(false);
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);

  // User feedback toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Global cluster state
  const [contexts, setContexts] = useState<ipc.KubeContext[]>([]);
  const [activeContext, setActiveContext] = useState<string>("");
  const [namespaces, setNamespaces] = useState<ipc.Namespace[]>([]);
  const [activeNamespace, setActiveNamespace] = useState<string>("all");
  const [clusterOverview, setClusterOverview] = useState<ipc.ClusterOverview | null>(null);
  const [clusterHealthInfo, setClusterHealthInfo] = useState<ipc.ClusterHealthInfo | null>(null);
  const [isContextsLoading, setIsContextsLoading] = useState<boolean>(true);
  const [isNamespacesLoading, setIsNamespacesLoading] = useState<boolean>(true);
  const hasBootstrapped = useRef(false);

  // Pods state
  const [pods, setPods] = useState<ipc.PodSummary[]>([]);
  const [loadingPods, setLoadingPods] = useState<boolean>(false);
  const [loadingContext, setLoadingContext] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [podSearchTerm, setPodSearchTerm] = useState<string>("");

  // Selected pod, controller workload, or multi-selected pods for log drawer
  const [selectedPod, setSelectedPod] = useState<ipc.PodSummary | null>(null);
  const [selectedPodIsPrevious, setSelectedPodIsPrevious] = useState<boolean>(false);
  const [selectedWorkload, setSelectedWorkload] = useState<{ kind: string; name: string; namespace: string } | null>(null);
  const [combinedPods, setCombinedPods] = useState<ipc.PodSummary[] | null>(null);
  const [execTarget, setExecTarget] = useState<{ pod: ipc.PodSummary; timestamp: number } | null>(null);

  // Dynamic live workload counts
  const livePodCount = pods.length;
  const [liveDeploymentCount, setLiveDeploymentCount] = useState<number>(0);
  const [liveStatefulSetCount, setLiveStatefulSetCount] = useState<number>(0);
  const [liveJobCount, setLiveJobCount] = useState<number>(0);
  const [liveCronJobCount, setLiveCronJobCount] = useState<number>(0);

  // Zoom scaling state (persisted to localStorage, clamped to 0.80x - 1.30x)
  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("kermitt:zoom-level");
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0.8 && parsed <= 1.3) {
          return parsed;
        }
      }
    } catch {}
    return 1.0;
  });

  // Keep --app-zoom CSS variable on documentElement in sync
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty("--app-zoom", String(zoomLevel));
    }
  }, [zoomLevel]);

  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) => {
      const next = Math.min(Number((prev + 0.05).toFixed(2)), 1.3);
      localStorage.setItem("kermitt:zoom-level", String(next));
      return next;
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => {
      const next = Math.max(Number((prev - 0.05).toFixed(2)), 0.8);
      localStorage.setItem("kermitt:zoom-level", String(next));
      return next;
    });
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoomLevel(1.0);
    localStorage.setItem("kermitt:zoom-level", "1.0");
  }, []);

  // Globally suppress native browser webview context menus (Reload, Inspect Element)
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      // Allow custom app context menus to handle their own popups,
      // but completely suppress default browser context menus (Reload, Inspect)
      e.preventDefault();
    };

    window.addEventListener("contextmenu", handleContextMenu);
    return () => window.removeEventListener("contextmenu", handleContextMenu);
  }, []);

  // Application logs modal state
  const [isAppLogsOpen, setIsAppLogsOpen] = useState<boolean>(false);

  // About Kermitt modal state
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);

  // Wails runtime native menu events & global keyboard shortcuts
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    try {
      if (typeof window !== "undefined" && (window as any).runtime) {
        unsubs.push(EventsOn("menu:open-settings", () => setIsSettingsOpen(true)));
        unsubs.push(EventsOn("menu:open-about", () => setIsAboutOpen(true)));
        unsubs.push(
          EventsOn("menu:toggle-devtools", () => {
            if ((window as any).WailsInvoke) {
              (window as any).WailsInvoke("wails:openInspector");
            }
          })
        );
        unsubs.push(EventsOn("menu:zoom-in", handleZoomIn));
        unsubs.push(EventsOn("menu:zoom-out", handleZoomOut));
        unsubs.push(EventsOn("menu:zoom-reset", handleZoomReset));
        unsubs.push(EventsOn("menu:open-app-logs", () => setIsAppLogsOpen(true)));
      }
    } catch (e) {
      console.warn("[APP] Could not bind Wails menu events:", e);
    }

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // DevTools toggle shortcut: Cmd+Option+I (macOS) or Ctrl+Shift+I (Windows/Linux)
      if (
        (e.metaKey && e.altKey && e.key.toLowerCase() === "i") ||
        (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "i")
      ) {
        e.preventDefault();
        if ((window as any).WailsInvoke) {
          (window as any).WailsInvoke("wails:openInspector");
        }
        return;
      }

      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (!isCmdOrCtrl) return;

      if (e.key === "," || e.key === "<") {
        e.preventDefault();
        setIsSettingsOpen(true);
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        handleZoomReset();
      } else if (e.key.toLowerCase() === "l") {
        e.preventDefault();
        setIsAppLogsOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);

    return () => {
      unsubs.forEach((unsub) => unsub && unsub());
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [handleZoomIn, handleZoomOut, handleZoomReset]);

  // Fetch live workload counts for sidebar badge counters
  const fetchWorkloadCounts = useCallback(async () => {
    if (!activeContext) {
      setLiveDeploymentCount(0);
      setLiveStatefulSetCount(0);
      setLiveJobCount(0);
      setLiveCronJobCount(0);
      return;
    }

    try {
      const [deps, stss, jobs, cronjobs] = await Promise.all([
        kubeApi.getDeployments(activeNamespace).catch(() => []),
        kubeApi.getStatefulSets(activeNamespace).catch(() => []),
        kubeApi.getJobs(activeNamespace).catch(() => []),
        kubeApi.getCronJobs(activeNamespace).catch(() => []),
      ]);
      setLiveDeploymentCount(Array.isArray(deps) ? deps.length : 0);
      setLiveStatefulSetCount(Array.isArray(stss) ? stss.length : 0);
      setLiveJobCount(Array.isArray(jobs) ? jobs.length : 0);
      setLiveCronJobCount(Array.isArray(cronjobs) ? cronjobs.length : 0);
    } catch (err) {
      console.error("[APP] Error fetching workload counts:", err);
    }
  }, [activeContext, activeNamespace]);

  useEffect(() => {
    fetchWorkloadCounts();
  }, [fetchWorkloadCounts]);

  // Live cluster health status
  const clusterHealth = useMemo(() => {
    const isConnected = !!activeContext && !errorMessage && !loadingContext;
    if (!isConnected) {
      return {
        running: 0,
        pending: 0,
        issues: 0,
        isConnected: false,
        connectionError: errorMessage || "Disconnected from cluster",
      };
    }

    let running = 0;
    let pending = 0;
    let issues = 0;

    if (pods.length > 0) {
      pods.forEach((p) => {
        const s = (p.status || "").toLowerCase();
        if (s === "running" || s === "completed" || s === "succeeded") {
          running++;
        } else if (s === "pending" || s === "containercreating") {
          pending++;
        } else {
          issues++;
        }
      });
    } else if (clusterOverview) {
      running = clusterOverview.runningPods;
      pending = clusterOverview.pendingPods;
      issues = clusterOverview.failedPods;
    }

    return {
      running,
      pending,
      issues,
      isConnected: true,
    };
  }, [activeContext, errorMessage, loadingContext, pods, clusterOverview]);

  // Switch to pods view and filter by workload name
  const handleShowWorkloadPods = useCallback((workloadName: string, namespace: string) => {
    setActiveResource("pods");
    if (namespace && namespace !== "all") {
      setActiveNamespace(namespace);
    }
    const cleanPrefix = workloadName.split("-")[0] || workloadName;
    setPodSearchTerm(cleanPrefix);
    setToastMessage(`Filtered pods for: ${workloadName}`);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // Handler: Change active namespace with state logging and backend IPC sync
  const handleSelectNamespace = useCallback(async (ns: string) => {
    console.debug("[STATE] Active namespace switched to:", ns);
    setActiveNamespace(ns);
    try {
      await kubeApi.setNamespace(ns);
    } catch (err) {
      console.warn("[APP] Error syncing active namespace with backend:", err);
    }
  }, []);

  // Handler: Manual refresh namespaces (fallback when dropdown opened and empty)
  const handleRefreshNamespaces = useCallback(async () => {
    setIsNamespacesLoading(true);
    try {
      const nsList = await kubeApi.getNamespaces();
      if (Array.isArray(nsList) && nsList.length > 0) {
        setNamespaces(nsList);
        clusterStore.setNamespaces(nsList);
      }
    } catch (err) {
      console.warn("[APP] Manual getNamespaces failed:", err);
    } finally {
      setIsNamespacesLoading(false);
    }
  }, []);

  // ==========================================================================
  // Two-Phase Decoupled Startup Architecture
  // ==========================================================================

  // Phase 1: Critical Path (<300ms) - Instantly paints UI with active pods
  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      try {
        console.debug("[STARTUP] Executing Phase 1 Critical Path");
        const start = performance.now();
        const initialState = await kubeApi.getInitialState();
        const elapsed = performance.now() - start;
        console.debug(`[STARTUP] Phase 1 completed in ${elapsed.toFixed(1)}ms:`, initialState);

        if (!isMounted) return;

        if (initialState) {
          const initialCtx = initialState.activeContext || "";
          const initialNs = initialState.activeNamespace || "default";
          const initialPods = Array.isArray(initialState.pods) ? initialState.pods : [];

          setActiveContext(initialCtx);
          setActiveNamespace(initialNs);
          setPods(initialPods);
          setLoadingPods(false);
          setLoadingContext(false);

          clusterStore.setInitialBootstrap(initialCtx, initialNs);
          workloadsStore.setInitialPods(initialPods);
          hasBootstrapped.current = true;

          // Background fallback queries for namespaces and contexts
          // Ensures UI populates even if Wails runtime event fired before React mounted listener
          kubeApi.getNamespaces().then((nsList) => {
            if (!isMounted) return;
            const safeList = Array.isArray(nsList) ? nsList : [];
            if (safeList.length > 0) {
              setNamespaces(safeList);
              clusterStore.setNamespaces(safeList);
            }
            setIsNamespacesLoading(false);
          }).catch((err) => {
            console.warn("[STARTUP] Background getNamespaces fallback failed:", err);
            if (isMounted) setIsNamespacesLoading(false);
          });

          kubeApi.getContexts().then((ctxList) => {
            if (!isMounted) return;
            const safeList = Array.isArray(ctxList) ? ctxList : [];
            if (safeList.length > 0) {
              setContexts(safeList);
              clusterStore.setContexts(safeList);
            }
            setIsContextsLoading(false);
          }).catch((err) => {
            console.warn("[STARTUP] Background getContexts fallback failed:", err);
            if (isMounted) setIsContextsLoading(false);
          });
        }
      } catch (err: any) {
        console.error("[STARTUP] Fast path bootstrap failed:", err);
        setErrorMessage(err?.message || "Failed to initialize Kubernetes connection");
      }
    }

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, []);

  // Phase 2: Background Warm-Up Event Subscriptions
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    // 1. Contexts ready
    unsubs.push(
      kubeApi.subscribeToContextsReady((ctxList) => {
        console.debug("[PHASE-2] Received contexts ready event:", ctxList.length);
        const safeList = Array.isArray(ctxList) ? ctxList : [];
        setContexts(safeList);
        clusterStore.setContexts(safeList);
        setIsContextsLoading(false);
      })
    );

    // 2. Namespaces ready
    unsubs.push(
      kubeApi.subscribeToNamespacesReady((nsList) => {
        console.debug("[PHASE-2] Received namespaces ready event:", nsList.length);
        const safeList = Array.isArray(nsList) ? nsList : [];
        const formattedNamespaces = safeList.map((ns) => {
          if (typeof ns === "string") {
            return new ipc.Namespace({
              name: ns,
              status: "Active",
              age: "-",
              createdAt: new Date(),
            });
          }
          return ns;
        });
        setNamespaces(formattedNamespaces);
        clusterStore.setNamespaces(formattedNamespaces);
        setIsNamespacesLoading(false);
      })
    );

    // 3. Sidebar counts updated
    unsubs.push(
      kubeApi.subscribeToSidebarCounts((counts) => {
        console.debug("[PHASE-2] Received sidebar counts updated event:", counts);
        workloadsStore.updateCounts(counts);

        if (typeof counts.deployments === "number") setLiveDeploymentCount(counts.deployments);
        if (typeof counts.statefulsets === "number") setLiveStatefulSetCount(counts.statefulsets);
        if (typeof counts.jobs === "number") setLiveJobCount(counts.jobs);
        if (typeof counts.cronjobs === "number") setLiveCronJobCount(counts.cronjobs);

        setClusterConfigCounts((prev) => ({
          nodeCount: typeof counts.nodes === "number" ? counts.nodes : prev.nodeCount,
          serviceCount: typeof counts.services === "number" ? counts.services : prev.serviceCount,
          ingressCount: typeof counts.ingresses === "number" ? counts.ingresses : prev.ingressCount,
          configMapCount: typeof counts.configMapCount === "number" ? counts.configMapCount : prev.configMapCount,
          secretCount: typeof counts.secretCount === "number" ? counts.secretCount : prev.secretCount,
        }));
      })
    );

    return () => {
      unsubs.forEach((unsub) => unsub && unsub());
    };
  }, []);

  // Lazy background telemetry & health query (non-blocking)
  useEffect(() => {
    if (!activeContext) return;
    let isMounted = true;

    async function loadTelemetry() {
      try {
        const [overview, healthInfo] = await Promise.all([
          kubeApi.getClusterOverview().catch(() => null),
          kubeApi.getClusterHealthInfo().catch(() => null),
        ]);
        if (isMounted) {
          if (overview) setClusterOverview(overview);
          if (healthInfo) setClusterHealthInfo(healthInfo);
        }
      } catch (err: any) {
        console.warn("[APP] Non-critical background telemetry fetch failed:", err);
      }
    }

    loadTelemetry();

    return () => {
      isMounted = false;
    };
  }, [activeContext]);

  // Fetch pods whenever activeContext or activeNamespace changes after bootstrap
  const refreshPods = useCallback(async () => {
    if (!activeContext) return;
    setLoadingPods(true);
    setErrorMessage(null);
    try {
      const podList = await kubeApi.getPods(activeNamespace);
      const safePods = Array.isArray(podList) ? podList : [];
      setPods(safePods);
      workloadsStore.setPods(safePods);
    } catch (err: any) {
      console.error("[APP] Failed to retrieve pods from cluster:", err);
      setPods([]);
      reportApiError(err, "pods", activeNamespace);
      setErrorMessage(err?.message || "Failed to retrieve pods from cluster");
    } finally {
      setLoadingPods(false);
    }
  }, [activeContext, activeNamespace]);

  useEffect(() => {
    if (!hasBootstrapped.current) {
      return;
    }
    refreshPods();
  }, [activeContext, activeNamespace, refreshPods]);

  // Fetch cluster and config counts (nodes, services, ingresses, configmaps, secrets)
  const refreshClusterConfigCounts = useCallback(async () => {
    if (!activeContext) return;
    try {
      const counts = await kubeApi.getClusterConfigCounts(activeNamespace);
      if (counts) {
        setClusterConfigCounts({
          nodeCount: counts.nodeCount || 0,
          serviceCount: counts.serviceCount || 0,
          ingressCount: counts.ingressCount || 0,
          configMapCount: counts.configMapCount || 0,
          secretCount: counts.secretCount || 0,
        });
      }
    } catch (err) {
      console.warn("[APP] Failed to fetch cluster config counts:", err);
    }
  }, [activeContext, activeNamespace]);

  useEffect(() => {
    if (!hasBootstrapped.current) {
      return;
    }
    refreshClusterConfigCounts();
  }, [refreshClusterConfigCounts]);

  // Handler: Switch Context
  const handleSwitchContext = async (contextName: string) => {
    console.debug("[STATE] Active context switched to:", contextName);
    setSelectedPod(null);
    setSelectedWorkload(null);
    setCombinedPods(null);
    setIsContextsLoading(true);
    setIsNamespacesLoading(true);
    workloadsStore.clearCache();

    setLoadingContext(true);
    try {
      await kubeApi.switchContext(contextName);
      setActiveContext(contextName);
      setActiveNamespace("all");
      const [ctxList, nsList, overview, healthInfo] = await Promise.all([
        kubeApi.getContexts(),
        kubeApi.getNamespaces().catch(() => []),
        kubeApi.getClusterOverview().catch(() => null),
        kubeApi.getClusterHealthInfo().catch(() => null),
      ]);
      setContexts(Array.isArray(ctxList) ? ctxList : []);
      setNamespaces(Array.isArray(nsList) ? nsList : []);
      setClusterOverview(overview ?? null);
      setClusterHealthInfo(healthInfo ?? null);
      setIsContextsLoading(false);
      setIsNamespacesLoading(false);
    } catch (err: any) {
      console.error("[APP] Failed to switch context:", err);
      setErrorMessage(err?.message || `Failed to switch context to ${contextName}`);
    } finally {
      setLoadingContext(false);
    }
  };

  // Subscribe to real-time cluster state updates (via backend client-go Informers)
  useEffect(() => {
    if (!activeContext) return;

    const unsubRefresh = kubeApi.subscribeToClusterRefresh(() => {
      refreshPods();
      refreshClusterConfigCounts();
      fetchWorkloadCounts();
      kubeApi.getClusterOverview().then((o) => setClusterOverview(o ?? null)).catch(() => {});
      kubeApi.getClusterHealthInfo().then((h) => setClusterHealthInfo(h ?? null)).catch(() => {});
    });

    const unsubResource = kubeApi.subscribeToResourceChanges((event) => {
      if (event.resourceType === "namespace") {
        kubeApi.getNamespaces().then((list) => setNamespaces(Array.isArray(list) ? list : [])).catch(() => {});
      }
    });

    return () => {
      unsubRefresh();
      unsubResource();
    };
  }, [activeContext, refreshPods, refreshClusterConfigCounts, fetchWorkloadCounts]);

  // Handler: Select Pod (opens Log Drawer)
  const handleSelectPod = useCallback((pod: ipc.PodSummary, previous = false) => {
    setSelectedPod(pod);
    setSelectedPodIsPrevious(previous);
    setSelectedWorkload(null);
    setCombinedPods(null);
  }, []);

  // Handler: Select Controller Workload (opens multiplexed Log Drawer)
  const handleViewWorkloadLogs = useCallback((kind: string, name: string, namespace: string) => {
    setSelectedWorkload({ kind, name, namespace });
    setSelectedPod(null);
    setCombinedPods(null);
  }, []);

  // Handler: View Combined Logs for multiple pods (opens single multiplexed Log Drawer tab)
  const handleViewCombinedLogs = useCallback((podsToCombine: ipc.PodSummary[]) => {
    if (!podsToCombine || podsToCombine.length === 0) return;
    setCombinedPods(podsToCombine);
    setSelectedPod(null);
    setSelectedWorkload(null);
  }, []);

  // Handler: Open Exec Terminal for Pod
  const handleOpenExec = useCallback((pod: ipc.PodSummary) => {
    setExecTarget({ pod, timestamp: Date.now() });
  }, []);

  // Handler: Close Log Drawer
  const handleCloseDrawer = useCallback(() => {
    setSelectedPod(null);
    setSelectedPodIsPrevious(false);
    setSelectedWorkload(null);
    setCombinedPods(null);
    setExecTarget(null);
  }, []);

  // Handler: Click Pinned Item (Switches context, namespace, and filters pods)
  const handleSelectPin = async (pin: PinnedItem) => {
    if (pin.context && pin.context !== activeContext) {
      await handleSwitchContext(pin.context);
    }
    if (pin.namespace) {
      setActiveNamespace(pin.namespace);
    }
    if (pin.podPattern) {
      setPodSearchTerm(pin.podPattern);
    }
  };

  const handleEditPin = (pin: PinnedItem) => {
    setEditingPin(pin);
    setIsPinModalOpen(true);
  };

  const handleCreateCustomPin = () => {
    const newPin = addPin({
      label: "Custom Workload",
      emoji: "⭐",
      color: "amber",
      context: activeContext || "default",
      namespace: activeNamespace === "all" ? "default" : activeNamespace,
      podPattern: "*",
    });
    setEditingPin(newPin);
    setIsPinModalOpen(true);
  };

  const isPodCurrentlyPinned = useCallback(
    (podName: string) => {
      return isPinned(activeContext, activeNamespace, podName);
    },
    [isPinned, activeContext, activeNamespace]
  );

  const handleTogglePodPin = useCallback(
    (pod: ipc.PodSummary) => {
      togglePin(activeContext, pod.namespace, pod.name);
    },
    [togglePin, activeContext]
  );

  // Quick Tools Execution Router
  const handleExecuteQuickTool = (toolId: QuickToolId, pod: ipc.PodSummary) => {
    switch (toolId) {
      case "logs":
        handleSelectPod(pod);
        break;
      case "details":
        setDetailsPod(pod);
        setIsDetailsOpen(true);
        break;
      case "exec":
        handleOpenExec(pod);
        break;
      case "restart":
        setConfirmAction({ type: "restart", pod });
        break;
      case "kill":
        setIsForceTermination(false);
        setConfirmAction({ type: "kill", pod });
        break;
    }
  };

  // Execute Confirmed Destructive Action
  const handleConfirmDestructiveAction = async () => {
    if (!confirmAction) return;
    const { type, pod } = confirmAction;
    setIsActionSubmitting(true);

    try {
      if (type === "kill") {
        await kubeApi.deletePod(pod.namespace, pod.name, isForceTermination ? 0 : undefined);
        setToastMessage(`Pod ${pod.name} terminated${isForceTermination ? " (forced)" : ""}.`);
        setPods((prev) => prev.filter((p) => p.name !== pod.name));
      } else if (type === "restart") {
        await kubeApi.restartPod(pod.namespace, pod.name);
        setToastMessage(`Pod ${pod.name} restarted. Replacement pod spinning up.`);
      }
      setConfirmAction(null);
      // Immediately trigger a pod list refresh, followed by a delayed re-fetch after 1.5s
      refreshPods();
      setTimeout(() => {
        refreshPods();
      }, 1500);
    } catch (err: any) {
      console.error("[ACTION-ERR] Failed to execute pod action:", err);
      const errMsg = err?.message || String(err) || "Unknown error";
      reportApiError(err, type, pod.namespace);
      setErrorMessage(`Action failed on pod "${pod.name}": ${errMsg}`);
      setToastMessage(`Action failed: ${errMsg}`);
    } finally {
      setIsActionSubmitting(false);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  // View logs for Job / CronJob pod instance (queries live cluster for latest pod)
  const handleViewJobLogs = async (jobName: string, namespace: string, previous = false) => {
    const existingPod = pods.find(
      (p) => p.namespace === namespace && (p.name.startsWith(jobName) || p.name.includes(jobName))
    );
    if (existingPod) {
      handleSelectPod(existingPod, previous);
      return;
    }

    try {
      const jobPod = await kubeApi.getJobLatestPod(namespace, jobName);
      if (jobPod) {
        handleSelectPod(jobPod, previous);
        return;
      }
    } catch (err) {
      console.warn("[APP] Could not resolve live pod for job:", err);
    }

    setToastMessage(`No active or completed pods found for job "${jobName}".`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  return (
    <div
      className="flex h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden antialiased select-none"
    >
      {/* 1. Collapsible Sidebar navigation */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggleOpen={toggleSidebar}
        activeContext={activeContext}
        activeNamespace={activeNamespace}
        clusterOverview={clusterOverview}
        pinnedItems={pinnedItems}
        onSelectPin={handleSelectPin}
        onEditPin={handleEditPin}
        onDeletePin={deletePin}
        onCreatePin={handleCreateCustomPin}
        activeResource={activeResource}
        onSelectResource={(res) => setActiveResource(res as any)}
        podCount={livePodCount}
        deploymentCount={liveDeploymentCount}
        statefulSetCount={liveStatefulSetCount}
        jobCount={liveJobCount}
        cronJobCount={liveCronJobCount}
        nodeCount={clusterConfigCounts.nodeCount}
        servicesIngressCount={clusterConfigCounts.serviceCount + clusterConfigCounts.ingressCount}
        configMapsSecretsCount={clusterConfigCounts.configMapCount + clusterConfigCounts.secretCount}
      />

      {/* 2. Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden transition-all duration-300 ease-in-out">
        {/* Top Application Header */}
        <TopBar
          sidebarOpen={sidebarOpen}
          onOpenSidebar={openSidebar}
          contexts={contexts}
          activeContext={activeContext}
          onSwitchContext={handleSwitchContext}
          namespaces={namespaces}
          activeNamespace={activeNamespace}
          onSelectNamespace={handleSelectNamespace}
          onRefreshNamespaces={handleRefreshNamespaces}
          clusterOverview={clusterOverview}
          clusterHealthInfo={clusterHealthInfo}
          loadingContext={loadingContext}
          isContextsLoading={isContextsLoading}
          isNamespacesLoading={isNamespacesLoading}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        {/* Global Error Banner (if any) */}
        {errorMessage && (
          <div className="bg-rose-950/80 border-b border-rose-800 text-rose-300 px-4 py-2 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-rose-200 text-xs font-bold px-2 py-0.5"
            >
              ✕
            </button>
          </div>
        )}

        {/* Toast Notification */}
        {toastMessage && (
          <div className="bg-cyan-950/90 border-b border-cyan-800 text-cyan-300 px-4 py-2 text-xs flex items-center justify-between animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <span>{toastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-cyan-400 hover:text-cyan-200 text-xs font-bold px-2 py-0.5"
            >
              ✕
            </button>
          </div>
        )}

        {/* Workload View Area with Container-Constrained Zoom & Overflow Bounds */}
        <div
          className="flex-1 min-h-0 relative overflow-auto"
          style={{ zoom: zoomLevel }}
        >
          <ErrorBoundary fallbackTitle="Workload View Error">
            {activeResource === "pods" ? (
              <div className="h-full flex flex-col min-w-0">
                <PodTable
                  pods={pods}
                  selectedPod={selectedPod}
                  onSelectPod={handleSelectPod}
                  loading={loadingPods}
                  onRefresh={refreshPods}
                  activeNamespace={activeNamespace}
                  onSelectNamespace={handleSelectNamespace}
                  isPodPinned={isPodCurrentlyPinned}
                  onTogglePin={handleTogglePodPin}
                  searchTerm={podSearchTerm}
                  onSearchTermChange={setPodSearchTerm}
                  enabledTools={enabledTools}
                  onExecuteTool={handleExecuteQuickTool}
                  mutationsDisabled={false}
                  onInspectPod={(pod, tab) => {
                    setDetailsPod(pod);
                    setDetailsInitialTab(tab || "containers");
                    setIsDetailsOpen(true);
                  }}
                  onToast={(msg) => {
                    setToastMessage(msg);
                    setTimeout(() => setToastMessage(null), 3500);
                  }}
                  onViewCombinedLogs={handleViewCombinedLogs}
                />
              </div>
            ) : activeResource === "deployments" ? (
              <div className="h-full flex flex-col min-w-0">
                <DeploymentsView
                  activeNamespace={activeNamespace}
                  activeContext={activeContext}
                  mutationsDisabled={false}
                  onToast={(msg) => {
                    setToastMessage(msg);
                    setTimeout(() => setToastMessage(null), 3500);
                  }}
                  onSwitchToPods={() => setActiveResource("pods")}
                  onShowPods={handleShowWorkloadPods}
                  onViewLogs={(dep) => handleViewWorkloadLogs("Deployment", dep.name, dep.namespace)}
                />
              </div>
            ) : activeResource === "statefulsets" ? (
              <div className="h-full flex flex-col min-w-0">
                <StatefulSetsView
                  activeNamespace={activeNamespace}
                  activeContext={activeContext}
                  mutationsDisabled={false}
                  onToast={(msg) => {
                    setToastMessage(msg);
                    setTimeout(() => setToastMessage(null), 3500);
                  }}
                  onSwitchToPods={() => setActiveResource("pods")}
                  onShowPods={handleShowWorkloadPods}
                  onViewLogs={(sts) => handleViewWorkloadLogs("StatefulSet", sts.name, sts.namespace)}
                />
              </div>
            ) : activeResource === "nodes" ? (
              <div className="h-full flex flex-col min-w-0">
                <NodesView
                  key={activeContext}
                  onToast={(msg) => {
                    setToastMessage(msg);
                    setTimeout(() => setToastMessage(null), 3500);
                  }}
                />
              </div>
            ) : activeResource === "services" ? (
              <div className="h-full flex flex-col min-w-0">
                <ServicesIngressView
                  key={`${activeContext}-${activeNamespace}`}
                  activeNamespace={activeNamespace}
                  onToast={(msg) => {
                    setToastMessage(msg);
                    setTimeout(() => setToastMessage(null), 3500);
                  }}
                />
              </div>
            ) : activeResource === "configmaps" ? (
              <div className="h-full flex flex-col min-w-0">
                <ConfigMapsSecretsView
                  activeNamespace={activeNamespace}
                  activeContext={activeContext}
                  onToast={(msg) => {
                    setToastMessage(msg);
                    setTimeout(() => setToastMessage(null), 3500);
                  }}
                  onCountsChange={refreshClusterConfigCounts}
                />
              </div>
            ) : (
              <div className="h-full flex flex-col min-w-0">
                <JobsView
                  resourceType={activeResource}
                  activeNamespace={activeNamespace}
                  activeContext={activeContext}
                  mutationsDisabled={false}
                  onToast={(msg) => {
                    setToastMessage(msg);
                    setTimeout(() => setToastMessage(null), 3500);
                  }}
                  onSwitchToPods={() => setActiveResource("pods")}
                  onViewJobLogs={handleViewJobLogs}
                />
              </div>
            )}
          </ErrorBoundary>
        </div>

        {/* Log Drawer (Supports individual Pods, Interactive Shell Exec, Multiplexed Controller Workloads, and Multi-Pod Combined Streams) */}
        {(selectedPod || selectedWorkload || (combinedPods && combinedPods.length > 0) || execTarget) && (
          <div style={{ zoom: zoomLevel }} className="flex-shrink-0">
            <LogDrawer
              pod={selectedPod}
              execPod={execTarget?.pod}
              execTimestamp={execTarget?.timestamp}
              workload={selectedWorkload}
              combinedPods={combinedPods}
              allPods={pods}
              initialPrevious={selectedPodIsPrevious}
              onClose={handleCloseDrawer}
              isPinned={selectedPod ? isPodCurrentlyPinned(selectedPod.name) : false}
              onTogglePin={() => selectedPod && handleTogglePodPin(selectedPod)}
              onToast={(msg) => {
                setToastMessage(msg);
                setTimeout(() => setToastMessage(null), 3500);
              }}
            />
          </div>
        )}
      </main>

      {/* Pin Customization Modal */}
      {editingPin && (
        <PinCustomizeModal
          pin={editingPin}
          isOpen={isPinModalOpen}
          onClose={() => {
            setIsPinModalOpen(false);
            setEditingPin(null);
          }}
          onSave={updatePin}
          onDelete={deletePin}
        />
      )}

      {/* On-Screen Persistent Selectable Error Banner Alerts */}
      <ErrorAlert />

      {/* Settings Modal (Appearance & Quick Tools tabs) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Application Logs Modal */}
      <AppLogsModal
        isOpen={isAppLogsOpen}
        onClose={() => setIsAppLogsOpen(false)}
      />

      {/* About Kermitt Modal */}
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />

      {/* Pod / Container Details Inspect Modal */}
      <PodDetailsModal
        pod={detailsPod}
        isOpen={isDetailsOpen}
        initialTab={detailsInitialTab}
        onClose={() => {
          setIsDetailsOpen(false);
          setDetailsPod(null);
        }}
      />

      {/* Destructive Action Safety Guard Confirmation Modal */}
      {confirmAction && (
        <ConfirmDialog
          isOpen={!!confirmAction}
          onClose={() => setConfirmAction(null)}
          onConfirm={handleConfirmDestructiveAction}
          actionType={confirmAction.type}
          title={confirmAction.type === "kill" ? "Delete Pod" : "Restart Pod"}
          confirmLabel={confirmAction.type === "kill" ? "Delete Pod" : "Restart Pod"}
          description={
            confirmAction.type === "kill" ? (
              <>
                Are you sure you want to terminate pod{" "}
                <strong className="font-mono text-cyan-300">
                  {confirmAction.pod.name}
                </strong>{" "}
                in namespace{" "}
                <strong className="font-mono text-cyan-300">
                  {confirmAction.pod.namespace}
                </strong>
                ?
              </>
            ) : (
              <>
                Are you sure you want to restart{" "}
                <strong className="font-mono text-cyan-300">
                  {confirmAction.pod.name}
                </strong>{" "}
                in namespace{" "}
                <strong className="font-mono text-cyan-300">
                  {confirmAction.pod.namespace}
                </strong>
                ? If backed by a controller, a replacement pod will spin up automatically.
              </>
            )
          }
          context={activeContext}
          namespace={confirmAction.pod.namespace}
          podName={confirmAction.pod.name}
          showForceCheckbox={confirmAction.type === "kill"}
          isForce={isForceTermination}
          onToggleForce={setIsForceTermination}
          isSubmitting={isActionSubmitting}
        />
      )}
    </div>
  );
}

export default App;
