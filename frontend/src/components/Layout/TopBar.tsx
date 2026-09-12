import React, { useState, useRef, useEffect } from "react";
import {
  Server,
  Layers,
  ChevronDown,
  Check,
  Search,
  Settings,
  PanelLeftOpen,
  Activity,
  Shield,
  Clock,
  Globe,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { ipc } from "../../../wailsjs/go/models";
import { classifyEnvironment } from "../../utils/environment";

export interface TopBarProps {
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  contexts: ipc.KubeContext[];
  activeContext: string;
  onSwitchContext: (contextName: string) => Promise<void>;
  namespaces: ipc.Namespace[];
  activeNamespace: string;
  onSelectNamespace: (namespace: string) => void;
  onRefreshNamespaces?: () => void;
  clusterOverview: ipc.ClusterOverview | null;
  clusterHealthInfo: ipc.ClusterHealthInfo | null;
  loadingContext?: boolean;
  isContextsLoading?: boolean;
  isNamespacesLoading?: boolean;
  onOpenSettings: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  sidebarOpen,
  onOpenSidebar,
  contexts,
  activeContext,
  onSwitchContext,
  namespaces,
  activeNamespace,
  onSelectNamespace,
  onRefreshNamespaces,
  clusterOverview,
  clusterHealthInfo,
  loadingContext = false,
  isContextsLoading = false,
  isNamespacesLoading = false,
  onOpenSettings,
}) => {
  const [contextDropdownOpen, setContextDropdownOpen] = useState(false);
  const [namespaceDropdownOpen, setNamespaceDropdownOpen] = useState(false);
  const [contextSearch, setContextSearch] = useState("");
  const [namespaceSearch, setNamespaceSearch] = useState("");
  const [isHoveringStatus, setIsHoveringStatus] = useState(false);
  const [switching, setSwitching] = useState(false);

  const contextRef = useRef<HTMLDivElement>(null);
  const namespaceRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setContextDropdownOpen(false);
      }
      if (namespaceRef.current && !namespaceRef.current.contains(e.target as Node)) {
        setNamespaceDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleContextSelect = async (ctxName: string) => {
    if (ctxName === activeContext) {
      setContextDropdownOpen(false);
      return;
    }
    setSwitching(true);
    setContextDropdownOpen(false);
    setIsHoveringStatus(false);
    try {
      await onSwitchContext(ctxName);
    } finally {
      setSwitching(false);
    }
  };

  const filteredContexts = contexts.filter((c) =>
    c.name.toLowerCase().includes(contextSearch.toLowerCase()) ||
    c.clusterName.toLowerCase().includes(contextSearch.toLowerCase())
  );

  const filteredNamespaces = namespaces.filter((ns) =>
    ns.name.toLowerCase().includes(namespaceSearch.toLowerCase())
  );

  const isConnected =
    clusterHealthInfo?.status === "connected" ||
    (!!activeContext && !loadingContext && !switching && clusterHealthInfo?.status !== "disconnected");

  const isConnecting = loadingContext || switching;
  const isDisconnected = !isConnected && !isConnecting;

  const handleMouseEnterStatus = () => {
    if (contextDropdownOpen) return;
    hoverTimerRef.current = setTimeout(() => {
      setIsHoveringStatus(true);
    }, 200);
  };

  const handleMouseLeaveStatus = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setIsHoveringStatus(false);
  };

  return (
    <header className="h-12 bg-slate-900 border-b border-slate-800 px-3.5 flex items-center justify-between flex-shrink-0 z-30 select-none">
      {/* Left side: Sidebar Toggle & Global Scopes */}
      <div className="flex items-center space-x-2.5 min-w-0">
        {/* Conditional Sidebar Expand Button */}
        {!sidebarOpen && (
          <button
            type="button"
            onClick={onOpenSidebar}
            title="Expand sidebar (Ctrl+B)"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors border border-slate-700/60 flex-shrink-0"
          >
            <PanelLeftOpen className="w-4 h-4 text-emerald-400" />
          </button>
        )}

        {/* 1. Context Dropdown with Merged Connection Status Dot */}
        <div className="relative" ref={contextRef}>
          {(() => {
            const activeEnv = classifyEnvironment(activeContext);
            return (
              <div
                onMouseEnter={handleMouseEnterStatus}
                onMouseLeave={handleMouseLeaveStatus}
                className="inline-block"
              >
                <button
                  type="button"
                  onClick={() => {
                    setContextDropdownOpen(!contextDropdownOpen);
                    setIsHoveringStatus(false);
                  }}
                  disabled={switching}
                  className={`h-8 px-2.5 rounded-md border transition-all flex items-center space-x-2 text-xs font-mono shadow-xs cursor-pointer ${
                    contextDropdownOpen
                      ? activeEnv.isProd
                        ? "border-rose-500/80 ring-1 ring-rose-500/40 bg-rose-950/40 text-rose-200"
                        : "border-cyan-500/60 ring-1 ring-cyan-500/30 bg-slate-950"
                      : activeEnv.isProd
                      ? activeEnv.triggerBorderClass
                      : "border-slate-800 hover:border-slate-700 bg-slate-950 text-slate-200"
                  }`}
                >
                  {/* Integrated connection status indicator */}
                  {isConnecting ? (
                    <span
                      className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0"
                      title="Connecting..."
                    />
                  ) : isConnected ? (
                    <span
                      className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)] flex-shrink-0"
                      title="Connected"
                    />
                  ) : (
                    <span
                      className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.5)] flex-shrink-0"
                      title="Disconnected"
                    />
                  )}

                  {/* Warning indicator icon if active context is production */}
                  {activeEnv.isProd && (
                    <span title="Active cluster is classified as PRODUCTION" className="flex items-center">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 animate-pulse" />
                    </span>
                  )}

                  <span
                    className={`font-semibold truncate max-w-[180px] ${
                      activeEnv.isProd ? "text-rose-200" : "text-slate-200"
                    }`}
                  >
                    {activeContext || "Select context..."}
                  </span>

                  {activeEnv.badgeLabel && (
                    <span className={activeEnv.badgeStyle}>
                      [{activeEnv.badgeLabel}]
                    </span>
                  )}

                  {switching ? (
                    <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  )}
                </button>
              </div>
            );
          })()}

          {/* Rich Status Popover (on hover) */}
          {isHoveringStatus && !contextDropdownOpen && (
            <div
              onMouseEnter={() => setIsHoveringStatus(true)}
              onMouseLeave={() => setIsHoveringStatus(false)}
              className="absolute left-0 top-full mt-1.5 w-72 bg-slate-900/95 border border-slate-700/80 rounded-lg shadow-2xl p-3 text-xs text-slate-300 z-50 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 pointer-events-auto"
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Cluster Health
                </span>
                <span
                  className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${
                    isConnected
                      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                      : isConnecting
                      ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                      : "bg-rose-500/10 text-rose-300 border-rose-500/30"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isConnected
                        ? "bg-emerald-400"
                        : isConnecting
                        ? "bg-amber-400 animate-pulse"
                        : "bg-rose-500"
                    }`}
                  />
                  <span>
                    {isConnected
                      ? "Connected"
                      : isConnecting
                      ? "Connecting..."
                      : "Disconnected"}
                  </span>
                </span>
              </div>

              <div className="space-y-2 font-mono text-[11px]">
                {/* Endpoint */}
                <div className="flex items-start space-x-2">
                  <Globe className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-slate-400 font-sans">API Endpoint</div>
                    <div className="text-slate-200 truncate" title={clusterHealthInfo?.endpoint || "N/A"}>
                      {clusterHealthInfo?.endpoint || "Offline / Unreachable"}
                    </div>
                  </div>
                </div>

                {/* Server Version */}
                <div className="flex items-start space-x-2">
                  <Activity className="w-3.5 h-3.5 text-cyan-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-slate-400 font-sans">Server Version</div>
                    <div className="text-slate-200 truncate">
                      {clusterHealthInfo?.serverVersion || "Unknown"}
                    </div>
                  </div>
                </div>

                {/* Latency */}
                <div className="flex items-start space-x-2">
                  <Clock className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-slate-400 font-sans">Round-Trip Latency</div>
                    <div className="text-emerald-300">
                      {clusterHealthInfo?.latencyMs ? `${clusterHealthInfo.latencyMs} ms` : "—"}
                    </div>
                  </div>
                </div>

                {/* Active Auth Identity */}
                <div className="flex items-start space-x-2">
                  <Shield className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-slate-400 font-sans">Auth Identity</div>
                    <div className="text-slate-200 truncate" title={clusterHealthInfo?.authIdentity || "default"}>
                      {clusterHealthInfo?.authIdentity || "default"}
                    </div>
                  </div>
                </div>

                {clusterHealthInfo?.error && (
                  <div className="pt-1.5 mt-1 border-t border-slate-800 text-[10px] text-rose-400 break-words">
                    {clusterHealthInfo.error}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Context Switcher Menu */}
          {contextDropdownOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50 overflow-hidden py-1 text-xs animate-in fade-in zoom-in-95 duration-100">
              <div className="p-2 border-b border-slate-800">
                <div className="relative">
                  <Search className="w-3 h-3 text-slate-500 absolute left-2 top-2.5" />
                  <input
                    type="text"
                    placeholder="Filter contexts..."
                    value={contextSearch}
                    onChange={(e) => setContextSearch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded pl-7 pr-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-cyan-500 font-mono"
                    autoFocus
                  />
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto py-1">
                {isContextsLoading && contexts.length === 0 ? (
                  <div className="px-3 py-2 space-y-2">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 rounded-full bg-cyan-500/50 animate-pulse" />
                      <div className="h-3.5 bg-slate-800 rounded animate-pulse w-3/4" />
                    </div>
                    <div className="h-3 bg-slate-800/60 rounded animate-pulse w-1/2 ml-4" />
                    <div className="h-3.5 bg-slate-800 rounded animate-pulse w-2/3 ml-4" />
                  </div>
                ) : (
                  <>
                    {filteredContexts.map((ctx) => {
                      const isCur = ctx.name === activeContext;
                      const env = classifyEnvironment(ctx.name);
                      return (
                        <button
                          key={ctx.name}
                          onClick={() => handleContextSelect(ctx.name)}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-800/90 transition-colors ${
                            isCur
                              ? env.isProd
                                ? "bg-rose-950/40 text-rose-200 font-medium"
                                : "bg-cyan-950/40 text-cyan-300 font-medium"
                              : "text-slate-300"
                          }`}
                        >
                          <div className="truncate pr-2">
                            <div className="flex items-center space-x-1.5 truncate font-mono">
                              <span className={`truncate ${env.itemTextClass}`}>
                                {ctx.name}
                              </span>
                              {env.badgeLabel && (
                                <span className={env.badgeStyle}>
                                  [{env.badgeLabel}]
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">{ctx.clusterName}</div>
                          </div>
                          {isCur && (
                            <Check
                              className={`w-3.5 h-3.5 flex-shrink-0 ${
                                env.isProd ? "text-rose-400" : "text-cyan-400"
                              }`}
                            />
                          )}
                        </button>
                      );
                    })}
                    {filteredContexts.length === 0 && (
                      <div className="px-3 py-3 text-xs text-slate-500 text-center">
                        No matching contexts
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 2. Namespace Dropdown Selector */}
        <div className="relative" ref={namespaceRef}>
          <button
            type="button"
            onClick={() => {
              const nextOpen = !namespaceDropdownOpen;
              setNamespaceDropdownOpen(nextOpen);
              if (nextOpen && namespaces.length === 0 && onRefreshNamespaces) {
                onRefreshNamespaces();
              }
            }}
            className={`h-8 px-2.5 rounded-md bg-slate-950 hover:bg-slate-800/90 border transition-all flex items-center space-x-2 text-xs font-mono shadow-xs cursor-pointer ${
              namespaceDropdownOpen
                ? "border-cyan-500/60 ring-1 ring-cyan-500/30"
                : "border-slate-800 hover:border-slate-700"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="text-slate-200 font-medium truncate max-w-[150px]">
              {activeNamespace === "all" || !activeNamespace
                ? "All Namespaces"
                : activeNamespace}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
          </button>

          {/* Namespace Popover Menu */}
          {namespaceDropdownOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-60 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50 overflow-hidden py-1 text-xs animate-in fade-in zoom-in-95 duration-100">
              <div className="p-2 border-b border-slate-800">
                <div className="relative">
                  <Search className="w-3 h-3 text-slate-500 absolute left-2 top-2.5" />
                  <input
                    type="text"
                    placeholder="Filter namespaces..."
                    value={namespaceSearch}
                    onChange={(e) => setNamespaceSearch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded pl-7 pr-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-cyan-500 font-mono"
                    autoFocus
                  />
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto py-1 font-mono">
                {/* "All Namespaces" option always on top */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectNamespace("all");
                    setNamespaceDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-800/90 transition-colors ${
                    activeNamespace === "all" || !activeNamespace
                      ? "bg-cyan-950/40 text-cyan-300 font-semibold"
                      : "text-slate-300"
                  }`}
                >
                  <span>All Namespaces</span>
                  {(activeNamespace === "all" || !activeNamespace) && (
                    <Check className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                  )}
                </button>

                <div className="h-px bg-slate-800 my-1" />

                {isNamespacesLoading && namespaces.length === 0 ? (
                  <div className="px-3 py-2 space-y-2">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 rounded-full bg-cyan-500/50 animate-pulse" />
                      <div className="h-3.5 bg-slate-800 rounded animate-pulse w-3/4" />
                    </div>
                    <div className="h-3.5 bg-slate-800/60 rounded animate-pulse w-1/2 ml-4" />
                    <div className="h-3.5 bg-slate-800/40 rounded animate-pulse w-2/3 ml-4" />
                  </div>
                ) : (
                  <>
                    {filteredNamespaces.map((ns) => {
                      const isCur = ns.name === activeNamespace;
                      return (
                        <button
                          key={ns.name}
                          type="button"
                          onClick={() => {
                            onSelectNamespace(ns.name);
                            setNamespaceDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-800/90 transition-colors ${
                            isCur ? "bg-cyan-950/40 text-cyan-300 font-semibold" : "text-slate-300"
                          }`}
                        >
                          <span className="truncate">{ns.name}</span>
                          {isCur && <Check className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />}
                        </button>
                      );
                    })}

                    {filteredNamespaces.length === 0 && (
                      <div className="px-3 py-2 text-xs text-slate-500 text-center">
                        No namespaces found
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right side: Telemetry summary & Settings */}
      <div className="flex items-center space-x-3 flex-shrink-0">
        {clusterOverview && (
          <div className="hidden md:flex items-center space-x-3 text-xs text-slate-400">
            <span>
              Nodes:{" "}
              <strong className="text-slate-200 font-mono">
                {clusterOverview.nodeCount}
              </strong>
            </span>
            <span>
              Pods:{" "}
              <strong className="text-emerald-400 font-mono">
                {clusterOverview.runningPods}
              </strong>
              {clusterOverview.failedPods > 0 && (
                <span className="text-rose-400 font-mono font-medium ml-1">
                  ({clusterOverview.failedPods} failing)
                </span>
              )}
            </span>
          </div>
        )}

        {/* Settings button */}
        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings (Cmd+,)"
          className="p-1.5 rounded-md bg-slate-950 border border-slate-700/80 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 transition-colors flex items-center justify-center text-xs cursor-pointer shadow-xs"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
