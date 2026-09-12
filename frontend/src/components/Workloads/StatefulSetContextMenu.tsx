import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  FileCode,
  Box,
  Activity,
  Copy,
  RotateCw,
  Sliders,
  Trash2,
  Terminal,
} from "lucide-react";
import { StatefulSetItem } from "./StatefulSetsView";

export interface StatefulSetContextMenuProps {
  statefulSet: StatefulSetItem | null;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onInspectDetails: (item: StatefulSetItem, tab?: "yaml" | "spec" | "events") => void;
  onShowPods: (workloadName: string, namespace: string) => void;
  onShowEvents: (item: StatefulSetItem) => void;
  onCopyName: (item: StatefulSetItem) => void;
  onCopyServiceName: (item: StatefulSetItem) => void;
  onRestartRollout: (item: StatefulSetItem) => void;
  onScaleReplicas: (item: StatefulSetItem) => void;
  onDelete: (item: StatefulSetItem) => void;
  onViewLogs?: (item: StatefulSetItem) => void;
  mutationsDisabled?: boolean;
}

export const StatefulSetContextMenu: React.FC<StatefulSetContextMenuProps> = ({
  statefulSet,
  position,
  onClose,
  onInspectDetails,
  onShowPods,
  onShowEvents,
  onCopyName,
  onCopyServiceName,
  onRestartRollout,
  onScaleReplicas,
  onDelete,
  onViewLogs,
  mutationsDisabled = false,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) return;

    const handleOutsideClick = (e: MouseEvent | PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        typeof target.closest === "function" &&
        (target.closest('[data-log-drawer="true"]') ||
          target.closest(".log-container") ||
          target.closest('[data-log-container="true"]'))
      ) {
        return; // Do not dismiss menu when scrolling inside log drawer
      }
      onClose();
    };

    document.addEventListener("pointerdown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [position, onClose]);

  if (!position || !statefulSet) return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-50 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl py-1.5 w-60 text-xs text-zinc-300 select-none animate-in fade-in zoom-in-95 duration-100 font-sans"
    >
      {/* Target StatefulSet Header */}
      <div className="px-3 py-1 text-[11px] font-mono border-b border-zinc-800/80 mb-1 flex items-center justify-between">
        <span className="text-zinc-200 font-semibold truncate mr-2" title={statefulSet.name}>
          {statefulSet.name}
        </span>
        <span
          className={`text-[10px] px-1.5 py-0.2 rounded font-mono flex-shrink-0 ${
            statefulSet.status === "Ready"
              ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/50"
              : statefulSet.status === "Progressing"
              ? "bg-blue-950/60 text-blue-400 border border-blue-800/50"
              : "bg-rose-950/60 text-rose-400 border border-rose-800/50"
          }`}
        >
          {statefulSet.status}
        </span>
      </div>

      {/* Primary Actions */}
      <button
        type="button"
        onClick={() => {
          onClose();
          onInspectDetails(statefulSet, "yaml");
        }}
        className="w-full px-3 py-1.5 text-left hover:bg-zinc-800/80 hover:text-white flex items-center space-x-2 transition-colors cursor-pointer"
      >
        <FileCode className="w-3.5 h-3.5 text-zinc-400" />
        <span>Inspect / View YAML</span>
      </button>

      <button
        type="button"
        onClick={() => {
          onClose();
          onShowPods(statefulSet.name, statefulSet.namespace);
        }}
        className="w-full px-3 py-1.5 text-left hover:bg-zinc-800/80 hover:text-white flex items-center space-x-2 transition-colors cursor-pointer"
      >
        <Box className="w-3.5 h-3.5 text-cyan-400" />
        <span>Show Pods</span>
      </button>

      {onViewLogs && (
        <button
          type="button"
          onClick={() => {
            onClose();
            onViewLogs(statefulSet);
          }}
          className="w-full px-3 py-1.5 text-left hover:bg-zinc-800/80 hover:text-white flex items-center space-x-2 transition-colors cursor-pointer"
        >
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span>Stream Pod Logs</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          onClose();
          onShowEvents(statefulSet);
        }}
        className="w-full px-3 py-1.5 text-left hover:bg-zinc-800/80 hover:text-white flex items-center space-x-2 transition-colors cursor-pointer"
      >
        <Activity className="w-3.5 h-3.5 text-amber-400" />
        <span>Show Events</span>
      </button>

      {/* Copy Actions */}
      <div className="h-px bg-zinc-800/80 my-1" />

      <button
        type="button"
        onClick={() => {
          onClose();
          onCopyName(statefulSet);
        }}
        className="w-full px-3 py-1.5 text-left hover:bg-zinc-800/80 hover:text-white flex items-center space-x-2 transition-colors cursor-pointer"
      >
        <Copy className="w-3.5 h-3.5 text-zinc-400" />
        <span>Copy StatefulSet Name</span>
      </button>

      <button
        type="button"
        onClick={() => {
          onClose();
          onCopyServiceName(statefulSet);
        }}
        className="w-full px-3 py-1.5 text-left hover:bg-zinc-800/80 hover:text-white flex items-center space-x-2 transition-colors cursor-pointer"
      >
        <Copy className="w-3.5 h-3.5 text-zinc-400" />
        <span>Copy Service Name</span>
      </button>

      {/* Lifecycle Actions */}
      <div className="h-px bg-zinc-800/80 my-1" />

      <button
        type="button"
        onClick={() => {
          onClose();
          onRestartRollout(statefulSet);
        }}
        className="w-full px-3 py-1.5 text-left flex items-center space-x-2 transition-colors hover:bg-amber-950/30 hover:text-amber-300 text-zinc-300 cursor-pointer"
      >
        <RotateCw className="w-3.5 h-3.5 text-amber-400" />
        <span>Restart Rollout</span>
      </button>

      <button
        type="button"
        onClick={() => {
          onClose();
          onScaleReplicas(statefulSet);
        }}
        className="w-full px-3 py-1.5 text-left flex items-center space-x-2 transition-colors hover:bg-cyan-950/30 hover:text-cyan-300 text-zinc-300 cursor-pointer"
      >
        <Sliders className="w-3.5 h-3.5 text-cyan-400" />
        <span>Scale Replicas...</span>
      </button>

      <button
        type="button"
        onClick={() => {
          onClose();
          onDelete(statefulSet);
        }}
        className="w-full px-3 py-1.5 text-left flex items-center space-x-2 transition-colors hover:bg-rose-950/40 hover:text-rose-300 text-rose-400/90 cursor-pointer"
      >
        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
        <span>Delete StatefulSet</span>
      </button>
    </div>,
    document.body
  );
};
