import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Pin,
  PinOff,
  Terminal,
  FileText,
  SquareTerminal,
  History,
  FileCode,
  Activity,
  Copy,
  Network,
  Box,
  RotateCw,
  Trash2,
  Lock,
  Layers,
} from "lucide-react";
import { ipc } from "../../../wailsjs/go/models";

export interface PodContextMenuProps {
  pod: ipc.PodSummary | null;
  position: { x: number; y: number } | null;
  onClose: () => void;
  isPinned: boolean;
  onTogglePin: (pod: ipc.PodSummary) => void;
  onViewLogs: (pod: ipc.PodSummary, previous?: boolean) => void;
  onOpenExec?: (pod: ipc.PodSummary) => void;
  onInspectDetails: (pod: ipc.PodSummary, tab?: "containers" | "metadata" | "resources" | "events" | "yaml") => void;
  onCopyName: (pod: ipc.PodSummary) => void;
  onCopyIP: (pod: ipc.PodSummary) => void;
  onCopyImage: (pod: ipc.PodSummary) => void;
  onRestartPod: (pod: ipc.PodSummary) => void;
  onKillPod: (pod: ipc.PodSummary) => void;
  mutationsDisabled?: boolean;
  selectedPods?: ipc.PodSummary[];
  onViewCombinedLogs?: (pods: ipc.PodSummary[]) => void;
}

export const PodContextMenu: React.FC<PodContextMenuProps> = ({
  pod,
  position,
  onClose,
  isPinned,
  onTogglePin,
  onViewLogs,
  onOpenExec,
  onInspectDetails,
  onCopyName,
  onCopyIP,
  onCopyImage,
  onRestartPod,
  onKillPod,
  mutationsDisabled = true,
  selectedPods,
  onViewCombinedLogs,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Dismiss on outside click, escape key, or scroll (excluding log container scroll)
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
          target.closest('.log-container') ||
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

  if (!position || !pod) return null;

  const hasNoRestarts = (pod.restartCount ?? (pod as any).restarts ?? 0) === 0;

  return createPortal(
    <div
      ref={menuRef}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-50 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl py-1.5 w-60 text-xs text-zinc-300 select-none animate-in fade-in zoom-in-95 duration-100 font-sans"
    >
      {/* Target Workload Header */}
      <div className="px-3 py-1 text-[11px] font-mono border-b border-zinc-800/80 mb-1 flex items-center justify-between">
        <span
          className="text-zinc-200 font-semibold truncate mr-2"
          title={selectedPods && selectedPods.length > 1 ? `${selectedPods.length} Pods Selected` : pod.name}
        >
          {selectedPods && selectedPods.length > 1 ? `${selectedPods.length} Pods Selected` : pod.name}
        </span>
        <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono flex-shrink-0">
          {selectedPods && selectedPods.length > 1 ? `${selectedPods.length} pods` : pod.namespace}
        </span>
      </div>

      {/* Multi-Selection Combined Logs Action */}
      {selectedPods && selectedPods.length > 1 && onViewCombinedLogs && (
        <>
          <div className="py-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onViewCombinedLogs(selectedPods);
                onClose();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
              className="w-full px-3 py-1.5 text-left flex items-center space-x-2 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 font-medium transition-colors cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
              <span>View Combined Logs ({selectedPods.length} Pods)</span>
            </button>
          </div>
          <div className="border-b border-zinc-800/80 my-1" />
        </>
      )}

      {/* 1. Pinning & Identity */}
      <div className="py-0.5">
        <button
          type="button"
          onClick={() => {
            onTogglePin(pod);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left flex items-center space-x-2 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
        >
          {isPinned ? (
            <>
              <PinOff className="w-3.5 h-3.5 text-amber-400" />
              <span>Unpin Workload</span>
            </>
          ) : (
            <>
              <Pin className="w-3.5 h-3.5 text-amber-400" />
              <span>Pin Workload</span>
            </>
          )}
        </button>
      </div>

      <div className="border-b border-zinc-800/80 my-1" />

      {/* 2. Primary Telemetry Actions */}
      <div className="py-0.5 border-b border-zinc-800/80 mb-1 pb-1">
        <button
          type="button"
          onClick={() => {
            onViewLogs(pod, false);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left flex items-center space-x-2 hover:bg-zinc-800 hover:text-cyan-300 transition-colors cursor-pointer"
        >
          <FileText className="w-3.5 h-3.5 text-cyan-400" />
          <span>View Live Logs</span>
        </button>

        {onOpenExec && (
          <button
            type="button"
            onClick={() => {
              onOpenExec(pod);
              onClose();
            }}
            className="w-full px-3 py-1.5 text-left flex items-center space-x-2 hover:bg-zinc-800 hover:text-emerald-300 transition-colors cursor-pointer"
          >
            <SquareTerminal className="w-3.5 h-3.5 text-emerald-400" />
            <span>Open Shell / Exec</span>
          </button>
        )}

        <button
          type="button"
          disabled={hasNoRestarts}
          title={
            hasNoRestarts
              ? "No previous instances available (restarts: 0)"
              : "View previous container exit logs"
          }
          onClick={() => {
            if (hasNoRestarts) return;
            onViewLogs(pod, true);
            onClose();
          }}
          className={`w-full px-3 py-1.5 text-left flex items-center space-x-2 transition-colors ${
            hasNoRestarts
              ? "opacity-40 cursor-not-allowed pointer-events-none text-zinc-500"
              : "hover:bg-zinc-800 hover:text-cyan-300 transition-colors cursor-pointer text-zinc-300"
          }`}
        >
          <History className="w-3.5 h-3.5 text-cyan-400" />
          <span>View Previous Logs</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onInspectDetails(pod, "containers");
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left flex items-center space-x-2 hover:bg-zinc-800 hover:text-sky-300 transition-colors cursor-pointer"
        >
          <FileCode className="w-3.5 h-3.5 text-sky-400" />
          <span>Inspect Details / YAML</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onInspectDetails(pod, "events");
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left flex items-center space-x-2 hover:bg-zinc-800 hover:text-sky-300 transition-colors cursor-pointer"
        >
          <Activity className="w-3.5 h-3.5 text-amber-400" />
          <span>Show Kubernetes Events</span>
        </button>
      </div>

      <div className="border-b border-zinc-800/80 my-1" />

      {/* 3. Clipboard Utilities */}
      <div className="py-0.5">
        <button
          type="button"
          onClick={() => {
            onCopyName(pod);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left flex items-center space-x-2 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
        >
          <Copy className="w-3.5 h-3.5 text-zinc-400" />
          <span>Copy Pod Name</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onCopyIP(pod);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left flex items-center space-x-2 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
        >
          <Network className="w-3.5 h-3.5 text-zinc-400" />
          <span>Copy Pod IP ({pod.ip || "Pending"})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onCopyImage(pod);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left flex items-center space-x-2 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
        >
          <Box className="w-3.5 h-3.5 text-zinc-400" />
          <span>Copy Container Image</span>
        </button>
      </div>

      <div className="border-b border-zinc-800/80 my-1" />

      {/* 4. Lifecycle & Mutating Actions */}
      <div className="py-0.5">
        <button
          type="button"
          onClick={() => {
            onRestartPod(pod);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left flex items-center space-x-2 hover:bg-amber-950/40 hover:text-amber-300 text-amber-400 transition-colors cursor-pointer"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>Restart Pod</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onKillPod(pod);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left flex items-center space-x-2 hover:bg-rose-950/40 hover:text-rose-300 text-rose-400 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete / Kill Pod</span>
        </button>
      </div>
    </div>,
    document.body
  );
};
