import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Terminal,
  FileCode,
  Activity,
  Copy,
  RotateCw,
  Trash2,
  Play,
  Pause,
  PlayCircle,
  Clock,
  Box,
} from "lucide-react";
import { JobItem, CronJobItem } from "./JobsView";

export interface JobContextMenuProps {
  job: JobItem | null;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onViewLogs: (job: JobItem, previous?: boolean) => void;
  onInspectDetails: (job: JobItem, tab?: "yaml" | "events") => void;
  onCopyName: (job: JobItem) => void;
  onCopyImage: (job: JobItem) => void;
  onRerunJob: (job: JobItem) => void;
  onDeleteJob: (job: JobItem) => void;
  mutationsDisabled?: boolean;
}

export const JobContextMenu: React.FC<JobContextMenuProps> = ({
  job,
  position,
  onClose,
  onViewLogs,
  onInspectDetails,
  onCopyName,
  onCopyImage,
  onRerunJob,
  onDeleteJob,
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

  if (!position || !job) return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-50 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl py-1.5 w-60 text-xs text-zinc-300 select-none animate-in fade-in zoom-in-95 duration-100 font-sans"
    >
      {/* Target Workload Header */}
      <div className="px-3 py-1 text-[11px] font-mono border-b border-zinc-800/80 mb-1 flex items-center justify-between">
        <span className="text-zinc-200 font-semibold truncate mr-2" title={job.name}>
          {job.name}
        </span>
        <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono flex-shrink-0">
          {job.namespace}
        </span>
      </div>

      {/* 1. Telemetry & Inspection */}
      <div className="py-0.5 border-b border-zinc-800/80 mb-1 pb-1">
        <button
          type="button"
          onClick={() => {
            onViewLogs(job, false);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left flex items-center space-x-2 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
        >
          <Terminal className="w-3.5 h-3.5 text-cyan-400" />
          <span>View Pod Logs</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onViewLogs(job, true);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left flex items-center space-x-2 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
        >
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span>View Previous Logs</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onInspectDetails(job, "yaml");
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left flex items-center space-x-2 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
        >
          <FileCode className="w-3.5 h-3.5 text-slate-400" />
          <span>Inspect YAML / Details</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onInspectDetails(job, "events");
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left flex items-center space-x-2 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
        >
          <Activity className="w-3.5 h-3.5 text-slate-400" />
          <span>Show Events</span>
        </button>
      </div>

      {/* 2. Clipboard Utilities */}
      <div className="py-0.5 border-b border-zinc-800/80 mb-1 pb-1">
        <button
          type="button"
          onClick={() => {
            onCopyName(job);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left flex items-center space-x-2 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
        >
          <Copy className="w-3.5 h-3.5 text-slate-400" />
          <span>Copy Job Name</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onCopyImage(job);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left flex items-center space-x-2 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
        >
          <Box className="w-3.5 h-3.5 text-slate-400" />
          <span>Copy Container Image</span>
        </button>
      </div>

      {/* 3. Lifecycle & Mutating Actions */}
      <div className="py-0.5">
        <button
          type="button"
          onClick={() => {
            onRerunJob(job);
            onClose();
          }}
          title="Rerun this job"
          className="w-full px-3 py-1.5 text-left flex items-center justify-between transition-colors hover:bg-zinc-800 hover:text-amber-400 cursor-pointer"
        >
          <span className="flex items-center space-x-2">
            <RotateCw className="w-3.5 h-3.5 text-amber-400" />
            <span>Rerun Job</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            onDeleteJob(job);
            onClose();
          }}
          title="Delete this job"
          className="w-full px-3 py-1.5 text-left flex items-center justify-between transition-colors hover:bg-rose-950/40 text-rose-400 hover:text-rose-300 cursor-pointer"
        >
          <span className="flex items-center space-x-2">
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Job</span>
          </span>
        </button>
      </div>
    </div>,
    document.body
  );
};

export interface CronJobContextMenuProps {
  cronJob: CronJobItem | null;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onTriggerRun: (cronJob: CronJobItem) => void;
  onToggleSuspend: (cronJob: CronJobItem) => void;
  onViewLogs: (cronJob: CronJobItem) => void;
  onInspectDetails: (cronJob: CronJobItem, tab?: "yaml" | "events") => void;
  onCopyName: (cronJob: CronJobItem) => void;
  onCopySchedule: (cronJob: CronJobItem) => void;
  onDeleteCronJob: (cronJob: CronJobItem) => void;
  mutationsDisabled?: boolean;
}

export const CronJobContextMenu: React.FC<CronJobContextMenuProps> = ({
  cronJob,
  position,
  onClose,
  onTriggerRun,
  onToggleSuspend,
  onViewLogs,
  onInspectDetails,
  onCopyName,
  onCopySchedule,
  onDeleteCronJob,
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

  if (!position || !cronJob) return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-50 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl py-1.5 w-64 text-xs text-zinc-300 select-none animate-in fade-in zoom-in-95 duration-100 font-sans"
    >
      {/* Target Workload Header */}
      <div className="px-3 py-1 text-[11px] font-mono border-b border-zinc-800/80 mb-1 flex items-center justify-between">
        <span className="text-zinc-200 font-semibold truncate mr-2" title={cronJob.name}>
          {cronJob.name}
        </span>
        <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono flex-shrink-0">
          {cronJob.namespace}
        </span>
      </div>

      {/* 1. Execution & Schedule Controls */}
      <div className="py-0.5 border-b border-zinc-800/80 mb-1 pb-1">
        <button
          type="button"
          onClick={() => {
            onTriggerRun(cronJob);
            onClose();
          }}
          title="Trigger an immediate run"
          className="w-full px-3 py-1.5 text-left flex items-center justify-between transition-colors hover:bg-zinc-800 hover:text-emerald-400 cursor-pointer"
        >
          <span className="flex items-center space-x-2">
            <Play className="w-3.5 h-3.5 text-emerald-400" />
            <span>Trigger Run Now</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            onToggleSuspend(cronJob);
            onClose();
          }}
          title={cronJob.suspend ? "Resume recurring schedule" : "Suspend recurring schedule"}
          className="w-full px-3 py-1.5 text-left flex items-center justify-between transition-colors hover:bg-zinc-800 hover:text-amber-400 cursor-pointer"
        >
          <span className="flex items-center space-x-2">
            {cronJob.suspend ? (
              <>
                <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>Resume Schedule</span>
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5 text-amber-400" />
                <span>Suspend Schedule</span>
              </>
            )}
          </span>
        </button>
      </div>

      {/* 2. Telemetry & Inspection */}
      <div className="py-0.5 border-b border-zinc-800/80 mb-1 pb-1">
        <button
          type="button"
          onClick={() => {
            onViewLogs(cronJob);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left flex items-center space-x-2 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
        >
          <Terminal className="w-3.5 h-3.5 text-cyan-400" />
          <span>View Latest Job Logs</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onInspectDetails(cronJob, "yaml");
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left flex items-center space-x-2 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
        >
          <FileCode className="w-3.5 h-3.5 text-slate-400" />
          <span>Inspect YAML / Details</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onInspectDetails(cronJob, "events");
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left flex items-center space-x-2 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
        >
          <Activity className="w-3.5 h-3.5 text-slate-400" />
          <span>Show Events</span>
        </button>
      </div>

      {/* 3. Clipboard Utilities */}
      <div className="py-0.5 border-b border-zinc-800/80 mb-1 pb-1">
        <button
          type="button"
          onClick={() => {
            onCopyName(cronJob);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left flex items-center space-x-2 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
        >
          <Copy className="w-3.5 h-3.5 text-slate-400" />
          <span>Copy CronJob Name</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onCopySchedule(cronJob);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left flex items-center space-x-2 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
        >
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span className="truncate">Copy Schedule ({cronJob.schedule})</span>
        </button>
      </div>

      {/* 4. Destructive Action */}
      <div className="py-0.5">
        <button
          type="button"
          onClick={() => {
            onDeleteCronJob(cronJob);
            onClose();
          }}
          title="Delete this CronJob"
          className="w-full px-3 py-1.5 text-left flex items-center justify-between transition-colors hover:bg-rose-950/40 text-rose-400 hover:text-rose-300 cursor-pointer"
        >
          <span className="flex items-center space-x-2">
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete CronJob</span>
          </span>
        </button>
      </div>
    </div>,
    document.body
  );
};
