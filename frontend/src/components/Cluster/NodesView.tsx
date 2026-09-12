import React, { useState, useEffect, useMemo } from "react";
import {
  Cpu,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCw,
  Copy,
  Check,
  Server,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Sliders,
  Network,
} from "lucide-react";
import {
  useTableColumns,
  ColumnDefinition,
  parseAgeToSeconds,
} from "../../hooks/useTableColumns";
import { ColumnVisibilityMenu } from "../Common/ColumnVisibilityMenu";
import { NodeContextMenu } from "./NodeContextMenu";
import { ResourceYamlModal } from "./ResourceYamlModal";
import { kubeApi } from "../../services/kubeApi";
import { ipc } from "../../../wailsjs/go/models";
import { reportApiError } from "../../hooks/useNotificationStore";

export type NodeColumnKey =
  | "status"
  | "name"
  | "roles"
  | "version"
  | "internalIp"
  | "osImage"
  | "age";

export const NODE_COLUMNS: ColumnDefinition<NodeColumnKey>[] = [
  {
    key: "status",
    label: "Status",
    defaultWidth: 110,
    minWidth: 85,
    align: "center",
    resizable: true,
    sortable: true,
  },
  {
    key: "name",
    label: "Node Name",
    defaultWidth: 260,
    minWidth: 160,
    align: "left",
    required: true,
    resizable: true,
    sortable: true,
  },
  {
    key: "roles",
    label: "Roles",
    defaultWidth: 150,
    minWidth: 100,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "version",
    label: "Version",
    defaultWidth: 130,
    minWidth: 90,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "internalIp",
    label: "Internal IP",
    defaultWidth: 140,
    minWidth: 100,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "osImage",
    label: "OS Image",
    defaultWidth: 190,
    minWidth: 120,
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

interface NodesViewProps {
  onToast: (msg: string) => void;
}

export const NodesView: React.FC<NodesViewProps> = ({ onToast }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [nodesList, setNodesList] = useState<ipc.NodeSummary[]>([]);
  const [loading, setLoading] = useState(false);

  // Inspector modal state
  const [yamlModalNode, setYamlModalNode] = useState<ipc.NodeSummary | null>(null);

  // Row context menu state
  const [rowContextMenu, setRowContextMenu] = useState<{
    x: number;
    y: number;
    node: ipc.NodeSummary;
  } | null>(null);

  const fetchNodes = async () => {
    setLoading(true);
    try {
      const data = await kubeApi.getNodes();
      setNodesList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("[NODES] Failed to fetch nodes:", err);
      setNodesList([]);
      reportApiError(err, "nodes", "");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNodes();
  }, []);

  const {
    columns: _allCols,
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
  } = useTableColumns<NodeColumnKey>({
    resourceKey: "nodes",
    columns: NODE_COLUMNS,
    defaultSort: { column: "name", direction: "asc" },
  });

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(id);
    onToast(`Copied ${text} to clipboard`);
    setTimeout(() => setCopiedItem(null), 1500);
  };

  const handleRowContextMenu = (e: React.MouseEvent, node: ipc.NodeSummary) => {
    e.preventDefault();
    e.stopPropagation();

    const menuWidth = 220;
    const menuHeight = 180;
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
      node,
    });
  };

  const filteredNodes = useMemo(() => {
    return nodesList.filter((node) => {
      const q = searchTerm.toLowerCase().trim();
      if (!q) return true;
      return (
        node.name.toLowerCase().includes(q) ||
        node.roles.toLowerCase().includes(q) ||
        node.internalIp.toLowerCase().includes(q) ||
        node.version.toLowerCase().includes(q)
      );
    });
  }, [nodesList, searchTerm]);

  const handleAutoFitColumn = (colKey: NodeColumnKey) => {
    triggerAutoFit(colKey, filteredNodes, (node: ipc.NodeSummary, key: NodeColumnKey) => {
      switch (key) {
        case "status":
          return node.status;
        case "name":
          return node.name;
        case "roles":
          return node.roles;
        case "version":
          return node.version;
        case "internalIp":
          return node.internalIp;
        case "osImage":
          return node.osImage;
        case "age":
          return node.age;
        default:
          return "";
      }
    });
  };

  const sortedNodes = useMemo(() => {
    if (!sortConfig) return filteredNodes;
    const { column, direction } = sortConfig;
    const mul = direction === "asc" ? 1 : -1;

    return [...filteredNodes].sort((a, b) => {
      if (column === "age") {
        return (parseAgeToSeconds(a.age) - parseAgeToSeconds(b.age)) * mul;
      }
      const valA = (a[column as keyof ipc.NodeSummary] || "").toString().toLowerCase();
      const valB = (b[column as keyof ipc.NodeSummary] || "").toString().toLowerCase();
      return valA.localeCompare(valB) * mul;
    });
  }, [filteredNodes, sortConfig]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden select-none">
      {/* View Toolbar Header */}
      <div className="flex-shrink-0 px-4 py-2.5 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <h1 className="font-bold text-sm text-slate-100 tracking-wide">
              Nodes
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60 font-mono">
              {nodesList.length}
            </span>
          </div>

          <button
            type="button"
            onClick={fetchNodes}
            disabled={loading}
            title="Refresh cluster nodes"
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-cyan-400" : ""}`} />
          </button>
        </div>

        {/* Search Input */}
        <div className="flex items-center space-x-3">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search nodes by name, role, IP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-md pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-cyan-500/50 transition-colors"
            />
          </div>

          <button
            type="button"
            onClick={handleHeaderContextMenu}
            title="Configure visible columns"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800 transition-colors cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="flex-1 overflow-auto bg-slate-950 relative">
        <table className="w-full text-left border-collapse text-xs table-fixed">
          {/* Table Header */}
          <thead className="bg-slate-900/90 text-slate-400 font-semibold border-b border-slate-800 sticky top-0 z-10 backdrop-blur-xs select-none">
            <tr>
              {visibleColumns.map((col) => {
                const width = columnWidths[col.key];
                const isSorted = sortConfig?.column === col.key;
                const sortDir = isSorted ? sortConfig.direction : null;

                return (
                  <th
                    key={col.key}
                    style={{ width: `${width}px` }}
                    onContextMenu={handleHeaderContextMenu}
                    className="p-2.5 relative group cursor-pointer hover:text-slate-200 transition-colors"
                  >
                    <div
                      className="flex items-center space-x-1.5"
                      onClick={() => handleSortClick(col)}
                    >
                      <span className="truncate font-medium">{col.label}</span>
                      <span className="text-slate-500 group-hover:text-slate-400">
                        {sortDir === "asc" ? (
                          <ChevronUp className="w-3 h-3 text-cyan-400" />
                        ) : sortDir === "desc" ? (
                          <ChevronDown className="w-3 h-3 text-cyan-400" />
                        ) : (
                          <ArrowUpDown className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60" />
                        )}
                      </span>
                    </div>

                    {/* Resizer Handle */}
                    {col.resizable && (
                      <div
                        onMouseDown={(e) => handleResizeStart(e, col)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleAutoFitColumn(col.key);
                        }}
                        className={`absolute right-0 top-0 bottom-0 w-1.5 hover:bg-cyan-500/60 cursor-col-resize z-20 ${
                          resizingColKey === col.key ? "bg-cyan-500" : ""
                        }`}
                        title="Drag to resize, double click to auto-fit"
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
            {sortedNodes.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length}
                  className="py-16 text-center text-slate-500"
                >
                  {loading ? (
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <RotateCw className="w-5 h-5 animate-spin text-cyan-400" />
                      <span>Loading cluster nodes...</span>
                    </div>
                  ) : (
                    <span>No cluster nodes found matching search filter.</span>
                  )}
                </td>
              </tr>
            ) : (
              sortedNodes.map((node) => {
                const isReady = node.status === "Ready";

                return (
                  <tr
                    key={node.name}
                    onContextMenu={(e) => handleRowContextMenu(e, node)}
                    onDoubleClick={() => setYamlModalNode(node)}
                    className="hover:bg-slate-900/60 transition-colors cursor-pointer group"
                  >
                    {visibleColumns.map((col) => {
                      switch (col.key) {
                        case "status":
                          return (
                            <td key={col.key} className="p-2.5 text-center">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                                  isReady
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                    : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                                }`}
                              >
                                {isReady ? (
                                  <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                                ) : (
                                  <AlertCircle className="w-2.5 h-2.5 mr-1" />
                                )}
                                {node.status}
                              </span>
                            </td>
                          );
                        case "name":
                          return (
                            <td
                              key={col.key}
                              className="p-2.5 font-sans font-medium text-slate-200 truncate"
                            >
                              <div className="flex items-center space-x-2">
                                <Server className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                                <span className="truncate">{node.name}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopy(node.name, `node-${node.name}`);
                                  }}
                                  title="Copy node name"
                                  className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-slate-300 transition-opacity"
                                >
                                  {copiedItem === `node-${node.name}` ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </td>
                          );
                        case "roles":
                          return (
                            <td key={col.key} className="p-2.5 text-slate-300 truncate">
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60 text-[10px]">
                                {node.roles}
                              </span>
                            </td>
                          );
                        case "version":
                          return (
                            <td key={col.key} className="p-2.5 text-cyan-400 truncate">
                              {node.version}
                            </td>
                          );
                        case "internalIp":
                          return (
                            <td key={col.key} className="p-2.5 text-slate-300 truncate">
                              <div className="flex items-center space-x-1.5">
                                <Network className="w-3 h-3 text-slate-500 flex-shrink-0" />
                                <span>{node.internalIp}</span>
                              </div>
                            </td>
                          );
                        case "osImage":
                          return (
                            <td key={col.key} className="p-2.5 text-slate-400 truncate">
                              {node.osImage}
                            </td>
                          );
                        case "age":
                          return (
                            <td key={col.key} className="p-2.5 text-slate-400 truncate">
                              <div className="flex items-center space-x-1">
                                <Clock className="w-3 h-3 text-slate-500 flex-shrink-0" />
                                <span>{node.age}</span>
                              </div>
                            </td>
                          );
                        default:
                          return null;
                      }
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Column Visibility Context Menu */}
      <ColumnVisibilityMenu
        columns={NODE_COLUMNS}
        columnVisibility={columnVisibility}
        onToggleVisibility={toggleColumnVisibility}
        onResetToDefaults={resetToDefaults}
        onClose={closeContextMenu}
        position={contextMenu}
        menuRef={contextMenuRef}
      />

      {/* Row Right-Click Context Menu */}
      {rowContextMenu && (
        <NodeContextMenu
          x={rowContextMenu.x}
          y={rowContextMenu.y}
          node={rowContextMenu.node}
          onClose={() => setRowContextMenu(null)}
          onInspectYaml={(node) => setYamlModalNode(node)}
          onToast={onToast}
        />
      )}

      {/* YAML Manifest Inspector Modal */}
      {yamlModalNode && (
        <ResourceYamlModal
          isOpen={!!yamlModalNode}
          onClose={() => setYamlModalNode(null)}
          kind="node"
          name={yamlModalNode.name}
          title={`Node: ${yamlModalNode.name}`}
        />
      )}
    </div>
  );
};
