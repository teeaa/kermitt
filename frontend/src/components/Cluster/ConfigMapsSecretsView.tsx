import React, { useState, useEffect, useMemo } from "react";
import {
  Database,
  Lock,
  Search,
  RotateCw,
  Copy,
  Check,
  Clock,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Sliders,
  KeyRound,
  FileCode,
  Trash2,
} from "lucide-react";
import {
  useTableColumns,
  ColumnDefinition,
  parseAgeToSeconds,
} from "../../hooks/useTableColumns";
import { ColumnVisibilityMenu } from "../Common/ColumnVisibilityMenu";
import { ConfirmDialog } from "../Common/ConfirmDialog";
import { ConfigMapsSecretsContextMenu } from "./ConfigMapsSecretsContextMenu";
import { ConfigDataModal } from "./ConfigDataModal";
import { ResourceYamlModal } from "./ResourceYamlModal";
import { kubeApi } from "../../services/kubeApi";
import { ipc } from "../../../wailsjs/go/models";
import { reportApiError } from "../../hooks/useNotificationStore";

export type ConfigMapColumnKey = "name" | "namespace" | "keysCount" | "age";

export const CONFIGMAP_COLUMNS: ColumnDefinition<ConfigMapColumnKey>[] = [
  {
    key: "name",
    label: "ConfigMap Name",
    defaultWidth: 280,
    minWidth: 160,
    align: "left",
    required: true,
    resizable: true,
    sortable: true,
  },
  {
    key: "namespace",
    label: "Namespace",
    defaultWidth: 160,
    minWidth: 100,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "keysCount",
    label: "Keys Count",
    defaultWidth: 120,
    minWidth: 80,
    align: "right",
    resizable: true,
    sortable: true,
  },
  {
    key: "age",
    label: "Age",
    defaultWidth: 100,
    minWidth: 70,
    align: "left",
    resizable: true,
    sortable: true,
  },
];

export type SecretColumnKey = "name" | "namespace" | "type" | "keysCount" | "age";

export const SECRET_COLUMNS: ColumnDefinition<SecretColumnKey>[] = [
  {
    key: "name",
    label: "Secret Name",
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
    defaultWidth: 150,
    minWidth: 100,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "type",
    label: "Type",
    defaultWidth: 180,
    minWidth: 110,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "keysCount",
    label: "Keys Count",
    defaultWidth: 120,
    minWidth: 80,
    align: "right",
    resizable: true,
    sortable: true,
  },
  {
    key: "age",
    label: "Age",
    defaultWidth: 100,
    minWidth: 70,
    align: "left",
    resizable: true,
    sortable: true,
  },
];

interface ConfigMapsSecretsViewProps {
  activeNamespace: string;
  activeContext?: string;
  onToast: (msg: string, type?: "info" | "success" | "warning" | "error") => void;
  onCountsChange?: () => void;
}

export const ConfigMapsSecretsView: React.FC<ConfigMapsSecretsViewProps> = ({
  activeNamespace,
  activeContext = "current",
  onToast,
  onCountsChange,
}) => {
  const [activeTab, setActiveTab] = useState<"configmaps" | "secrets">("configmaps");
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  const [configMapsList, setConfigMapsList] = useState<ipc.ConfigMapSummary[]>([]);
  const [secretsList, setSecretsList] = useState<ipc.SecretSummary[]>([]);
  const [loading, setLoading] = useState(false);

  // Inspector data modal state
  const [inspectDataTarget, setInspectDataTarget] = useState<{
    kind: "configmap" | "secret";
    namespace: string;
    name: string;
  } | null>(null);

  // Inspector yaml modal state
  const [inspectYamlTarget, setInspectYamlTarget] = useState<{
    kind: string;
    namespace: string;
    name: string;
    title: string;
  } | null>(null);

  // Delete confirm dialog state
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    kind: "configmap" | "secret";
    item: ipc.ConfigMapSummary | ipc.SecretSummary;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Row context menu state
  const [rowContextMenu, setRowContextMenu] = useState<{
    x: number;
    y: number;
    item: ipc.ConfigMapSummary | ipc.SecretSummary;
    type: "configmap" | "secret";
  } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [cmData, secData] = await Promise.all([
        kubeApi.getConfigMaps(activeNamespace),
        kubeApi.getSecrets(activeNamespace),
      ]);
      setConfigMapsList(Array.isArray(cmData) ? cmData : []);
      setSecretsList(Array.isArray(secData) ? secData : []);
      if (onCountsChange) {
        onCountsChange();
      }
    } catch (err) {
      console.error("[CONFIG-SECRETS] Failed to fetch data:", err);
      reportApiError(err, "configmaps & secrets", activeNamespace);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeNamespace]);

  // Columns hook for ConfigMaps
  const cmTable = useTableColumns<ConfigMapColumnKey>({
    resourceKey: "configmaps",
    columns: CONFIGMAP_COLUMNS,
    defaultSort: { column: "name", direction: "asc" },
  });

  // Columns hook for Secrets
  const secTable = useTableColumns<SecretColumnKey>({
    resourceKey: "secrets",
    columns: SECRET_COLUMNS,
    defaultSort: { column: "name", direction: "asc" },
  });

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(id);
    onToast(`Copied ${text} to clipboard`, "info");
    setTimeout(() => setCopiedItem(null), 1500);
  };

  const handleRowContextMenu = (
    e: React.MouseEvent,
    item: ipc.ConfigMapSummary | ipc.SecretSummary,
    type: "configmap" | "secret"
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const menuWidth = 220;
    const menuHeight = 220;
    const padding = 10;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth - padding) {
      x = window.innerWidth - menuWidth - padding;
    }
    if (y + menuHeight > window.innerHeight - padding) {
      y = window.innerHeight - menuHeight - padding;
    }

    setRowContextMenu({ x, y, item, type });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmTarget) return;
    setIsDeleting(true);
    const { kind, item } = deleteConfirmTarget;

    try {
      if (kind === "configmap") {
        await kubeApi.deleteConfigMap(item.namespace, item.name);
        onToast(`ConfigMap "${item.name}" deleted successfully`, "success");
      } else {
        await kubeApi.deleteSecret(item.namespace, item.name);
        onToast(`Secret "${item.name}" deleted successfully`, "success");
      }
      setDeleteConfirmTarget(null);
      await fetchData();
    } catch (err: any) {
      console.error(`Failed to delete ${kind}:`, err);
      onToast(`Failed to delete ${kind} "${item.name}": ${err?.message || "Unknown error"}`, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter and sort ConfigMaps
  const filteredConfigMaps = useMemo(() => {
    let result = configMapsList.filter((cm) => {
      const matchSearch =
        cm.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cm.namespace.toLowerCase().includes(searchTerm.toLowerCase());
      return matchSearch;
    });

    if (cmTable.sortConfig) {
      const { column, direction } = cmTable.sortConfig;
      result = [...result].sort((a, b) => {
        let valA: any = a[column];
        let valB: any = b[column];

        if (column === "age") {
          valA = parseAgeToSeconds(a.age);
          valB = parseAgeToSeconds(b.age);
        } else if (column === "keysCount") {
          valA = Number(a.keysCount || 0);
          valB = Number(b.keysCount || 0);
        } else {
          valA = (valA || "").toString().toLowerCase();
          valB = (valB || "").toString().toLowerCase();
        }

        if (valA < valB) return direction === "asc" ? -1 : 1;
        if (valA > valB) return direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [configMapsList, searchTerm, cmTable.sortConfig]);

  // Filter and sort Secrets
  const filteredSecrets = useMemo(() => {
    let result = secretsList.filter((sec) => {
      const matchSearch =
        sec.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sec.namespace.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sec.type.toLowerCase().includes(searchTerm.toLowerCase());
      return matchSearch;
    });

    if (secTable.sortConfig) {
      const { column, direction } = secTable.sortConfig;
      result = [...result].sort((a, b) => {
        let valA: any = a[column];
        let valB: any = b[column];

        if (column === "age") {
          valA = parseAgeToSeconds(a.age);
          valB = parseAgeToSeconds(b.age);
        } else if (column === "keysCount") {
          valA = Number(a.keysCount || 0);
          valB = Number(b.keysCount || 0);
        } else {
          valA = (valA || "").toString().toLowerCase();
          valB = (valB || "").toString().toLowerCase();
        }

        if (valA < valB) return direction === "asc" ? -1 : 1;
        if (valA > valB) return direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [secretsList, searchTerm, secTable.sortConfig]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-200 overflow-hidden font-sans select-none">
      {/* Top action / navigation header */}
      <div className="h-14 border-b border-slate-800/80 px-6 flex items-center justify-between flex-shrink-0 bg-slate-900/30">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-slate-100 text-sm tracking-tight">
                  Config &amp; Secrets
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/50">
                  {activeNamespace || "all-namespaces"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Application configuration key-value pairs and secure secret storage
              </p>
            </div>
          </div>

          {/* Sub-tabs switch */}
          <div className="flex bg-slate-800/60 p-1 rounded-lg border border-slate-700/50 ml-4">
            <button
              onClick={() => setActiveTab("configmaps")}
              className={`flex items-center space-x-2 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                activeTab === "configmaps"
                  ? "bg-slate-700 text-cyan-400 shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Database className="w-3.5 h-3.5 text-blue-400" />
              <span>ConfigMaps</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-900/80 text-slate-300">
                {configMapsList.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("secrets")}
              className={`flex items-center space-x-2 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                activeTab === "secrets"
                  ? "bg-slate-700 text-amber-400 shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Secrets</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-900/80 text-slate-300">
                {secretsList.length}
              </span>
            </button>
          </div>
        </div>

        {/* Right side: Search, Refresh, Column settings */}
        <div className="flex items-center space-x-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder={`Filter ${activeTab}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-xs rounded-lg pl-8 pr-3 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-slate-700 w-52 transition-all font-mono"
            />
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-50"
            title="Refresh list"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-cyan-400" : ""}`} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              if (activeTab === "configmaps") {
                cmTable.setContextMenu({ x: rect.right - 224, y: rect.bottom + 5 });
              } else {
                secTable.setContextMenu({ x: rect.right - 224, y: rect.bottom + 5 });
              }
            }}
            className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Customize table columns"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Table Area */}
      <div className="flex-1 overflow-auto bg-slate-950/60 flex flex-col min-h-0">
        {activeTab === "configmaps" ? (
          <div className="inline-block min-w-full align-middle">
            <table className="min-w-full border-collapse text-left text-xs table-fixed">
              <thead className="sticky top-0 z-10 bg-slate-900/90 backdrop-blur-xs border-b border-slate-800/80 text-slate-400 font-mono text-[11px]">
                <tr>
                  {cmTable.visibleColumns.map((col) => {
                    const width = cmTable.columnWidths[col.key];
                    const isSorted = cmTable.sortConfig?.column === col.key;
                    const sortDirection = isSorted ? cmTable.sortConfig?.direction : null;

                    return (
                      <th
                        key={col.key}
                        style={{ width: `${width}px` }}
                        onContextMenu={cmTable.handleHeaderContextMenu}
                        className={`relative px-4 py-2.5 font-medium select-none group ${
                          col.sortable ? "cursor-pointer hover:text-slate-200" : ""
                        }`}
                        onClick={() => col.sortable && cmTable.handleSortClick(col)}
                      >
                        <div
                          className={`flex items-center space-x-1.5 ${
                            col.align === "right"
                              ? "justify-end"
                              : col.align === "center"
                              ? "justify-center"
                              : "justify-start"
                          }`}
                        >
                          <span>{col.label}</span>
                          {col.sortable && (
                            <span className="text-slate-500 group-hover:text-slate-300 transition-colors">
                              {sortDirection === "asc" ? (
                                <ChevronUp className="w-3 h-3 text-cyan-400" />
                              ) : sortDirection === "desc" ? (
                                <ChevronDown className="w-3 h-3 text-cyan-400" />
                              ) : (
                                <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40" />
                              )}
                            </span>
                          )}
                        </div>

                        {col.resizable && (
                          <div
                            onMouseDown={(e) => cmTable.handleResizeStart(e, col)}
                            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-cyan-500/50 group-hover:bg-slate-700/40"
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-850/60 font-sans text-xs">
                {loading && configMapsList.length === 0 ? (
                  <tr>
                    <td
                      colSpan={cmTable.visibleColumns.length}
                      className="py-20 text-center text-slate-500 font-mono"
                    >
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <RotateCw className="w-5 h-5 animate-spin text-cyan-400" />
                        <span>Loading configmaps from cluster...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredConfigMaps.length === 0 ? (
                  <tr>
                    <td
                      colSpan={cmTable.visibleColumns.length}
                      className="py-20 text-center text-slate-500 font-mono"
                    >
                      {searchTerm
                        ? `No ConfigMaps matching "${searchTerm}"`
                        : "No ConfigMaps found in this namespace."}
                    </td>
                  </tr>
                ) : (
                  filteredConfigMaps.map((cm) => (
                    <tr
                      key={`${cm.namespace}/${cm.name}`}
                      onContextMenu={(e) => handleRowContextMenu(e, cm, "configmap")}
                      onClick={() =>
                        setInspectDataTarget({
                          kind: "configmap",
                          namespace: cm.namespace,
                          name: cm.name,
                        })
                      }
                      className="hover:bg-slate-900/50 cursor-pointer transition-colors group"
                    >
                      {cmTable.visibleColumns.map((col) => {
                        if (col.key === "name") {
                          return (
                            <td
                              key={col.key}
                              className="px-4 py-2 text-slate-100 font-mono font-medium truncate max-w-0"
                            >
                              <div className="flex items-center space-x-2">
                                <Database className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                                <span className="truncate group-hover:text-blue-300 transition-colors">
                                  {cm.name}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopy(cm.name, `cm-${cm.name}`);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-slate-100 text-slate-500 rounded transition-opacity"
                                  title="Copy ConfigMap Name"
                                >
                                  {copiedItem === `cm-${cm.name}` ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </td>
                          );
                        }

                        if (col.key === "namespace") {
                          return (
                            <td
                              key={col.key}
                              className="px-4 py-2 text-slate-400 font-mono text-[11px] truncate max-w-0"
                            >
                              {cm.namespace}
                            </td>
                          );
                        }

                        if (col.key === "keysCount") {
                          return (
                            <td
                              key={col.key}
                              className="px-4 py-2 text-right text-slate-300 font-mono text-[11px]"
                            >
                              <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 font-medium">
                                {cm.keysCount} {cm.keysCount === 1 ? "key" : "keys"}
                              </span>
                            </td>
                          );
                        }

                        if (col.key === "age") {
                          return (
                            <td
                              key={col.key}
                              className="px-4 py-2 text-slate-400 font-mono text-[11px]"
                            >
                              <div className="flex items-center space-x-1.5">
                                <Clock className="w-3 h-3 text-slate-500" />
                                <span>{cm.age}</span>
                              </div>
                            </td>
                          );
                        }

                        return null;
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="inline-block min-w-full align-middle">
            <table className="min-w-full border-collapse text-left text-xs table-fixed">
              <thead className="sticky top-0 z-10 bg-slate-900/90 backdrop-blur-xs border-b border-slate-800/80 text-slate-400 font-mono text-[11px]">
                <tr>
                  {secTable.visibleColumns.map((col) => {
                    const width = secTable.columnWidths[col.key];
                    const isSorted = secTable.sortConfig?.column === col.key;
                    const sortDirection = isSorted ? secTable.sortConfig?.direction : null;

                    return (
                      <th
                        key={col.key}
                        style={{ width: `${width}px` }}
                        onContextMenu={secTable.handleHeaderContextMenu}
                        className={`relative px-4 py-2.5 font-medium select-none group ${
                          col.sortable ? "cursor-pointer hover:text-slate-200" : ""
                        }`}
                        onClick={() => col.sortable && secTable.handleSortClick(col)}
                      >
                        <div
                          className={`flex items-center space-x-1.5 ${
                            col.align === "right"
                              ? "justify-end"
                              : col.align === "center"
                              ? "justify-center"
                              : "justify-start"
                          }`}
                        >
                          <span>{col.label}</span>
                          {col.sortable && (
                            <span className="text-slate-500 group-hover:text-slate-300 transition-colors">
                              {sortDirection === "asc" ? (
                                <ChevronUp className="w-3 h-3 text-cyan-400" />
                              ) : sortDirection === "desc" ? (
                                <ChevronDown className="w-3 h-3 text-cyan-400" />
                              ) : (
                                <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40" />
                              )}
                            </span>
                          )}
                        </div>

                        {col.resizable && (
                          <div
                            onMouseDown={(e) => secTable.handleResizeStart(e, col)}
                            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-cyan-500/50 group-hover:bg-slate-700/40"
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-850/60 font-sans text-xs">
                {loading && secretsList.length === 0 ? (
                  <tr>
                    <td
                      colSpan={secTable.visibleColumns.length}
                      className="py-20 text-center text-slate-500 font-mono"
                    >
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <RotateCw className="w-5 h-5 animate-spin text-cyan-400" />
                        <span>Loading secrets from cluster...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredSecrets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={secTable.visibleColumns.length}
                      className="py-20 text-center text-slate-500 font-mono"
                    >
                      {searchTerm
                        ? `No Secrets matching "${searchTerm}"`
                        : "No Secrets found in this namespace."}
                    </td>
                  </tr>
                ) : (
                  filteredSecrets.map((sec) => (
                    <tr
                      key={`${sec.namespace}/${sec.name}`}
                      onContextMenu={(e) => handleRowContextMenu(e, sec, "secret")}
                      onClick={() =>
                        setInspectDataTarget({
                          kind: "secret",
                          namespace: sec.namespace,
                          name: sec.name,
                        })
                      }
                      className="hover:bg-slate-900/50 cursor-pointer transition-colors group"
                    >
                      {secTable.visibleColumns.map((col) => {
                        if (col.key === "name") {
                          return (
                            <td
                              key={col.key}
                              className="px-4 py-2 text-slate-100 font-mono font-medium truncate max-w-0"
                            >
                              <div className="flex items-center space-x-2">
                                <Lock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                                <span className="truncate group-hover:text-amber-300 transition-colors">
                                  {sec.name}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopy(sec.name, `sec-${sec.name}`);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-slate-100 text-slate-500 rounded transition-opacity"
                                  title="Copy Secret Name"
                                >
                                  {copiedItem === `sec-${sec.name}` ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </td>
                          );
                        }

                        if (col.key === "namespace") {
                          return (
                            <td
                              key={col.key}
                              className="px-4 py-2 text-slate-400 font-mono text-[11px] truncate max-w-0"
                            >
                              {sec.namespace}
                            </td>
                          );
                        }

                        if (col.key === "type") {
                          return (
                            <td
                              key={col.key}
                              className="px-4 py-2 text-slate-300 font-mono text-[11px] truncate max-w-0"
                            >
                              <span className="px-1.5 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-800/40">
                                {sec.type}
                              </span>
                            </td>
                          );
                        }

                        if (col.key === "keysCount") {
                          return (
                            <td
                              key={col.key}
                              className="px-4 py-2 text-right text-slate-300 font-mono text-[11px]"
                            >
                              <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 font-medium">
                                {sec.keysCount} {sec.keysCount === 1 ? "key" : "keys"}
                              </span>
                            </td>
                          );
                        }

                        if (col.key === "age") {
                          return (
                            <td
                              key={col.key}
                              className="px-4 py-2 text-slate-400 font-mono text-[11px]"
                            >
                              <div className="flex items-center space-x-1.5">
                                <Clock className="w-3 h-3 text-slate-500" />
                                <span>{sec.age}</span>
                              </div>
                            </td>
                          );
                        }

                        return null;
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Column Visibility Menus */}
      {activeTab === "configmaps" ? (
        <ColumnVisibilityMenu
          columns={CONFIGMAP_COLUMNS}
          columnVisibility={cmTable.columnVisibility}
          onToggleVisibility={cmTable.toggleColumnVisibility}
          onResetToDefaults={cmTable.resetToDefaults}
          onClose={cmTable.closeContextMenu}
          position={cmTable.contextMenu}
          menuRef={cmTable.contextMenuRef}
        />
      ) : (
        <ColumnVisibilityMenu
          columns={SECRET_COLUMNS}
          columnVisibility={secTable.columnVisibility}
          onToggleVisibility={secTable.toggleColumnVisibility}
          onResetToDefaults={secTable.resetToDefaults}
          onClose={secTable.closeContextMenu}
          position={secTable.contextMenu}
          menuRef={secTable.contextMenuRef}
        />
      )}

      {/* Row context menu */}
      {rowContextMenu && (
        <ConfigMapsSecretsContextMenu
          x={rowContextMenu.x}
          y={rowContextMenu.y}
          item={rowContextMenu.item}
          type={rowContextMenu.type}
          onClose={() => setRowContextMenu(null)}
          onViewData={(item) =>
            setInspectDataTarget({
              kind: rowContextMenu.type,
              namespace: item.namespace,
              name: item.name,
            })
          }
          onInspectYaml={(item) =>
            setInspectYamlTarget({
              kind: rowContextMenu.type,
              namespace: item.namespace,
              name: item.name,
              title: `${rowContextMenu.type.toUpperCase()}: ${item.name}`,
            })
          }
          onDelete={(item) =>
            setDeleteConfirmTarget({
              kind: rowContextMenu.type,
              item,
            })
          }
          onToast={onToast}
        />
      )}

      {/* Data & keys modal */}
      {inspectDataTarget && (
        <ConfigDataModal
          isOpen={!!inspectDataTarget}
          onClose={() => setInspectDataTarget(null)}
          kind={inspectDataTarget.kind}
          namespace={inspectDataTarget.namespace}
          name={inspectDataTarget.name}
          onToast={onToast}
        />
      )}

      {/* YAML modal */}
      {inspectYamlTarget && (
        <ResourceYamlModal
          isOpen={!!inspectYamlTarget}
          onClose={() => setInspectYamlTarget(null)}
          kind={inspectYamlTarget.kind}
          namespace={inspectYamlTarget.namespace}
          name={inspectYamlTarget.name}
          title={inspectYamlTarget.title}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirmTarget && (
        <ConfirmDialog
          isOpen={!!deleteConfirmTarget}
          onClose={() => setDeleteConfirmTarget(null)}
          onConfirm={handleDeleteConfirm}
          title={`Delete ${deleteConfirmTarget.kind === "secret" ? "Secret" : "ConfigMap"}`}
          actionType="delete"
          context={activeContext}
          namespace={deleteConfirmTarget.item.namespace}
          itemName={deleteConfirmTarget.item.name}
          isSubmitting={isDeleting}
          description={
            <div className="space-y-2">
              <p>
                Are you sure you want to permanently delete the{" "}
                <span className="font-semibold text-slate-100">
                  {deleteConfirmTarget.kind === "secret" ? "Secret" : "ConfigMap"}
                </span>{" "}
                <code className="px-1.5 py-0.5 rounded bg-slate-800 text-rose-300 font-mono text-xs">
                  {deleteConfirmTarget.item.name}
                </code>{" "}
                in namespace{" "}
                <code className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-xs">
                  {deleteConfirmTarget.item.namespace}
                </code>
                ?
              </p>
              <p className="text-rose-400/90 text-xs">
                Any pods or applications mounting this configuration may experience errors or fail to restart.
              </p>
            </div>
          }
        />
      )}
    </div>
  );
};
