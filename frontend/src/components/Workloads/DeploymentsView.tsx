import React, { useState, useEffect, useMemo } from "react";
import {
  Boxes,
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
import { DeploymentContextMenu } from "./DeploymentContextMenu";
import { WorkloadDetailsModal } from "./WorkloadDetailsModal";
import { ScaleReplicasModal } from "../Common/ScaleReplicasModal";
import { ConfirmDialog } from "../Common/ConfirmDialog";
import { kubeApi } from "../../services/kubeApi";
import { reportApiError } from "../../hooks/useNotificationStore";
import { useTableDensity } from "../../context/TableDensityContext";

export interface DeploymentItem {
  name: string;
  namespace: string;
  status: "Ready" | "Progressing" | "Degraded";
  ready: string;
  readyReplicas: number;
  totalReplicas: number;
  upToDate: number;
  available: number;
  age: string;
  conditions: string;
}

export type DeploymentColumnKey =
  | "status"
  | "name"
  | "namespace"
  | "ready"
  | "upToDate"
  | "available"
  | "age"
  | "conditions";

export const DEPLOYMENT_COLUMNS: ColumnDefinition<DeploymentColumnKey>[] = [
  {
    key: "status",
    label: "Status",
    defaultWidth: 130,
    minWidth: 80,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "name",
    label: "Deployment Name",
    defaultWidth: 260,
    minWidth: 120,
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
    key: "upToDate",
    label: "Up-to-date",
    defaultWidth: 110,
    minWidth: 80,
    align: "center",
    resizable: true,
    sortable: true,
  },
  {
    key: "available",
    label: "Available",
    defaultWidth: 110,
    minWidth: 80,
    align: "center",
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
  {
    key: "conditions",
    label: "Conditions",
    defaultWidth: 180,
    minWidth: 120,
    align: "left",
    resizable: true,
    sortable: true,
  },
];

interface DeploymentsViewProps {
  activeNamespace: string;
  activeContext?: string;
  onToast: (msg: string) => void;
  onSwitchToPods: () => void;
  mutationsDisabled?: boolean;
  onSelectDeployment?: (item: DeploymentItem) => void;
  onShowPods?: (workloadName: string, namespace: string) => void;
  onViewLogs?: (item: DeploymentItem) => void;
}

export const DeploymentsView: React.FC<DeploymentsViewProps> = ({
  activeNamespace,
  activeContext = "",
  onToast,
  onSwitchToPods,
  mutationsDisabled = false,
  onSelectDeployment,
  onShowPods,
  onViewLogs,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [deploymentsList, setDeploymentsList] = useState<DeploymentItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchDeployments = async () => {
      setLoading(true);
      try {
        const data = await kubeApi.getDeployments(activeNamespace);
        if (active) {
          setDeploymentsList(
            (data || []).map((d) => ({
              ...d,
              status: (d.status as "Ready" | "Progressing" | "Degraded") || "Ready",
            }))
          );
        }
      } catch (err) {
        console.error("[DEPLOYMENTS] Failed to fetch deployments:", err);
        if (active) {
          setDeploymentsList([]);
          reportApiError(err, "deployments", activeNamespace);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    fetchDeployments();
    return () => {
      active = false;
    };
  }, [activeNamespace]);

  // Context menu state
  const [rowContextMenu, setRowContextMenu] = useState<{
    x: number;
    y: number;
    item: DeploymentItem;
  } | null>(null);

  // Modals state
  const [detailsModal, setDetailsModal] = useState<{
    isOpen: boolean;
    item: DeploymentItem | null;
    tab: "yaml" | "spec" | "events";
  }>({
    isOpen: false,
    item: null,
    tab: "yaml",
  });

  const [scaleModal, setScaleModal] = useState<{
    isOpen: boolean;
    item: DeploymentItem | null;
  }>({
    isOpen: false,
    item: null,
  });

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: "restart" | "delete";
    item: DeploymentItem | null;
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
  } = useTableColumns<DeploymentColumnKey>({
    resourceKey: "deployments",
    columns: DEPLOYMENT_COLUMNS,
  });

  const { densityClasses } = useTableDensity();

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(text);
    onToast(`Copied ${label} "${text}" to clipboard.`);
    setTimeout(() => setCopiedItem(null), 1500);
  };

  // Row right-click context menu handler (never opens row details or log drawer)
  const handleRowContextMenu = (e: React.MouseEvent, dep: DeploymentItem) => {
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
      item: dep,
    });
  };

  // Filter Deployments
  const filteredDeployments = useMemo(() => {
    return deploymentsList.filter((dep) => {
      if (activeNamespace !== "all" && dep.namespace !== activeNamespace) {
        return false;
      }
      const q = searchTerm.toLowerCase().trim();
      if (
        q &&
        !dep.name.toLowerCase().includes(q) &&
        !dep.namespace.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (statusFilter !== "ALL" && dep.status.toUpperCase() !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [deploymentsList, activeNamespace, searchTerm, statusFilter]);

  // Handle Double-Click Column Auto-Fit
  const handleAutoFitColumn = (colKey: DeploymentColumnKey) => {
    triggerAutoFit(colKey, filteredDeployments, (dep: DeploymentItem, key: DeploymentColumnKey) => {
      switch (key) {
        case "status":
          return dep.status;
        case "name":
          return dep.name;
        case "namespace":
          return dep.namespace;
        case "ready":
          return dep.ready;
        case "upToDate":
          return String(dep.upToDate);
        case "available":
          return String(dep.available);
        case "age":
          return dep.age;
        case "conditions":
          return dep.conditions;
        default:
          return "";
      }
    });
  };

  // Sort Deployments
  const sortedDeployments = useMemo(() => {
    if (!sortConfig) return filteredDeployments;
    const { column, direction } = sortConfig;
    const factor = direction === "asc" ? 1 : -1;
    return [...filteredDeployments].sort((a, b) => {
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
        case "upToDate":
          return (a.upToDate - b.upToDate) * factor;
        case "available":
          return (a.available - b.available) * factor;
        case "age":
          return (parseAgeToSeconds(a.age) - parseAgeToSeconds(b.age)) * factor;
        case "conditions":
          return a.conditions.localeCompare(b.conditions) * factor;
        default:
          return 0;
      }
    });
  }, [filteredDeployments, sortConfig]);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* Top Header Controls */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
              <Boxes className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-100 flex items-center space-x-2">
                <span>Deployments</span>
                <span className="text-xs px-2.5 py-0.5 bg-slate-800 text-slate-300 rounded-full font-mono font-normal border border-slate-700/60">
                  {activeNamespace === "all" ? "All Namespaces" : activeNamespace}
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Showing {sortedDeployments.length} of {deploymentsList.length} deployments
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
            <button
              type="button"
              onClick={() => setStatusFilter("DEGRADED")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === "DEGRADED"
                  ? "bg-rose-950 text-rose-300 font-medium border border-rose-800"
                  : "text-slate-400 hover:text-rose-400"
              }`}
            >
              Degraded
            </button>
          </div>

          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search deployments..."
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
                style={{
                  width: `${columnWidths[col.key] || col.defaultWidth}px`,
                  minWidth: `${col.minWidth}px`,
                }}
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
                    style={{
                      width: `${columnWidths[col.key] || col.defaultWidth}px`,
                      minWidth: `${col.minWidth}px`,
                    }}
                    onClick={() => handleSortClick(col)}
                    className={`${densityClasses.headerPadding} relative group/th select-none ${
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
                      Loading deployments...
                    </span>
                  </div>
                </td>
              </tr>
            ) : sortedDeployments.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length}
                  className="py-16 text-center text-slate-500"
                >
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Boxes className="w-8 h-8 text-slate-600" />
                    <span className="text-slate-300 font-medium">
                      {activeNamespace === "all"
                        ? "No deployments found in cluster"
                        : `No deployments found in namespace "${activeNamespace}"`}
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
              sortedDeployments.map((dep) => (
                <tr
                  key={`${dep.namespace}/${dep.name}`}
                  onClick={() => onSelectDeployment?.(dep)}
                  onContextMenu={(e) => handleRowContextMenu(e, dep)}
                  className={`cursor-pointer transition-colors group hover:bg-slate-900/70 select-none ${densityClasses.rowHeight}`}
                >
                  {columnVisibility.status && (
                    <td className={`${densityClasses.cellPadding} whitespace-nowrap`}>
                      {dep.status === "Ready" ? (
                        <span className={`inline-flex items-center space-x-1 ${densityClasses.badgePadding} rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30`}>
                          <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                          <span>Ready</span>
                        </span>
                      ) : dep.status === "Progressing" ? (
                        <span className={`inline-flex items-center space-x-1.5 ${densityClasses.badgePadding} rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/30`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                          <span>Progressing</span>
                        </span>
                      ) : (
                        <span className={`inline-flex items-center space-x-1 ${densityClasses.badgePadding} rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30`}>
                          <AlertCircle className="w-3 h-3 flex-shrink-0" />
                          <span>Degraded</span>
                        </span>
                      )}
                    </td>
                  )}

                  {columnVisibility.name && (
                    <td className={`${densityClasses.cellPadding} font-mono font-medium text-slate-200 truncate ${densityClasses.textSize}`}>
                      <div className="flex items-center space-x-1.5">
                        <span className="truncate" title={dep.name}>
                          {dep.name}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(dep.name, "deployment name");
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-slate-300 rounded transition-opacity"
                        >
                          {copiedItem === dep.name ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>
                  )}

                  {columnVisibility.namespace && (
                    <td className={`${densityClasses.cellPadding} whitespace-nowrap`}>
                      <span className={`text-[11px] ${densityClasses.badgePadding} rounded bg-slate-800/80 text-slate-300 font-mono border border-slate-700/50`}>
                        {dep.namespace}
                      </span>
                    </td>
                  )}

                  {columnVisibility.ready && (
                    <td className={`${densityClasses.cellPadding} whitespace-nowrap text-center font-mono ${densityClasses.textSize}`}>
                      <span
                        className={
                          dep.readyReplicas === dep.totalReplicas
                            ? "text-emerald-400 font-semibold"
                            : "text-amber-400 font-semibold"
                        }
                      >
                        {dep.ready}
                      </span>
                    </td>
                  )}

                  {columnVisibility.upToDate && (
                    <td className={`${densityClasses.cellPadding} whitespace-nowrap text-center text-slate-300 font-mono ${densityClasses.textSize}`}>
                      {dep.upToDate}
                    </td>
                  )}

                  {columnVisibility.available && (
                    <td className={`${densityClasses.cellPadding} whitespace-nowrap text-center text-slate-300 font-mono ${densityClasses.textSize}`}>
                      {dep.available}
                    </td>
                  )}

                  {columnVisibility.age && (
                    <td className={`${densityClasses.cellPadding} whitespace-nowrap text-slate-400 font-mono ${densityClasses.textSize}`}>
                      {dep.age}
                    </td>
                  )}

                  {columnVisibility.conditions && (
                    <td
                      className={`${densityClasses.cellPadding} font-mono text-[11px] text-slate-400 truncate`}
                      title={dep.conditions}
                    >
                      {dep.conditions}
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
          <span>Deployments Engine • Apps/v1</span>
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
      <DeploymentContextMenu
        deployment={rowContextMenu?.item ?? null}
        position={rowContextMenu ? { x: rowContextMenu.x, y: rowContextMenu.y } : null}
        onClose={() => setRowContextMenu(null)}
        onInspectDetails={(dep, tab) =>
          setDetailsModal({ isOpen: true, item: dep, tab: tab || "yaml" })
        }
        onShowPods={(name, ns) => {
          if (onShowPods) {
            onShowPods(name, ns);
          } else {
            onSwitchToPods();
          }
        }}
        onShowEvents={(dep) =>
          setDetailsModal({ isOpen: true, item: dep, tab: "events" })
        }
        onCopyName={(dep) => handleCopy(dep.name, "deployment name")}
        onCopySelector={(dep) =>
          handleCopy(`app=${dep.name.split("-")[0]}`, "selector labels")
        }
        onRestartRollout={(dep) =>
          setConfirmDialog({ isOpen: true, type: "restart", item: dep })
        }
        onScaleReplicas={(dep) => setScaleModal({ isOpen: true, item: dep })}
        onDelete={(dep) =>
          setConfirmDialog({ isOpen: true, type: "delete", item: dep })
        }
        onViewLogs={onViewLogs}
        mutationsDisabled={mutationsDisabled}
      />

      {/* Workload Details Modal */}
      <WorkloadDetailsModal
        item={detailsModal.item}
        resourceType="deployment"
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
            setDeploymentsList((prev) =>
              prev.map((d) =>
                d.name === targetName
                  ? {
                      ...d,
                      totalReplicas: newReplicas,
                      ready: `${d.readyReplicas}/${newReplicas}`,
                    }
                  : d
              )
            );
            onToast(`Scaled deployment "${targetName}" to ${newReplicas} replicas.`);
          }}
          itemName={scaleModal.item.name}
          resourceType="deployment"
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
              setDeploymentsList((prev) => prev.filter((d) => d.name !== targetName));
              onToast(`Deployment "${targetName}" deleted.`);
            }
            setConfirmDialog({ isOpen: false, type: "restart", item: null });
          }}
          title={
            confirmDialog.type === "restart"
              ? "Restart Deployment Rollout"
              : "Delete Deployment"
          }
          actionType={confirmDialog.type === "restart" ? "restart" : "delete"}
          context={activeContext}
          namespace={confirmDialog.item.namespace}
          itemName={confirmDialog.item.name}
          confirmLabel={
            confirmDialog.type === "restart"
              ? "Confirm & Restart Rollout"
              : "Confirm & Delete Deployment"
          }
          description={
            confirmDialog.type === "restart"
              ? `Are you sure you want to perform a rolling restart for deployment "${confirmDialog.item.name}"? Active pods will be recreated sequentially.`
              : `Are you sure you want to permanently delete deployment "${confirmDialog.item.name}"? This action cannot be undone.`
          }
        />
      )}
    </div>
  );
};
