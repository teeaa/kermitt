import React, { useState, useEffect, useMemo } from "react";
import {
  FolderGit2,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCw,
  Copy,
  Check,
  XCircle,
  Layers,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Sliders,
} from "lucide-react";
import {
  useTableColumns,
  ColumnDefinition,
  parseAgeToSeconds,
} from "../../hooks/useTableColumns";
import { ColumnVisibilityMenu } from "../Common/ColumnVisibilityMenu";
import { StatefulSetContextMenu } from "./StatefulSetContextMenu";
import { WorkloadDetailsModal } from "./WorkloadDetailsModal";
import { ScaleReplicasModal } from "../Common/ScaleReplicasModal";
import { ConfirmDialog } from "../Common/ConfirmDialog";
import { kubeApi } from "../../services/kubeApi";
import { reportApiError } from "../../hooks/useNotificationStore";

export interface StatefulSetItem {
  name: string;
  namespace: string;
  status: "Ready" | "Progressing" | "Degraded";
  ready: string;
  readyReplicas: number;
  totalReplicas: number;
  age: string;
  serviceName: string;
}

export type StatefulSetColumnKey =
  | "status"
  | "name"
  | "namespace"
  | "ready"
  | "serviceName"
  | "age";

export const STATEFULSET_COLUMNS: ColumnDefinition<StatefulSetColumnKey>[] = [
  {
    key: "status",
    label: "Status",
    defaultWidth: 130,
    minWidth: 95,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "name",
    label: "StatefulSet Name",
    defaultWidth: 260,
    minWidth: 160,
    align: "left",
    required: true,
    resizable: true,
    sortable: true,
  },
  {
    key: "namespace",
    label: "Namespace",
    defaultWidth: 140,
    minWidth: 100,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "ready",
    label: "Ready",
    defaultWidth: 110,
    minWidth: 80,
    align: "center",
    resizable: true,
    sortable: true,
  },
  {
    key: "serviceName",
    label: "Service Name",
    defaultWidth: 220,
    minWidth: 140,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "age",
    label: "Age",
    defaultWidth: 90,
    minWidth: 65,
    align: "left",
    resizable: true,
    sortable: true,
  },
];

interface StatefulSetsViewProps {
  activeNamespace: string;
  activeContext?: string;
  onToast: (msg: string) => void;
  onSwitchToPods: () => void;
  mutationsDisabled?: boolean;
  onSelectStatefulSet?: (item: StatefulSetItem) => void;
  onShowPods?: (workloadName: string, namespace: string) => void;
  onViewLogs?: (item: StatefulSetItem) => void;
}

export const StatefulSetsView: React.FC<StatefulSetsViewProps> = ({
  activeNamespace,
  activeContext = "",
  onToast,
  onSwitchToPods,
  mutationsDisabled = false,
  onSelectStatefulSet,
  onShowPods,
  onViewLogs,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [statefulSetsList, setStatefulSetsList] = useState<StatefulSetItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchStatefulSets = async () => {
      setLoading(true);
      try {
        const data = await kubeApi.getStatefulSets(activeNamespace);
        if (active) {
          setStatefulSetsList(
            (data || []).map((s) => ({
              ...s,
              status: (s.status as "Ready" | "Progressing" | "Degraded") || "Ready",
            }))
          );
        }
      } catch (err) {
        console.error("[STATEFULSETS] Failed to fetch statefulsets:", err);
        if (active) {
          setStatefulSetsList([]);
          reportApiError(err, "statefulsets", activeNamespace);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    fetchStatefulSets();
    return () => {
      active = false;
    };
  }, [activeNamespace]);

  // Context menu state
  const [rowContextMenu, setRowContextMenu] = useState<{
    x: number;
    y: number;
    item: StatefulSetItem;
  } | null>(null);

  // Modals state
  const [detailsModal, setDetailsModal] = useState<{
    isOpen: boolean;
    item: StatefulSetItem | null;
    tab: "yaml" | "spec" | "events";
  }>({
    isOpen: false,
    item: null,
    tab: "yaml",
  });

  const [scaleModal, setScaleModal] = useState<{
    isOpen: boolean;
    item: StatefulSetItem | null;
  }>({
    isOpen: false,
    item: null,
  });

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: "restart" | "delete";
    item: StatefulSetItem | null;
  }>({
    isOpen: false,
    type: "restart",
    item: null,
  });

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
    setContextMenu,
  } = useTableColumns<StatefulSetColumnKey>({
    resourceKey: "statefulsets",
    columns: STATEFULSET_COLUMNS,
  });

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(text);
    onToast(`Copied ${label} "${text}" to clipboard.`);
    setTimeout(() => setCopiedItem(null), 1500);
  };

  // Row right-click context menu handler (never opens row details or log drawer)
  const handleRowContextMenu = (e: React.MouseEvent, sts: StatefulSetItem) => {
    e.preventDefault();
    e.stopPropagation();

    const menuWidth = 240;
    const menuHeight = 280;
    const padding = 10;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth - padding) {
      x = window.innerWidth - menuWidth - padding;
    }
    if (y + menuHeight > window.innerHeight - padding) {
      y = window.innerHeight - menuHeight - padding;
    }

    setRowContextMenu({
      x: Math.max(padding, x),
      y: Math.max(padding, y),
      item: sts,
    });
  };

  // Filter StatefulSets
  const filteredStatefulSets = useMemo(() => {
    return statefulSetsList.filter((sts) => {
      if (activeNamespace !== "all" && sts.namespace !== activeNamespace) {
        return false;
      }
      const q = searchTerm.toLowerCase().trim();
      if (
        q &&
        !sts.name.toLowerCase().includes(q) &&
        !sts.namespace.toLowerCase().includes(q) &&
        !sts.serviceName.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (statusFilter !== "ALL" && sts.status.toUpperCase() !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [statefulSetsList, activeNamespace, searchTerm, statusFilter]);

  // Handle Double-Click Column Auto-Fit
  const handleAutoFitColumn = (colKey: StatefulSetColumnKey) => {
    triggerAutoFit(colKey, filteredStatefulSets, (sts: StatefulSetItem, key: StatefulSetColumnKey) => {
      switch (key) {
        case "status":
          return sts.status;
        case "name":
          return sts.name;
        case "namespace":
          return sts.namespace;
        case "ready":
          return sts.ready;
        case "serviceName":
          return sts.serviceName;
        case "age":
          return sts.age;
        default:
          return "";
      }
    });
  };

  // Sort StatefulSets
  const sortedStatefulSets = useMemo(() => {
    if (!sortConfig) return filteredStatefulSets;
    const { column, direction } = sortConfig;
    const factor = direction === "asc" ? 1 : -1;
    return [...filteredStatefulSets].sort((a, b) => {
      switch (column) {
        case "status":
          return a.status.localeCompare(b.status) * factor;
        case "name":
          return a.name.localeCompare(b.name) * factor;
        case "namespace":
          return a.namespace.localeCompare(b.namespace) * factor;
        case "ready": {
          const ratioA = a.totalReplicas > 0 ? a.readyReplicas / a.totalReplicas : 0;
          const ratioB = b.totalReplicas > 0 ? b.readyReplicas / b.totalReplicas : 0;
          if (ratioA !== ratioB) return (ratioA - ratioB) * factor;
          return (a.readyReplicas - b.readyReplicas) * factor;
        }
        case "serviceName":
          return a.serviceName.localeCompare(b.serviceName) * factor;
        case "age":
          return (parseAgeToSeconds(a.age) - parseAgeToSeconds(b.age)) * factor;
        default:
          return 0;
      }
    });
  }, [filteredStatefulSets, sortConfig]);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* Top Header Controls */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
              <FolderGit2 className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-100 flex items-center space-x-2">
                <span>StatefulSets</span>
                <span className="text-xs px-2.5 py-0.5 bg-slate-800 text-slate-300 rounded-full font-mono font-normal border border-slate-700/60">
                  {activeNamespace === "all" ? "All Namespaces" : activeNamespace}
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Showing {sortedStatefulSets.length} of {statefulSetsList.length} statefulsets
              </p>
            </div>
          </div>

          <div className="hidden lg:flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950/60 border border-cyan-800/80 text-cyan-300">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>Apps/v1 API Ready</span>
          </div>
        </div>

        {/* Search & Quick Status Filters */}
        <div className="flex items-center space-x-2.5">
          <div className="hidden md:flex items-center p-0.5 bg-slate-950 border border-slate-800 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === "ALL"
                  ? "bg-slate-800 text-slate-100 font-medium"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("READY")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === "READY"
                  ? "bg-emerald-950 text-emerald-300 font-medium border border-emerald-800"
                  : "text-slate-400 hover:text-emerald-400"
              }`}
            >
              Ready
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("PROGRESSING")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === "PROGRESSING"
                  ? "bg-blue-950 text-blue-300 font-medium border border-blue-800"
                  : "text-slate-400 hover:text-blue-400"
              }`}
            >
              Progressing
            </button>
          </div>

          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search statefulsets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-md pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <XCircle className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Column Settings Trigger */}
          <button
            type="button"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setContextMenu({ x: rect.left, y: rect.bottom + 5 });
            }}
            title="Customize columns"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors border border-slate-700/60"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Table Area with Horizontal Scroll & Right Padding */}
      <div className="flex-1 overflow-auto select-text pr-4 sm:pr-6">
        <table className="w-full text-left border-collapse table-fixed select-none">
          <colgroup>
            {visibleColumns.map((col) => (
              <col
                key={col.key}
                style={{ width: `${columnWidths[col.key]}px` }}
              />
            ))}
          </colgroup>
          <thead
            onContextMenu={handleHeaderContextMenu}
            className="bg-slate-900/95 text-[11px] font-semibold text-slate-400 uppercase tracking-wider sticky top-0 z-10 border-b border-slate-800 shadow-xs"
          >
            <tr>
              {visibleColumns.map((col) => {
                const isSorted = sortConfig?.column === col.key;
                const isBeingResized = resizingColKey === col.key;

                return (
                  <th
                    key={col.key}
                    style={{ width: `${columnWidths[col.key]}px` }}
                    onClick={() => handleSortClick(col)}
                    className={`py-2.5 px-3.5 relative group/th select-none ${
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
          <tbody className="divide-y divide-slate-800/60 text-xs">
            {loading ? (
              <tr>
                <td
                  colSpan={visibleColumns.length}
                  className="py-16 text-center text-slate-500"
                >
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <RotateCw className="w-8 h-8 text-cyan-400 animate-spin" />
                    <span className="text-slate-300 font-medium">
                      Loading statefulsets...
                    </span>
                  </div>
                </td>
              </tr>
            ) : sortedStatefulSets.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length}
                  className="py-16 text-center text-slate-500"
                >
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <FolderGit2 className="w-8 h-8 text-slate-600" />
                    <span className="text-slate-300 font-medium">
                      {activeNamespace === "all"
                        ? "No statefulsets found in cluster"
                        : `No statefulsets found in namespace "${activeNamespace}"`}
                    </span>
                    <button
                      type="button"
                      onClick={onSwitchToPods}
                      className="text-cyan-400 hover:underline text-xs"
                    >
                      Return to Pods view
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              sortedStatefulSets.map((sts) => (
                <tr
                  key={`${sts.namespace}/${sts.name}`}
                  onClick={() => onSelectStatefulSet?.(sts)}
                  onContextMenu={(e) => handleRowContextMenu(e, sts)}
                  className="cursor-pointer transition-colors group hover:bg-slate-900/70"
                >
                  {columnVisibility.status && (
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      {sts.status === "Ready" ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                          <span>Ready</span>
                        </span>
                      ) : sts.status === "Progressing" ? (
                        <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                          <span>Progressing</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
                          <AlertCircle className="w-3 h-3 flex-shrink-0" />
                          <span>Degraded</span>
                        </span>
                      )}
                    </td>
                  )}

                  {columnVisibility.name && (
                    <td className="py-2.5 px-3.5 font-mono font-medium text-slate-200 truncate">
                      <div className="flex items-center space-x-1.5">
                        <span className="truncate" title={sts.name}>
                          {sts.name}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(sts.name, "statefulset name");
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-slate-300 rounded transition-opacity"
                        >
                          {copiedItem === sts.name ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>
                  )}

                  {columnVisibility.namespace && (
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 font-mono border border-slate-700/50">
                        {sts.namespace}
                      </span>
                    </td>
                  )}

                  {columnVisibility.ready && (
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-center font-mono">
                      <span
                        className={
                          sts.readyReplicas === sts.totalReplicas
                            ? "text-emerald-400 font-semibold"
                            : "text-amber-400 font-semibold"
                        }
                      >
                        {sts.ready}
                      </span>
                    </td>
                  )}

                  {columnVisibility.serviceName && (
                    <td
                      className="py-2.5 px-3.5 whitespace-nowrap text-slate-300 font-mono text-[11px] truncate"
                      title={sts.serviceName}
                    >
                      {sts.serviceName}
                    </td>
                  )}

                  {columnVisibility.age && (
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-400 font-mono">
                      {sts.age}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Banner */}
      <div className="px-4 py-2 bg-slate-900/80 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-2">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span>StatefulSets Engine • Apps/v1</span>
        </div>
        <button
          type="button"
          onClick={onSwitchToPods}
          className="text-xs text-cyan-400 hover:text-cyan-300 hover:underline flex items-center space-x-1"
        >
          <span>Switch back to Workload Pods →</span>
        </button>
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

      {/* Row Context Menu */}
      <StatefulSetContextMenu
        statefulSet={rowContextMenu?.item ?? null}
        position={rowContextMenu ? { x: rowContextMenu.x, y: rowContextMenu.y } : null}
        onClose={() => setRowContextMenu(null)}
        onInspectDetails={(sts, tab) =>
          setDetailsModal({ isOpen: true, item: sts, tab: tab || "yaml" })
        }
        onShowPods={(name, ns) => {
          if (onShowPods) {
            onShowPods(name, ns);
          } else {
            onSwitchToPods();
          }
        }}
        onShowEvents={(sts) =>
          setDetailsModal({ isOpen: true, item: sts, tab: "events" })
        }
        onCopyName={(sts) => handleCopy(sts.name, "statefulset name")}
        onCopyServiceName={(sts) => handleCopy(sts.serviceName, "service name")}
        onRestartRollout={(sts) =>
          setConfirmDialog({ isOpen: true, type: "restart", item: sts })
        }
        onScaleReplicas={(sts) => setScaleModal({ isOpen: true, item: sts })}
        onDelete={(sts) =>
          setConfirmDialog({ isOpen: true, type: "delete", item: sts })
        }
        onViewLogs={onViewLogs}
        mutationsDisabled={mutationsDisabled}
      />

      {/* Workload Details Modal */}
      <WorkloadDetailsModal
        item={detailsModal.item}
        resourceType="statefulset"
        isOpen={detailsModal.isOpen}
        initialTab={detailsModal.tab}
        onClose={() => setDetailsModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Scale Replicas Modal */}
      {scaleModal.item && (
        <ScaleReplicasModal
          isOpen={scaleModal.isOpen}
          onClose={() => setScaleModal({ isOpen: false, item: null })}
          onScale={(newReplicas) => {
            if (!scaleModal.item) return;
            const targetName = scaleModal.item.name;
            setStatefulSetsList((prev) =>
              prev.map((s) =>
                s.name === targetName
                  ? {
                      ...s,
                      totalReplicas: newReplicas,
                      ready: `${s.readyReplicas}/${newReplicas}`,
                    }
                  : s
              )
            );
            onToast(`Scaled statefulset "${targetName}" to ${newReplicas} replicas.`);
          }}
          itemName={scaleModal.item.name}
          resourceType="statefulset"
          namespace={scaleModal.item.namespace}
          currentReplicas={scaleModal.item.totalReplicas}
          mutationsDisabled={mutationsDisabled}
        />
      )}

      {/* Confirm Dialog (Restart Rollout / Delete) */}
      {confirmDialog.item && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
          onConfirm={() => {
            if (!confirmDialog.item) return;
            const targetName = confirmDialog.item.name;
            if (confirmDialog.type === "restart") {
              onToast(`Rollout restart triggered for "${targetName}".`);
            } else if (confirmDialog.type === "delete") {
              setStatefulSetsList((prev) => prev.filter((s) => s.name !== targetName));
              onToast(`StatefulSet "${targetName}" deleted.`);
            }
            setConfirmDialog({ isOpen: false, type: "restart", item: null });
          }}
          title={
            confirmDialog.type === "restart"
              ? "Restart StatefulSet Rollout"
              : "Delete StatefulSet"
          }
          actionType={confirmDialog.type === "restart" ? "restart" : "delete"}
          context={activeContext}
          namespace={confirmDialog.item.namespace}
          itemName={confirmDialog.item.name}
          confirmLabel={
            confirmDialog.type === "restart"
              ? "Confirm & Restart Rollout"
              : "Confirm & Delete StatefulSet"
          }
          description={
            confirmDialog.type === "restart"
              ? `Are you sure you want to perform a rolling restart for statefulset "${confirmDialog.item.name}"? Pods will be recreated sequentially in reverse order.`
              : `Are you sure you want to permanently delete statefulset "${confirmDialog.item.name}"? Note that associated PersistentVolumeClaims will be preserved.`
          }
        />
      )}
    </div>
  );
};
