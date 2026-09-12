import React, { useState, useEffect } from "react";
import {
  Box,
  Cpu,
  FolderGit2,
  HardDrive,
  Network,
  Lock,
  Boxes,
  PanelLeftClose,
  Pin,
  Edit2,
  X,
  Plus,
  Briefcase,
  CalendarClock,
} from "lucide-react";
import { PinnedItem } from "../../hooks/usePinnedItems";
import { ipc } from "../../../wailsjs/go/models";
import { GetAppVersion } from "../../../wailsjs/go/main/App";

interface SidebarProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  activeContext?: string;
  activeNamespace?: string;
  pinnedItems: PinnedItem[];
  onSelectPin: (pin: PinnedItem) => void;
  onEditPin: (pin: PinnedItem) => void;
  onDeletePin: (id: string) => void;
  onCreatePin?: () => void;
  activeResource?: "pods" | "deployments" | "statefulsets" | "jobs" | "cronjobs" | string;
  onSelectResource?: (
    resource: "pods" | "deployments" | "statefulsets" | "jobs" | "cronjobs" | string
  ) => void;
  podCount?: number;
  deploymentCount?: number;
  statefulSetCount?: number;
  jobCount?: number;
  cronJobCount?: number;
  nodeCount?: number;
  servicesIngressCount?: number;
  configMapsSecretsCount?: number;
  clusterOverview?: ipc.ClusterOverview | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggleOpen,
  activeContext = "",
  activeNamespace = "",
  pinnedItems,
  onSelectPin,
  onEditPin,
  onDeletePin,
  onCreatePin,
  activeResource = "pods",
  onSelectResource,
  clusterOverview = null,
  podCount,
  deploymentCount = 0,
  statefulSetCount = 0,
  jobCount = 0,
  cronJobCount = 0,
  nodeCount,
  servicesIngressCount,
  configMapsSecretsCount,
}) => {
  const [version, setVersion] = useState<string>("dev");

  useEffect(() => {
    let active = true;
    GetAppVersion()
      .then((v) => {
        if (active && v) {
          setVersion(v);
        }
      })
      .catch((err) => {
        console.warn("[SIDEBAR] Failed to get app version:", err);
      });
    return () => {
      active = false;
    };
  }, []);

  const COLOR_HEX_MAP: Record<string, string> = {
    emerald: "#10b981",
    sky: "#0ea5e9",
    rose: "#f43f5e",
    amber: "#f59e0b",
    purple: "#a855f7",
    indigo: "#6366f1",
    fuchsia: "#d946ef",
    slate: "#64748b",
  };

  return (
    <aside
      className={`bg-slate-900 border-r border-slate-800 flex flex-col h-full select-none flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden z-20 ${
        isOpen
          ? "w-64 opacity-100"
          : "w-0 opacity-0 border-r-0 pointer-events-none"
      }`}
    >
      {/* App Branding & Collapse Toggle */}
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between flex-shrink-0 min-w-[256px]">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-base shadow-sm flex-shrink-0">
            🐸
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-slate-100 text-sm tracking-wide">
                KERMITT
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              version {version.replace(/^v/, "")}
            </p>
          </div>
        </div>

        {/* Sidebar Collapse Toggle Button */}
        <button
          type="button"
          onClick={onToggleOpen}
          title="Collapse sidebar (Ctrl+B)"
          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors flex-shrink-0"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-w-[256px]">
        {/* ==================================================================== */}
        {/* 1. Pinned Quick-Access Items Section (At Top above Context switcher) */}
        {/* ==================================================================== */}
        <div className={`border-b border-slate-800 ${pinnedItems.length === 0 ? "p-2.5 pb-2" : "p-3"}`}>
          <div className={`flex items-center justify-between ${pinnedItems.length === 0 ? "" : "mb-1.5"}`}>
            <label className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase flex items-center space-x-1.5">
              <Pin className="w-3 h-3 text-amber-400 fill-amber-400/30" />
              <span>PINNED ITEMS ({pinnedItems.length})</span>
            </label>
            {onCreatePin && (
              <button
                type="button"
                onClick={onCreatePin}
                title="Add custom pinned shortcut"
                className="p-0.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              >
                <Plus className="w-3 h-3" />
              </button>
            )}
          </div>

          {pinnedItems.length > 0 && (
            <div className="space-y-1">
              {pinnedItems.map((pin) => {
                const baseColor = COLOR_HEX_MAP[pin.color] || pin.color || "#10b981";
                const isTargetActive =
                  activeContext === pin.context && activeNamespace === pin.namespace;

                const cardStyle: React.CSSProperties = {
                  backgroundColor: `color-mix(in srgb, ${baseColor} 18%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${baseColor} 45%, transparent)`,
                  ...(isTargetActive
                    ? {
                        boxShadow: `0 0 0 1px color-mix(in srgb, ${baseColor} 70%, transparent), 0 2px 8px -2px color-mix(in srgb, ${baseColor} 30%, transparent)`,
                      }
                    : {}),
                };

                return (
                  <div
                    key={pin.id}
                    onClick={() => onSelectPin(pin)}
                    style={cardStyle}
                    className="group px-2 py-1.5 rounded-lg text-left cursor-pointer transition-all flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-2 min-w-0 pr-1">
                      {/* Emoji Icon Badge */}
                      <span
                        style={{
                          backgroundColor: `color-mix(in srgb, ${baseColor} 30%, transparent)`,
                          borderColor: `color-mix(in srgb, ${baseColor} 60%, transparent)`,
                        }}
                        className="w-6 h-6 rounded flex items-center justify-center text-xs flex-shrink-0 border"
                      >
                        {pin.emoji || "📦"}
                      </span>

                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-100 truncate group-hover:text-white transition-colors">
                          {pin.label}
                        </div>
                        <div className="text-[10px] text-slate-300/80 truncate font-mono">
                          {pin.namespace} • {pin.podPattern || "*"}
                        </div>
                      </div>
                    </div>

                    {/* Quick Edit / Unpin Hover Actions */}
                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditPin(pin);
                        }}
                        title="Customize pin"
                        className="p-1 text-slate-300 hover:text-white rounded hover:bg-black/20"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeletePin(pin.id);
                        }}
                        title="Remove pin"
                        className="p-1 text-slate-300 hover:text-rose-400 rounded hover:bg-black/20"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ==================================================================== */}
        {/* 2. Resource Navigation Menu                                          */}
        {/* ==================================================================== */}
        <div className="p-3 pb-6">
          <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase mb-2">
            Workloads
          </div>
          <nav className="space-y-0.5">
            {/* Pods */}
            <button
              type="button"
              onClick={() => onSelectResource?.("pods")}
              className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeResource === "pods"
                  ? "bg-cyan-950/60 text-cyan-300 border-l-2 border-cyan-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <Box
                className={`w-4 h-4 ${
                  activeResource === "pods" ? "text-cyan-400" : "text-slate-500"
                }`}
              />
              <span>Pods</span>
              <span
                className={`ml-auto text-[10px] px-1.5 py-0.2 rounded-full border transition-opacity duration-300 ${
                  activeResource === "pods"
                    ? "bg-cyan-900/40 text-cyan-300 border-cyan-700/50"
                    : "bg-slate-800 text-slate-400 border-slate-700/60"
                }`}
              >
                {podCount ?? clusterOverview?.podCount ?? 0}
              </span>
            </button>

            {/* Jobs */}
            <button
              type="button"
              onClick={() => onSelectResource?.("jobs")}
              className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeResource === "jobs"
                  ? "bg-cyan-950/60 text-cyan-300 border-l-2 border-cyan-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <Briefcase
                className={`w-4 h-4 ${
                  activeResource === "jobs" ? "text-cyan-400" : "text-slate-500"
                }`}
              />
              <span>Jobs</span>
              <span
                className={`ml-auto text-[10px] px-1.5 py-0.2 rounded-full border transition-opacity duration-300 ${
                  activeResource === "jobs"
                    ? "bg-cyan-900/40 text-cyan-300 border-cyan-700/50"
                    : "bg-slate-800 text-slate-400 border-slate-700/60"
                }`}
              >
                {jobCount}
              </span>
            </button>

            {/* CronJobs */}
            <button
              type="button"
              onClick={() => onSelectResource?.("cronjobs")}
              className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeResource === "cronjobs"
                  ? "bg-cyan-950/60 text-cyan-300 border-l-2 border-cyan-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <CalendarClock
                className={`w-4 h-4 ${
                  activeResource === "cronjobs" ? "text-cyan-400" : "text-slate-500"
                }`}
              />
              <span>CronJobs</span>
              <span
                className={`ml-auto text-[10px] px-1.5 py-0.2 rounded-full border transition-opacity duration-300 ${
                  activeResource === "cronjobs"
                    ? "bg-cyan-900/40 text-cyan-300 border-cyan-700/50"
                    : "bg-slate-800 text-slate-400 border-slate-700/60"
                }`}
              >
                {cronJobCount}
              </span>
            </button>

            {/* Deployments */}
            <button
              type="button"
              onClick={() => onSelectResource?.("deployments")}
              className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeResource === "deployments"
                  ? "bg-cyan-950/60 text-cyan-300 border-l-2 border-cyan-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <Boxes
                className={`w-4 h-4 ${
                  activeResource === "deployments" ? "text-cyan-400" : "text-slate-500"
                }`}
              />
              <span>Deployments</span>
              <span
                className={`ml-auto text-[10px] px-1.5 py-0.2 rounded-full border transition-opacity duration-300 ${
                  activeResource === "deployments"
                    ? "bg-cyan-900/40 text-cyan-300 border-cyan-700/50"
                    : "bg-slate-800 text-slate-400 border-slate-700/60"
                }`}
              >
                {deploymentCount}
              </span>
            </button>

            {/* StatefulSets */}
            <button
              type="button"
              onClick={() => onSelectResource?.("statefulsets")}
              className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeResource === "statefulsets"
                  ? "bg-cyan-950/60 text-cyan-300 border-l-2 border-cyan-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <FolderGit2
                className={`w-4 h-4 ${
                  activeResource === "statefulsets" ? "text-cyan-400" : "text-slate-500"
                }`}
              />
              <span>StatefulSets</span>
              <span
                className={`ml-auto text-[10px] px-1.5 py-0.2 rounded-full border transition-opacity duration-300 ${
                  activeResource === "statefulsets"
                    ? "bg-cyan-900/40 text-cyan-300 border-cyan-700/50"
                    : "bg-slate-800 text-slate-400 border-slate-700/60"
                }`}
              >
                {statefulSetCount}
              </span>
            </button>
          </nav>

          <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase mt-4 mb-2">
            Cluster & Config
          </div>
          <nav className="space-y-0.5">
            {/* Nodes */}
            <button
              type="button"
              onClick={() => onSelectResource?.("nodes")}
              className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeResource === "nodes"
                  ? "bg-cyan-950/60 text-cyan-300 border-l-2 border-cyan-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <Cpu
                className={`w-4 h-4 ${
                  activeResource === "nodes" ? "text-cyan-400" : "text-slate-500"
                }`}
              />
              <span>Nodes</span>
              <span
                className={`ml-auto text-[10px] px-1.5 py-0.2 rounded-full border transition-opacity duration-300 ${
                  activeResource === "nodes"
                    ? "bg-cyan-900/40 text-cyan-300 border-cyan-700/50"
                    : "bg-slate-800 text-slate-400 border-slate-700/60"
                }`}
              >
                {nodeCount ?? clusterOverview?.nodeCount ?? 0}
              </span>
            </button>

            {/* Services & Ingress */}
            <button
              type="button"
              onClick={() => onSelectResource?.("services")}
              className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeResource === "services"
                  ? "bg-cyan-950/60 text-cyan-300 border-l-2 border-cyan-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <Network
                className={`w-4 h-4 ${
                  activeResource === "services" ? "text-cyan-400" : "text-slate-500"
                }`}
              />
              <span>Services & Ingress</span>
              <span
                className={`ml-auto text-[10px] px-1.5 py-0.2 rounded-full border transition-opacity duration-300 ${
                  activeResource === "services"
                    ? "bg-cyan-900/40 text-cyan-300 border-cyan-700/50"
                    : "bg-slate-800 text-slate-400 border-slate-700/60"
                }`}
              >
                {servicesIngressCount ?? 0}
              </span>
            </button>

            {/* ConfigMaps & Secrets */}
            <button
              type="button"
              onClick={() => onSelectResource?.("configmaps")}
              className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeResource === "configmaps"
                  ? "bg-cyan-950/60 text-cyan-300 border-l-2 border-cyan-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <HardDrive
                className={`w-4 h-4 ${
                  activeResource === "configmaps" ? "text-cyan-400" : "text-slate-500"
                }`}
              />
              <span>ConfigMaps & Secrets</span>
              <span
                className={`ml-auto text-[10px] px-1.5 py-0.2 rounded-full border transition-opacity duration-300 ${
                  activeResource === "configmaps"
                    ? "bg-cyan-900/40 text-cyan-300 border-cyan-700/50"
                    : "bg-slate-800 text-slate-400 border-slate-700/60"
                }`}
              >
                {configMapsSecretsCount ?? 0}
              </span>
            </button>
          </nav>
        </div>
      </div>
    </aside>
  );
};
