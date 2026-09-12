import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCw,
  Copy,
  Check,
  Filter,
  Boxes,
  XCircle,
  Pin,
  X,
  Sliders,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
} from "lucide-react";
import { ipc } from "../../../wailsjs/go/models";
import { QuickToolItem, QuickToolId, ALL_QUICK_TOOLS } from "../../hooks/useQuickTools";
import { PodContextMenu } from "./PodContextMenu";
import { kubeApi } from "../../services/kubeApi";
import {
  useTableColumns,
  ColumnDefinition,
  parseAgeToSeconds,
} from "../../hooks/useTableColumns";
import { ColumnVisibilityMenu } from "../Common/ColumnVisibilityMenu";
import { useTableDensity } from "../../context/TableDensityContext";
import { useKeyboardNav } from "../../hooks/useKeyboardNav";

export type ColumnKey =
  | "status"
  | "name"
  | "namespace"
  | "ready"
  | "restarts"
  | "age"
  | "cpu"
  | "memory"
  | "ip"
  | "node"
  | "logs";

export const COLUMNS: ColumnDefinition<ColumnKey>[] = [
  {
    key: "status",
    label: "Status",
    defaultWidth: 140,
    minWidth: 80,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "name",
    label: "Pod Name",
    defaultWidth: 280,
    minWidth: 120,
    align: "left",
    required: true,
    resizable: true,
    sortable: true,
  },
  {
    key: "namespace",
    label: "Namespace",
    defaultWidth: 130,
    minWidth: 80,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "ready",
    label: "Ready",
    defaultWidth: 90,
    minWidth: 70,
    align: "center",
    resizable: true,
    sortable: true,
  },
  {
    key: "restarts",
    label: "Restarts",
    defaultWidth: 90,
    minWidth: 70,
    align: "center",
    resizable: true,
    sortable: true,
  },
  {
    key: "age",
    label: "Age",
    defaultWidth: 80,
    minWidth: 65,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "cpu",
    label: "CPU",
    defaultWidth: 110,
    minWidth: 80,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "memory",
    label: "Memory",
    defaultWidth: 120,
    minWidth: 80,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "ip",
    label: "IP",
    defaultWidth: 125,
    minWidth: 80,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "node",
    label: "Node",
    defaultWidth: 150,
    minWidth: 80,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "logs",
    label: "Quick Tools",
    defaultWidth: 170,
    minWidth: 120,
    align: "center",
    resizable: true,
    sortable: false,
  },
];

const STATUS_SEVERITY: Record<string, number> = {
  CrashLoopBackOff: 10,
  Failed: 9,
  Error: 8,
  Pending: 7,
  ContainerCreating: 6,
  Running: 5,
  Succeeded: 4,
  Completed: 3,
};

function parseCpuValue(val?: string): number {
  if (!val) return -1;
  const v = val.trim();
  if (v.endsWith("m")) {
    const n = parseFloat(v.slice(0, -1));
    return isNaN(n) ? -1 : n;
  }
  if (v.endsWith("u") || v.endsWith("n")) {
    const n = parseFloat(v.slice(0, -1));
    return isNaN(n) ? -1 : n / 1000;
  }
  const n = parseFloat(v);
  return isNaN(n) ? -1 : n * 1000;
}

function parseMemoryValue(val?: string): number {
  if (!val) return -1;
  const v = val.trim();
  if (v.endsWith("Ki")) return (parseFloat(v) || 0) * 1024;
  if (v.endsWith("Mi")) return (parseFloat(v) || 0) * 1024 * 1024;
  if (v.endsWith("Gi")) return (parseFloat(v) || 0) * 1024 * 1024 * 1024;
  if (v.endsWith("Ti")) return (parseFloat(v) || 0) * 1024 * 1024 * 1024 * 1024;
  const n = parseFloat(v);
  return isNaN(n) ? -1 : n;
}

interface PodTableProps {
  pods: ipc.PodSummary[];
  selectedPod: ipc.PodSummary | null;
  onSelectPod: (pod: ipc.PodSummary, previous?: boolean) => void;
  loading?: boolean;
  onRefresh?: () => void;
  activeNamespace: string;
  onSelectNamespace?: (namespace: string) => void;
  // Pinning actions
  isPodPinned?: (podName: string) => boolean;
  onTogglePin?: (pod: ipc.PodSummary) => void;
  // Controlled or external search term
  searchTerm?: string;
  onSearchTermChange?: (term: string) => void;
  // Quick tools actions
  enabledTools?: QuickToolItem[];
  onExecuteTool?: (toolId: QuickToolId, pod: ipc.PodSummary) => void;
  // Mutation guard (optional)
  mutationsDisabled?: boolean;
  // Inspection & Toast callbacks
  onInspectPod?: (pod: ipc.PodSummary, tab?: "containers" | "metadata" | "resources" | "events" | "yaml") => void;
  onToast?: (message: string) => void;
  // Multi-pod combined logs action
  onViewCombinedLogs?: (pods: ipc.PodSummary[]) => void;
}

type StatusFilterType = "ALL" | "RUNNING" | "ISSUES" | "PENDING";
type SortDirection = "asc" | "desc";

interface SortConfig {
  column: ColumnKey;
  direction: SortDirection;
}

export const PodTable: React.FC<PodTableProps> = ({
  pods,
  selectedPod,
  onSelectPod,
  loading = false,
  onRefresh,
  activeNamespace,
  onSelectNamespace,
  isPodPinned,
  onTogglePin,
  searchTerm: externalSearchTerm,
  onSearchTermChange,
  enabledTools = ALL_QUICK_TOOLS,
  onExecuteTool,
  mutationsDisabled = false,
  onInspectPod,
  onToast,
  onViewCombinedLogs,
}) => {
  // Defensive normalization: guarantee pods is always a valid array
  const safePods = useMemo(() => (Array.isArray(pods) ? pods : []), [pods]);

  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>("ALL");
  const [copiedPodName, setCopiedPodName] = useState<string | null>(null);

  // Multi-pod selection state
  const [selectedPodNames, setSelectedPodNames] = useState<string[]>([]);
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  // Keep selectedPodNames in sync if single selectedPod prop is passed externally
  useEffect(() => {
    if (selectedPod) {
      setSelectedPodNames((prev) => {
        if (prev.includes(selectedPod.name)) return prev;
        return [selectedPod.name];
      });
    }
  }, [selectedPod]);

  // Row Right-Click Context Menu State (Kept strictly decoupled from selectedPod row selection)
  const [contextMenuTarget, setContextMenuTarget] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    pod: ipc.PodSummary;
    selectedPods: ipc.PodSummary[];
  } | null>(null);

  // Sorting State
  // Shared Table Columns & Resizing Hook
  const {
    columns: allColumns,
    visibleColumns,
    columnWidths,
    columnVisibility,
    sortConfig,
    resizingColKey,
    contextMenu,
    contextMenuRef,
    handleResizeStart,
    handleAutoFitColumn: triggerAutoFit,
    handleSortClick,
    handleHeaderContextMenu,
    toggleColumnVisibility,
    resetToDefaults,
    closeContextMenu,
    setSortConfig,
    setContextMenu,
  } = useTableColumns<ColumnKey>({
    resourceKey: "pods",
    columns: COLUMNS,
  });

  // Handle Double-Click Column Auto-Fit
  const handleAutoFitColumn = (colKey: ColumnKey) => {
    triggerAutoFit(colKey, safePods, (pod: ipc.PodSummary, key: ColumnKey) => {
      switch (key) {
        case "status":
          return pod.status;
        case "name":
          return pod.name;
        case "namespace":
          return pod.namespace;
        case "ready":
          return `${pod.readyContainers}/${pod.totalContainers}`;
        case "restarts":
          return String(pod.restartCount);
        case "age":
          return pod.age;
        case "cpu":
          return pod.cpuUsage ? `${pod.cpuUsage} / ${pod.cpuLimit || pod.cpuRequest || ""}` : (pod.cpuLimit || pod.cpuRequest || "");
        case "memory":
          return pod.memoryUsage ? `${pod.memoryUsage} / ${pod.memoryLimit || pod.memoryRequest || ""}` : (pod.memoryLimit || pod.memoryRequest || "");
        case "ip":
          return pod.ip || "";
        case "node":
          return pod.nodeName || "";
        case "logs":
          return "Quick Tools";
        default:
          return "";
      }
    });
  };

  // Sync external search term if provided
  useEffect(() => {
    if (externalSearchTerm !== undefined) {
      setInternalSearchTerm(externalSearchTerm);
    }
  }, [externalSearchTerm]);

  const activeSearchTerm =
    externalSearchTerm !== undefined ? externalSearchTerm : internalSearchTerm;

  const handleSearchChange = (val: string) => {
    setInternalSearchTerm(val);
    if (onSearchTermChange) {
      onSearchTermChange(val);
    }
  };

  const handleCopyName = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(name);
    setCopiedPodName(name);
    setTimeout(() => setCopiedPodName(null), 1500);
  };


  // Filtered pods
  const filteredPods = useMemo(() => {
    return safePods.filter((pod) => {
      const rawTerm = activeSearchTerm.toLowerCase().trim();
      const term = rawTerm.replace(/\*+$/, "");
      const matchesSearch =
        term === "" ||
        pod.name.toLowerCase().includes(term) ||
        pod.namespace.toLowerCase().includes(term) ||
        (pod.ip && pod.ip.toLowerCase().includes(term)) ||
        (pod.nodeName && pod.nodeName.toLowerCase().includes(term));

      if (!matchesSearch) return false;

      if (statusFilter === "RUNNING") {
        return pod.status === "Running";
      }
      if (statusFilter === "ISSUES") {
        return (
          pod.status === "CrashLoopBackOff" ||
          pod.status === "Failed" ||
          pod.restartCount > 0
        );
      }
      if (statusFilter === "PENDING") {
        return pod.status === "Pending";
      }

      return true;
    });
  }, [safePods, activeSearchTerm, statusFilter]);

  // Sorted and Filtered pods
  const sortedAndFilteredPods = useMemo(() => {
    const result = [...filteredPods];
    if (!sortConfig) return result;

    const { column, direction } = sortConfig;
    const factor = direction === "asc" ? 1 : -1;

    result.sort((a, b) => {
      switch (column) {
        case "status": {
          const sevA = STATUS_SEVERITY[a.status] ?? 0;
          const sevB = STATUS_SEVERITY[b.status] ?? 0;
          if (sevA !== sevB) return (sevA - sevB) * factor;
          return a.status.localeCompare(b.status) * factor;
        }
        case "name":
          return a.name.localeCompare(b.name) * factor;
        case "namespace":
          return a.namespace.localeCompare(b.namespace) * factor;
        case "ready": {
          const ratioA =
            a.totalContainers > 0 ? a.readyContainers / a.totalContainers : 0;
          const ratioB =
            b.totalContainers > 0 ? b.readyContainers / b.totalContainers : 0;
          if (ratioA !== ratioB) return (ratioA - ratioB) * factor;
          return (a.readyContainers - b.readyContainers) * factor;
        }
        case "restarts":
          return (a.restartCount - b.restartCount) * factor;
        case "age": {
          const secA = parseAgeToSeconds(a.age);
          const secB = parseAgeToSeconds(b.age);
          return (secA - secB) * factor;
        }
        case "cpu": {
          const vA = parseCpuValue(a.cpuUsage || a.cpuLimit || a.cpuRequest);
          const vB = parseCpuValue(b.cpuUsage || b.cpuLimit || b.cpuRequest);
          return (vA - vB) * factor;
        }
        case "memory": {
          const vA = parseMemoryValue(a.memoryUsage || a.memoryLimit || a.memoryRequest);
          const vB = parseMemoryValue(b.memoryUsage || b.memoryLimit || b.memoryRequest);
          return (vA - vB) * factor;
        }
        case "ip":
          return (a.ip || "").localeCompare(b.ip || "") * factor;
        case "node":
          return (a.nodeName || "").localeCompare(b.nodeName || "") * factor;
        default:
          return 0;
      }
    });

    return result;
  }, [filteredPods, sortConfig]);

  const { densityClasses } = useTableDensity();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const { focusedIndex, clearFocus } = useKeyboardNav<ipc.PodSummary>({
    items: sortedAndFilteredPods,
    onEnter: (pod) => {
      setSelectedPodNames([pod.name]);
      onSelectPod(pod);
    },
    onOpenLogs: (pod) => {
      setSelectedPodNames([pod.name]);
      onSelectPod(pod);
    },
    onInspect: (pod) => {
      onInspectPod?.(pod);
    },
    onEscape: () => {
      if (contextMenuTarget?.isOpen) {
        setContextMenuTarget(null);
      }
    },
    searchInputRef,
    containerRef: tableContainerRef,
    disabled: contextMenuTarget?.isOpen,
  });

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "Running":
        return (
          <span className={`inline-flex items-center space-x-1.5 ${densityClasses.badgePadding} rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-xs`}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="truncate">Running</span>
          </span>
        );
      case "CrashLoopBackOff":
      case "Failed":
      case "Error":
        return (
          <span className={`inline-flex items-center space-x-1 ${densityClasses.badgePadding} rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30 shadow-xs`}>
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{status}</span>
          </span>
        );
      case "Pending":
      case "ContainerCreating":
        return (
          <span className={`inline-flex items-center space-x-1 ${densityClasses.badgePadding} rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-xs`}>
            <Clock className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{status}</span>
          </span>
        );
      case "Succeeded":
      case "Completed":
        return (
          <span className={`inline-flex items-center space-x-1 ${densityClasses.badgePadding} rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/30 shadow-xs`}>
            <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">Completed</span>
          </span>
        );
      default:
        return (
          <span className={`inline-flex items-center space-x-1 ${densityClasses.badgePadding} rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700 shadow-xs`}>
            <span className="truncate">{status}</span>
          </span>
        );
    }
  };

  const counts = useMemo(() => {
    let running = 0;
    let issues = 0;
    let pending = 0;
    safePods.forEach((p) => {
      if (p.status === "Running") running++;
      if (
        p.status === "CrashLoopBackOff" ||
        p.status === "Failed" ||
        p.restartCount > 0
      )
        issues++;
      if (p.status === "Pending") pending++;
    });
    return { all: safePods.length, running, issues, pending };
  }, [safePods]);

  const resetFilters = () => {
    handleSearchChange("");
    setStatusFilter("ALL");
    setSortConfig(null);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 overflow-hidden">
      {/* Table Header Controls */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-slate-100 tracking-tight">
            Pods
          </h1>

          <div className="flex items-center space-x-1">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                title="Refresh pods"
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors border border-slate-700/60 cursor-pointer"
              >
                <RotateCw
                  className={`w-3.5 h-3.5 ${loading ? "animate-spin text-cyan-400" : ""}`}
                />
              </button>
            )}

            {/* Quick Column Settings Trigger */}
            <button
              type="button"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setContextMenu({ x: rect.left, y: rect.bottom + 5 });
              }}
              title="Customize columns"
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors border border-slate-700/60 cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search & Quick Filters */}
        <div className="flex items-center space-x-2.5">
          {/* Quick Filter Tabs */}
          <div className="hidden md:flex items-center p-0.5 bg-slate-950 border border-slate-800 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === "ALL"
                  ? "bg-slate-800 text-slate-100 font-medium shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("RUNNING")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === "RUNNING"
                  ? "bg-emerald-950/80 text-emerald-300 font-medium border border-emerald-800/60 shadow-xs"
                  : "text-slate-400 hover:text-emerald-400"
              }`}
            >
              Running ({counts.running})
            </button>

            {/* Accentuated Issues Filter Tab */}
            <button
              type="button"
              onClick={() => setStatusFilter("ISSUES")}
              className={`px-2.5 py-1 rounded-md transition-colors flex items-center space-x-1.5 ${
                statusFilter === "ISSUES"
                  ? "bg-rose-950 text-rose-300 font-medium border border-rose-800 shadow-xs ring-1 ring-rose-500/40"
                  : counts.issues > 0
                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 font-semibold hover:bg-rose-500/30"
                  : "text-slate-400 hover:text-rose-400"
              }`}
            >
              <span>Issues</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  counts.issues > 0
                    ? "bg-rose-500/30 text-rose-300 font-bold border border-rose-500/50"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                {counts.issues}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("PENDING")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === "PENDING"
                  ? "bg-amber-950/80 text-amber-300 font-medium border border-amber-800/60 shadow-xs"
                  : "text-slate-400 hover:text-amber-400"
              }`}
            >
              Pending ({counts.pending})
            </button>
          </div>

          {/* Substring Search Input */}
          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search pods (name, IP, pattern) [Press /]..."
              value={activeSearchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-md pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition-colors"
            />
            {activeSearchTerm && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <XCircle className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table Container with Horizontal Scroll Support */}
      <div ref={tableContainerRef} className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse table-fixed select-none">
          {/* Colgroup matching configured pixel widths with bidirectional resizing */}
          <colgroup>
            {visibleColumns.map((col) => (
              <col
                key={col.key}
                style={{
                  width: `${columnWidths[col.key] || col.defaultWidth}px`,
                  minWidth: `${col.minWidth}px`,
                }}
              />
            ))}
          </colgroup>

          {/* Resizable & Sortable Table Header with Context Menu Trigger */}
          <thead
            onContextMenu={handleHeaderContextMenu}
            className="bg-slate-900/95 text-[11px] font-semibold text-slate-400 uppercase tracking-wider sticky top-0 z-10 border-b border-slate-800 shadow-xs"
          >
            <tr>
              {visibleColumns.map((col) => {
                const isBeingResized = resizingColKey === col.key;
                const isSorted = sortConfig?.column === col.key;

                return (
                  <th
                    key={col.key}
                    style={{
                      width: `${columnWidths[col.key] || col.defaultWidth}px`,
                      minWidth: `${col.minWidth}px`,
                    }}
                    onClick={() => handleSortClick(col)}
                    className={`${densityClasses.headerPadding} ${
                      col.key === "logs" ? "pr-6" : ""
                    } relative group/th select-none ${
                      col.sortable
                        ? "cursor-pointer hover:text-slate-200 hover:bg-slate-800/60"
                        : ""
                    } ${col.align === "center" ? "text-center" : "text-left"} ${
                      isBeingResized ? "bg-slate-800 text-cyan-300" : ""
                    } transition-colors`}
                  >
                    <div
                      className={`flex items-center space-x-1.5 min-w-0 ${
                        col.align === "center" ? "justify-center" : "justify-start"
                      }`}
                    >
                      <span className="truncate">{col.label}</span>
                      {col.sortable && (
                        <span className="inline-flex items-center flex-shrink-0">
                          {isSorted ? (
                            sortConfig?.direction === "asc" ? (
                              <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-cyan-400" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-500 opacity-0 group-hover/th:opacity-60 transition-opacity" />
                          )}
                        </span>
                      )}
                    </div>

                    {/* Permanent Visual Resize Divider & Double-Click Auto-Fit Handle */}
                    {col.resizable && (
                      <div
                        onMouseDown={(e) => handleResizeStart(e, col)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleAutoFitColumn(col.key);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        title="Drag to resize column (Double-click to auto-fit)"
                        className="absolute right-0 top-0 bottom-0 w-3 -mr-1.5 flex items-center justify-center cursor-col-resize z-20 group/divider"
                      >
                        {/* Visual Divider Line */}
                        <div
                          className={`h-4/5 w-[1px] transition-colors ${
                            isBeingResized
                              ? "bg-cyan-400 w-[2px]"
                              : "bg-slate-700/70 group-hover/divider:bg-sky-400 group-hover/divider:w-[2px]"
                          }`}
                        />
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-800/60 text-xs select-text">
            {/* 1. Loading Skeleton State */}
            {loading && safePods.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className={`animate-pulse ${densityClasses.rowHeight}`}>
                  {columnVisibility.status && (
                    <td className={densityClasses.cellPadding}>
                      <div className="h-5 w-20 bg-slate-800/80 rounded-full" />
                    </td>
                  )}
                  {columnVisibility.name && (
                    <td className={densityClasses.cellPadding}>
                      <div className="h-4 w-48 bg-slate-800/80 rounded" />
                    </td>
                  )}
                  {columnVisibility.namespace && (
                    <td className={densityClasses.cellPadding}>
                      <div className="h-4 w-24 bg-slate-800/60 rounded" />
                    </td>
                  )}
                  {columnVisibility.ready && (
                    <td className={`${densityClasses.cellPadding} text-center`}>
                      <div className="h-4 w-10 bg-slate-800/60 rounded mx-auto" />
                    </td>
                  )}
                  {columnVisibility.restarts && (
                    <td className={`${densityClasses.cellPadding} text-center`}>
                      <div className="h-4 w-8 bg-slate-800/60 rounded mx-auto" />
                    </td>
                  )}
                  {columnVisibility.age && (
                    <td className={densityClasses.cellPadding}>
                      <div className="h-4 w-12 bg-slate-800/60 rounded" />
                    </td>
                  )}
                  {columnVisibility.cpu && (
                    <td className={densityClasses.cellPadding}>
                      <div className="h-4 w-16 bg-slate-800/60 rounded" />
                    </td>
                  )}
                  {columnVisibility.memory && (
                    <td className={densityClasses.cellPadding}>
                      <div className="h-4 w-16 bg-slate-800/60 rounded" />
                    </td>
                  )}
                  {columnVisibility.ip && (
                    <td className={densityClasses.cellPadding}>
                      <div className="h-4 w-24 bg-slate-800/60 rounded" />
                    </td>
                  )}
                  {columnVisibility.node && (
                    <td className={densityClasses.cellPadding}>
                      <div className="h-4 w-28 bg-slate-800/60 rounded" />
                    </td>
                  )}
                  {columnVisibility.logs && (
                    <td className={`${densityClasses.cellPadding} text-center pr-6`}>
                      <div className="h-5 w-16 bg-slate-800/60 rounded mx-auto" />
                    </td>
                  )}
                </tr>
              ))
            ) : safePods.length === 0 ? (
              /* 2. Empty Namespace State */
              <tr>
                <td colSpan={visibleColumns.length} className="py-16 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center space-y-3 max-w-sm mx-auto">
                    <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 shadow-inner">
                      <Boxes className="w-6 h-6 text-slate-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-slate-200">
                        {activeNamespace === "all" || !activeNamespace
                          ? "No workloads found in cluster"
                          : `No workloads found in namespace "${activeNamespace}"`}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        {activeNamespace === "all" || !activeNamespace
                          ? "No workload instances are currently running in this cluster."
                          : `The namespace "${activeNamespace}" does not contain any workloads.`}
                      </p>
                    </div>
                    {activeNamespace !== "all" && onSelectNamespace && (
                      <button
                        type="button"
                        onClick={() => onSelectNamespace("all")}
                        className="px-3.5 py-1.5 rounded-md text-xs font-medium bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 transition-colors shadow-xs cursor-pointer"
                      >
                        View All Namespaces
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : sortedAndFilteredPods.length === 0 ? (
              /* 3. Search / Filter Mismatch State */
              <tr>
                <td colSpan={visibleColumns.length} className="py-16 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center space-y-3 max-w-sm mx-auto">
                    <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
                      <Filter className="w-5 h-5 text-slate-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-slate-200">No matching pods found</h3>
                      <p className="text-xs text-slate-500 mt-1">
                        No pods match &quot;{activeSearchTerm}&quot; with status &quot;{statusFilter}&quot;.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-700"
                    >
                      Reset Filters
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              /* 4. Populated Pods Rows */
              sortedAndFilteredPods.map((pod, index) => {
                const isRowSelected = selectedPodNames.includes(pod.name) || selectedPod?.name === pod.name;
                const allReady = pod.readyContainers === pod.totalContainers;
                const isPinned = isPodPinned ? isPodPinned(pod.name) : false;

                return (
                  <tr
                    key={`${pod.namespace}/${pod.name}`}
                    onClick={(e) => {
                      if (e.button !== 0) return;
                      if (contextMenuTarget?.isOpen) return;

                      if (e.metaKey || e.ctrlKey) {
                        // Cmd/Ctrl + Click: toggle selection
                        setSelectedPodNames((prev) => {
                          const exists = prev.includes(pod.name);
                          return exists ? prev.filter((n) => n !== pod.name) : [...prev, pod.name];
                        });
                        setLastClickedIndex(index);
                      } else if (e.shiftKey && lastClickedIndex !== null) {
                        // Shift + Click: range selection
                        const start = Math.min(lastClickedIndex, index);
                        const end = Math.max(lastClickedIndex, index);
                        const rangeNames = sortedAndFilteredPods.slice(start, end + 1).map((p) => p.name);
                        setSelectedPodNames(rangeNames);
                      } else {
                        // Regular click: single selection
                        setSelectedPodNames([pod.name]);
                        setLastClickedIndex(index);
                        onSelectPod(pod);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();

                      let targetSelection: ipc.PodSummary[] = [];
                      if (selectedPodNames.length > 1 && selectedPodNames.includes(pod.name)) {
                        // Keep multi-selection active and pass all selected pods
                        targetSelection = sortedAndFilteredPods.filter((p) => selectedPodNames.includes(p.name));
                      } else {
                        // Reset selection to just this pod
                        setSelectedPodNames([pod.name]);
                        setLastClickedIndex(index);
                        targetSelection = [pod];
                      }

                      const MENU_WIDTH = 240;
                      const MENU_HEIGHT = targetSelection.length > 1 ? 430 : 390;

                      const x =
                        e.clientX + MENU_WIDTH > window.innerWidth
                          ? window.innerWidth - MENU_WIDTH - 8
                          : e.clientX;
                      const y =
                        e.clientY + MENU_HEIGHT > window.innerHeight
                          ? window.innerHeight - MENU_HEIGHT - 8
                          : e.clientY;

                      setContextMenuTarget({
                        isOpen: true,
                        position: { x, y },
                        pod,
                        selectedPods: targetSelection,
                      });
                    }}
                    data-row-index={index}
                    className={`cursor-pointer transition-colors group select-none ${densityClasses.rowHeight} ${
                      contextMenuTarget?.isOpen && contextMenuTarget.pod.name === pod.name
                        ? "bg-slate-800/90 ring-1 ring-cyan-500/50"
                        : focusedIndex === index && isRowSelected
                        ? "bg-cyan-950/70 ring-1 ring-cyan-400 text-slate-100"
                        : focusedIndex === index
                        ? "ring-1 ring-cyan-500/70 bg-slate-800/50 text-slate-100 shadow-xs"
                        : isRowSelected
                        ? "bg-cyan-950/50 ring-1 ring-inset ring-cyan-500/50 text-slate-100"
                        : "hover:bg-slate-900/80"
                    }`}
                  >
                    {/* Status Badge */}
                    {columnVisibility.status && (
                      <td className={`${densityClasses.cellPadding} whitespace-nowrap overflow-hidden`}>
                        {renderStatusBadge(pod.status)}
                      </td>
                    )}

                    {/* Pod Name with Copy */}
                    {columnVisibility.name && (
                      <td className={`${densityClasses.cellPadding} font-mono font-medium text-slate-200 group-hover:text-cyan-300 transition-colors overflow-hidden`}>
                        <div className="flex items-center space-x-1.5 min-w-0">
                          <span className="truncate block" title={pod.name}>
                            {pod.name}
                          </span>

                          {/* Copy Name */}
                          <button
                            type="button"
                            onClick={(e) => handleCopyName(e, pod.name)}
                            title="Copy pod name"
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-slate-300 rounded transition-opacity flex-shrink-0 cursor-pointer"
                          >
                            {copiedPodName === pod.name ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>
                    )}

                    {/* Namespace */}
                    {columnVisibility.namespace && (
                      <td className={`${densityClasses.cellPadding} whitespace-nowrap overflow-hidden`}>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 font-mono border border-slate-700/50 truncate inline-block max-w-full">
                          {pod.namespace}
                        </span>
                      </td>
                    )}

                    {/* Ready Containers */}
                    {columnVisibility.ready && (
                      <td className={`${densityClasses.cellPadding} whitespace-nowrap text-center font-mono overflow-hidden`}>
                        <span
                          className={
                            allReady
                              ? "text-slate-300"
                              : "text-amber-400 font-semibold"
                          }
                        >
                          {pod.readyContainers}/{pod.totalContainers}
                        </span>
                      </td>
                    )}

                    {/* Restart Count */}
                    {columnVisibility.restarts && (
                      <td className={`${densityClasses.cellPadding} whitespace-nowrap text-center font-mono overflow-hidden`}>
                        {pod.restartCount > 0 ? (
                          <span className="text-rose-400 font-semibold bg-rose-950/50 px-1.5 py-0.5 rounded border border-rose-900/50">
                            {pod.restartCount}
                          </span>
                        ) : (
                          <span className="text-slate-500">0</span>
                        )}
                      </td>
                    )}

                    {/* Age */}
                    {columnVisibility.age && (
                      <td className={`${densityClasses.cellPadding} whitespace-nowrap text-slate-400 font-mono overflow-hidden`}>
                        {pod.age}
                      </td>
                    )}

                    {/* CPU */}
                    {columnVisibility.cpu && (
                      <td className={`${densityClasses.cellPadding} whitespace-nowrap font-mono ${densityClasses.textSize} overflow-hidden`}>
                        <span title={`Usage: ${pod.cpuUsage || 'N/A'}, Limit: ${pod.cpuLimit || 'N/A'}, Request: ${pod.cpuRequest || 'N/A'}`}>
                          {pod.cpuUsage && (pod.cpuLimit || pod.cpuRequest) ? (
                            <>
                              <span className="text-cyan-400 font-semibold">{pod.cpuUsage}</span>
                              <span className="text-slate-500 mx-1">/</span>
                              <span className="text-slate-400">{pod.cpuLimit || pod.cpuRequest}</span>
                            </>
                          ) : pod.cpuUsage ? (
                            <span className="text-cyan-400 font-semibold">{pod.cpuUsage}</span>
                          ) : pod.cpuLimit || pod.cpuRequest ? (
                            <>
                              <span className="text-slate-600">-</span>
                              <span className="text-slate-500 mx-1">/</span>
                              <span className="text-slate-400">{pod.cpuLimit || pod.cpuRequest}</span>
                            </>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </span>
                      </td>
                    )}

                    {/* Memory */}
                    {columnVisibility.memory && (
                      <td className={`${densityClasses.cellPadding} whitespace-nowrap font-mono ${densityClasses.textSize} overflow-hidden`}>
                        <span title={`Usage: ${pod.memoryUsage || 'N/A'}, Limit: ${pod.memoryLimit || 'N/A'}, Request: ${pod.memoryRequest || 'N/A'}`}>
                          {pod.memoryUsage && (pod.memoryLimit || pod.memoryRequest) ? (
                            <>
                              <span className="text-cyan-400 font-semibold">{pod.memoryUsage}</span>
                              <span className="text-slate-500 mx-1">/</span>
                              <span className="text-slate-400">{pod.memoryLimit || pod.memoryRequest}</span>
                            </>
                          ) : pod.memoryUsage ? (
                            <span className="text-cyan-400 font-semibold">{pod.memoryUsage}</span>
                          ) : pod.memoryLimit || pod.memoryRequest ? (
                            <>
                              <span className="text-slate-600">-</span>
                              <span className="text-slate-500 mx-1">/</span>
                              <span className="text-slate-400">{pod.memoryLimit || pod.memoryRequest}</span>
                            </>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </span>
                      </td>
                    )}

                    {/* IP */}
                    {columnVisibility.ip && (
                      <td className={`${densityClasses.cellPadding} whitespace-nowrap font-mono ${densityClasses.textSize} text-slate-400 overflow-hidden truncate`}>
                        {pod.ip || <span className="text-slate-600">-</span>}
                      </td>
                    )}

                    {/* Node */}
                    {columnVisibility.node && (
                      <td
                        className={`${densityClasses.cellPadding} whitespace-nowrap ${densityClasses.textSize} text-slate-400 truncate overflow-hidden`}
                        title={pod.nodeName}
                      >
                        {pod.nodeName || <span className="text-slate-600">-</span>}
                      </td>
                    )}

                    {/* Quick Tools Action Bar Grouped in Pill Container */}
                    {columnVisibility.logs && (
                      <td className={`${densityClasses.cellPadding} pr-6 text-center whitespace-nowrap overflow-hidden`}>
                        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-md px-2.5 py-1 inline-flex items-center gap-2.5 opacity-80 group-hover:opacity-100 transition-opacity shadow-xs">
                          {enabledTools.map((tool) => {
                            const Icon = tool.icon;
                            return (
                              <button
                                key={tool.id}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onExecuteTool) {
                                    onExecuteTool(tool.id, pod);
                                  } else {
                                    onSelectPod(pod);
                                  }
                                }}
                                title={tool.label}
                                className={`p-1 rounded hover:bg-slate-700/60 hover:text-slate-100 transition-colors cursor-pointer ${tool.colorClass}`}
                              >
                                <Icon className={densityClasses.iconSize} />
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Header Context Menu Popover (Column Visibility) */}
      <ColumnVisibilityMenu
        columns={allColumns}
        columnVisibility={columnVisibility}
        onToggleVisibility={toggleColumnVisibility}
        onResetToDefaults={resetToDefaults}
        onClose={closeContextMenu}
        position={contextMenu}
        menuRef={contextMenuRef}
      />

      {/* Row Right-Click Context Menu */}
      {contextMenuTarget && contextMenuTarget.isOpen && contextMenuTarget.position && (
        <PodContextMenu
          pod={contextMenuTarget.pod}
          position={contextMenuTarget.position}
          onClose={() => setContextMenuTarget(null)}
          isPinned={isPodPinned ? isPodPinned(contextMenuTarget.pod.name) : false}
          onTogglePin={(pod) => {
            onTogglePin?.(pod);
          }}
          onViewLogs={(pod, previous) => {
            onSelectPod(pod, previous);
            if (previous) {
              onToast?.(`Viewing previous container exit logs for "${pod.name}".`);
            }
          }}
          onOpenExec={(pod) => {
            onExecuteTool?.("exec", pod);
          }}
          onInspectDetails={(pod, tab) => {
            if (onInspectPod) {
              onInspectPod(pod, tab);
            }
          }}
          onCopyName={(pod) => {
            navigator.clipboard.writeText(pod.name);
            onToast?.(`Copied pod name "${pod.name}" to clipboard.`);
          }}
          onCopyIP={(pod) => {
            const ip = pod.ip || "Pending";
            navigator.clipboard.writeText(ip);
            onToast?.(`Copied pod IP "${ip}" to clipboard.`);
          }}
          onCopyImage={async (pod) => {
            try {
              const details = await kubeApi.getContainerDetails(pod.namespace, pod.name);
              const img = details[0]?.image || `registry.k8s.io/${pod.name.split("-")[0]}:v1.24.0`;
              navigator.clipboard.writeText(img);
              onToast?.(`Copied container image "${img}" to clipboard.`);
            } catch {
              const fallbackImg = `registry.k8s.io/${pod.name.split("-")[0]}:v1.24.0`;
              navigator.clipboard.writeText(fallbackImg);
              onToast?.(`Copied container image "${fallbackImg}" to clipboard.`);
            }
          }}
          onRestartPod={(pod) => {
            onExecuteTool?.("restart", pod);
          }}
          onKillPod={(pod) => {
            onExecuteTool?.("kill", pod);
          }}
          mutationsDisabled={mutationsDisabled}
          selectedPods={contextMenuTarget.selectedPods}
          onViewCombinedLogs={onViewCombinedLogs}
        />
      )}
    </div>
  );
};
