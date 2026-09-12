import React, { useState, useEffect, useMemo } from "react";
import {
  Network,
  Globe,
  Search,
  RotateCw,
  Copy,
  Check,
  Clock,
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
import { ServicesIngressContextMenu } from "./ServicesIngressContextMenu";
import { ResourceYamlModal } from "./ResourceYamlModal";
import { kubeApi } from "../../services/kubeApi";
import { ipc } from "../../../wailsjs/go/models";
import { reportApiError } from "../../hooks/useNotificationStore";

export type ServiceColumnKey =
  | "name"
  | "namespace"
  | "type"
  | "clusterIp"
  | "externalIp"
  | "ports"
  | "age";

export const SERVICE_COLUMNS: ColumnDefinition<ServiceColumnKey>[] = [
  {
    key: "name",
    label: "Service Name",
    defaultWidth: 240,
    minWidth: 150,
    align: "left",
    required: true,
    resizable: true,
    sortable: true,
  },
  {
    key: "namespace",
    label: "Namespace",
    defaultWidth: 130,
    minWidth: 90,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "type",
    label: "Type",
    defaultWidth: 130,
    minWidth: 90,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "clusterIp",
    label: "Cluster IP",
    defaultWidth: 140,
    minWidth: 100,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "externalIp",
    label: "External IP",
    defaultWidth: 140,
    minWidth: 100,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "ports",
    label: "Ports",
    defaultWidth: 180,
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

export type IngressColumnKey =
  | "name"
  | "namespace"
  | "hosts"
  | "endpoints"
  | "className"
  | "age";

export const INGRESS_COLUMNS: ColumnDefinition<IngressColumnKey>[] = [
  {
    key: "name",
    label: "Ingress Name",
    defaultWidth: 240,
    minWidth: 150,
    align: "left",
    required: true,
    resizable: true,
    sortable: true,
  },
  {
    key: "namespace",
    label: "Namespace",
    defaultWidth: 130,
    minWidth: 90,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "hosts",
    label: "Hosts",
    defaultWidth: 200,
    minWidth: 120,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "endpoints",
    label: "Endpoints",
    defaultWidth: 180,
    minWidth: 100,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "className",
    label: "Class",
    defaultWidth: 120,
    minWidth: 80,
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

interface ServicesIngressViewProps {
  activeNamespace: string;
  onToast: (msg: string) => void;
}

export const ServicesIngressView: React.FC<ServicesIngressViewProps> = ({
  activeNamespace,
  onToast,
}) => {
  const [activeTab, setActiveTab] = useState<"services" | "ingresses">("services");
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  const [servicesList, setServicesList] = useState<ipc.ServiceSummary[]>([]);
  const [ingressesList, setIngressesList] = useState<ipc.IngressSummary[]>([]);
  const [loading, setLoading] = useState(false);

  // Inspector modal state
  const [inspectYamlTarget, setInspectYamlTarget] = useState<{
    kind: string;
    namespace: string;
    name: string;
    title: string;
  } | null>(null);

  // Row context menu state
  const [rowContextMenu, setRowContextMenu] = useState<{
    x: number;
    y: number;
    item: ipc.ServiceSummary | ipc.IngressSummary;
    type: "service" | "ingress";
  } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [svcData, ingData] = await Promise.all([
        kubeApi.getServices(activeNamespace),
        kubeApi.getIngresses(activeNamespace),
      ]);
      setServicesList(Array.isArray(svcData) ? svcData : []);
      setIngressesList(Array.isArray(ingData) ? ingData : []);
    } catch (err) {
      console.error("[SERVICES-INGRESS] Failed to fetch data:", err);
      reportApiError(err, "services & ingress", activeNamespace);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeNamespace]);

  // Columns hook for Services
  const svcTable = useTableColumns<ServiceColumnKey>({
    resourceKey: "services",
    columns: SERVICE_COLUMNS,
    defaultSort: { column: "name", direction: "asc" },
  });

  // Columns hook for Ingresses
  const ingTable = useTableColumns<IngressColumnKey>({
    resourceKey: "ingresses",
    columns: INGRESS_COLUMNS,
    defaultSort: { column: "name", direction: "asc" },
  });

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(id);
    onToast(`Copied ${text} to clipboard`);
    setTimeout(() => setCopiedItem(null), 1500);
  };

  const handleRowContextMenu = (
    e: React.MouseEvent,
    item: ipc.ServiceSummary | ipc.IngressSummary,
    type: "service" | "ingress"
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

    setRowContextMenu({
      x: Math.max(padding, x),
      y: Math.max(padding, y),
      item,
      type,
    });
  };

  // Filter Services
  const filteredServices = useMemo(() => {
    return servicesList.filter((s) => {
      if (activeNamespace !== "all" && s.namespace !== activeNamespace) return false;
      const q = searchTerm.toLowerCase().trim();
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.namespace.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q) ||
        s.clusterIp.toLowerCase().includes(q) ||
        s.externalIp.toLowerCase().includes(q) ||
        s.ports.toLowerCase().includes(q)
      );
    });
  }, [servicesList, activeNamespace, searchTerm]);

  // Filter Ingresses
  const filteredIngresses = useMemo(() => {
    return ingressesList.filter((ing) => {
      if (activeNamespace !== "all" && ing.namespace !== activeNamespace) return false;
      const q = searchTerm.toLowerCase().trim();
      if (!q) return true;
      return (
        ing.name.toLowerCase().includes(q) ||
        ing.namespace.toLowerCase().includes(q) ||
        ing.hosts.toLowerCase().includes(q) ||
        ing.endpoints.toLowerCase().includes(q) ||
        ing.className.toLowerCase().includes(q)
      );
    });
  }, [ingressesList, activeNamespace, searchTerm]);

  // Sorted Services
  const sortedServices = useMemo(() => {
    if (!svcTable.sortConfig) return filteredServices;
    const { column, direction } = svcTable.sortConfig;
    const mul = direction === "asc" ? 1 : -1;

    return [...filteredServices].sort((a, b) => {
      if (column === "age") {
        return (parseAgeToSeconds(a.age) - parseAgeToSeconds(b.age)) * mul;
      }
      const valA = (a[column as keyof ipc.ServiceSummary] || "").toString().toLowerCase();
      const valB = (b[column as keyof ipc.ServiceSummary] || "").toString().toLowerCase();
      return valA.localeCompare(valB) * mul;
    });
  }, [filteredServices, svcTable.sortConfig]);

  // Sorted Ingresses
  const sortedIngresses = useMemo(() => {
    if (!ingTable.sortConfig) return filteredIngresses;
    const { column, direction } = ingTable.sortConfig;
    const mul = direction === "asc" ? 1 : -1;

    return [...filteredIngresses].sort((a, b) => {
      if (column === "age") {
        return (parseAgeToSeconds(a.age) - parseAgeToSeconds(b.age)) * mul;
      }
      const valA = (a[column as keyof ipc.IngressSummary] || "").toString().toLowerCase();
      const valB = (b[column as keyof ipc.IngressSummary] || "").toString().toLowerCase();
      return valA.localeCompare(valB) * mul;
    });
  }, [filteredIngresses, ingTable.sortConfig]);

  const activeTable = activeTab === "services" ? svcTable : ingTable;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden select-none">
      {/* View Toolbar Header */}
      <div className="flex-shrink-0 px-4 py-2.5 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          {/* Sub-tab Pill Switcher */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-950 border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab("services")}
              className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTab === "services"
                  ? "bg-slate-800 text-cyan-300 shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>Services</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900 text-slate-400 border border-slate-700/60">
                {filteredServices.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("ingresses")}
              className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTab === "ingresses"
                  ? "bg-slate-800 text-cyan-300 shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Ingresses</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900 text-slate-400 border border-slate-700/60">
                {filteredIngresses.length}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            title="Refresh services and ingresses"
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-cyan-400" : ""}`} />
          </button>
        </div>

        {/* Search & Column Visibility */}
        <div className="flex items-center space-x-3">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-md pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-cyan-500/50 transition-colors"
            />
          </div>

          <button
            type="button"
            onClick={activeTable.handleHeaderContextMenu}
            title="Configure visible columns"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800 transition-colors cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="flex-1 overflow-auto bg-slate-950 relative">
        {activeTab === "services" ? (
          <table className="w-full text-left border-collapse text-xs table-fixed">
            <thead className="bg-slate-900/90 text-slate-400 font-semibold border-b border-slate-800 sticky top-0 z-10 backdrop-blur-xs select-none">
              <tr>
                {svcTable.visibleColumns.map((col) => {
                  const width = svcTable.columnWidths[col.key];
                  const isSorted = svcTable.sortConfig?.column === col.key;
                  const sortDir = isSorted ? svcTable.sortConfig?.direction : null;

                  return (
                    <th
                      key={col.key}
                      style={{ width: `${width}px` }}
                      onContextMenu={svcTable.handleHeaderContextMenu}
                      className="p-2.5 relative group cursor-pointer hover:text-slate-200 transition-colors"
                    >
                      <div
                        className="flex items-center space-x-1.5"
                        onClick={() => svcTable.handleSortClick(col)}
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

                      {col.resizable && (
                        <div
                          onMouseDown={(e) => svcTable.handleResizeStart(e, col)}
                          className={`absolute right-0 top-0 bottom-0 w-1.5 hover:bg-cyan-500/60 cursor-col-resize z-20 ${
                            svcTable.resizingColKey === col.key ? "bg-cyan-500" : ""
                          }`}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {sortedServices.length === 0 ? (
                <tr>
                  <td
                    colSpan={svcTable.visibleColumns.length}
                    className="py-16 text-center text-slate-500"
                  >
                    {loading ? "Loading services..." : "No services found."}
                  </td>
                </tr>
              ) : (
                sortedServices.map((svc) => (
                  <tr
                    key={`${svc.namespace}/${svc.name}`}
                    onContextMenu={(e) => handleRowContextMenu(e, svc, "service")}
                    onDoubleClick={() =>
                      setInspectYamlTarget({
                        kind: "service",
                        namespace: svc.namespace,
                        name: svc.name,
                        title: `Service: ${svc.name}`,
                      })
                    }
                    className="hover:bg-slate-900/60 transition-colors cursor-pointer group"
                  >
                    {svcTable.visibleColumns.map((col) => {
                      switch (col.key) {
                        case "name":
                          return (
                            <td key={col.key} className="p-2.5 font-sans font-medium text-slate-200 truncate">
                              <div className="flex items-center space-x-2">
                                <Network className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                                <span className="truncate">{svc.name}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopy(svc.name, `svc-${svc.name}`);
                                  }}
                                  title="Copy service name"
                                  className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-slate-300 transition-opacity"
                                >
                                  {copiedItem === `svc-${svc.name}` ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </td>
                          );
                        case "namespace":
                          return (
                            <td key={col.key} className="p-2.5 text-slate-400 truncate">
                              {svc.namespace}
                            </td>
                          );
                        case "type":
                          return (
                            <td key={col.key} className="p-2.5 truncate">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                                  svc.type === "LoadBalancer"
                                    ? "bg-purple-950/60 text-purple-300 border-purple-800/60"
                                    : svc.type === "NodePort"
                                    ? "bg-amber-950/60 text-amber-300 border-amber-800/60"
                                    : "bg-slate-800 text-slate-300 border-slate-700/60"
                                }`}
                              >
                                {svc.type}
                              </span>
                            </td>
                          );
                        case "clusterIp":
                          return (
                            <td key={col.key} className="p-2.5 text-slate-300 truncate">
                              {svc.clusterIp}
                            </td>
                          );
                        case "externalIp":
                          return (
                            <td key={col.key} className="p-2.5 text-slate-300 truncate">
                              {svc.externalIp}
                            </td>
                          );
                        case "ports":
                          return (
                            <td key={col.key} className="p-2.5 text-cyan-400 truncate">
                              {svc.ports}
                            </td>
                          );
                        case "age":
                          return (
                            <td key={col.key} className="p-2.5 text-slate-400 truncate">
                              <div className="flex items-center space-x-1">
                                <Clock className="w-3 h-3 text-slate-500 flex-shrink-0" />
                                <span>{svc.age}</span>
                              </div>
                            </td>
                          );
                        default:
                          return null;
                      }
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left border-collapse text-xs table-fixed">
            <thead className="bg-slate-900/90 text-slate-400 font-semibold border-b border-slate-800 sticky top-0 z-10 backdrop-blur-xs select-none">
              <tr>
                {ingTable.visibleColumns.map((col) => {
                  const width = ingTable.columnWidths[col.key];
                  const isSorted = ingTable.sortConfig?.column === col.key;
                  const sortDir = isSorted ? ingTable.sortConfig?.direction : null;

                  return (
                    <th
                      key={col.key}
                      style={{ width: `${width}px` }}
                      onContextMenu={ingTable.handleHeaderContextMenu}
                      className="p-2.5 relative group cursor-pointer hover:text-slate-200 transition-colors"
                    >
                      <div
                        className="flex items-center space-x-1.5"
                        onClick={() => ingTable.handleSortClick(col)}
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

                      {col.resizable && (
                        <div
                          onMouseDown={(e) => ingTable.handleResizeStart(e, col)}
                          className={`absolute right-0 top-0 bottom-0 w-1.5 hover:bg-cyan-500/60 cursor-col-resize z-20 ${
                            ingTable.resizingColKey === col.key ? "bg-cyan-500" : ""
                          }`}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {sortedIngresses.length === 0 ? (
                <tr>
                  <td
                    colSpan={ingTable.visibleColumns.length}
                    className="py-16 text-center text-slate-500"
                  >
                    {loading ? "Loading ingresses..." : "No ingresses found."}
                  </td>
                </tr>
              ) : (
                sortedIngresses.map((ing) => (
                  <tr
                    key={`${ing.namespace}/${ing.name}`}
                    onContextMenu={(e) => handleRowContextMenu(e, ing, "ingress")}
                    onDoubleClick={() =>
                      setInspectYamlTarget({
                        kind: "ingress",
                        namespace: ing.namespace,
                        name: ing.name,
                        title: `Ingress: ${ing.name}`,
                      })
                    }
                    className="hover:bg-slate-900/60 transition-colors cursor-pointer group"
                  >
                    {ingTable.visibleColumns.map((col) => {
                      switch (col.key) {
                        case "name":
                          return (
                            <td key={col.key} className="p-2.5 font-sans font-medium text-slate-200 truncate">
                              <div className="flex items-center space-x-2">
                                <Globe className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                                <span className="truncate">{ing.name}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopy(ing.name, `ing-${ing.name}`);
                                  }}
                                  title="Copy ingress name"
                                  className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-slate-300 transition-opacity"
                                >
                                  {copiedItem === `ing-${ing.name}` ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </td>
                          );
                        case "namespace":
                          return (
                            <td key={col.key} className="p-2.5 text-slate-400 truncate">
                              {ing.namespace}
                            </td>
                          );
                        case "hosts":
                          return (
                            <td key={col.key} className="p-2.5 text-slate-300 truncate">
                              {ing.hosts}
                            </td>
                          );
                        case "endpoints":
                          return (
                            <td key={col.key} className="p-2.5 text-cyan-400 truncate">
                              {ing.endpoints}
                            </td>
                          );
                        case "className":
                          return (
                            <td key={col.key} className="p-2.5 text-slate-400 truncate">
                              {ing.className}
                            </td>
                          );
                        case "age":
                          return (
                            <td key={col.key} className="p-2.5 text-slate-400 truncate">
                              <div className="flex items-center space-x-1">
                                <Clock className="w-3 h-3 text-slate-500 flex-shrink-0" />
                                <span>{ing.age}</span>
                              </div>
                            </td>
                          );
                        default:
                          return null;
                      }
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Column Visibility Menu */}
      {activeTab === "services" ? (
        <ColumnVisibilityMenu
          columns={SERVICE_COLUMNS}
          columnVisibility={svcTable.columnVisibility}
          onToggleVisibility={svcTable.toggleColumnVisibility}
          onResetToDefaults={svcTable.resetToDefaults}
          onClose={svcTable.closeContextMenu}
          position={svcTable.contextMenu}
          menuRef={svcTable.contextMenuRef}
        />
      ) : (
        <ColumnVisibilityMenu
          columns={INGRESS_COLUMNS}
          columnVisibility={ingTable.columnVisibility}
          onToggleVisibility={ingTable.toggleColumnVisibility}
          onResetToDefaults={ingTable.resetToDefaults}
          onClose={ingTable.closeContextMenu}
          position={ingTable.contextMenu}
          menuRef={ingTable.contextMenuRef}
        />
      )}

      {/* Row Right-Click Context Menu */}
      {rowContextMenu && (
        <ServicesIngressContextMenu
          x={rowContextMenu.x}
          y={rowContextMenu.y}
          item={rowContextMenu.item}
          type={rowContextMenu.type}
          onClose={() => setRowContextMenu(null)}
          onInspectYaml={(item, type) =>
            setInspectYamlTarget({
              kind: type,
              namespace: item.namespace,
              name: item.name,
              title: `${type === "service" ? "Service" : "Ingress"}: ${item.name}`,
            })
          }
          onToast={onToast}
        />
      )}

      {/* YAML Manifest Inspector Modal */}
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
    </div>
  );
};
