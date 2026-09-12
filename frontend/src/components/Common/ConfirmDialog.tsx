import React, { useEffect, useRef } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

export type ConfirmActionType =
  | "kill"
  | "restart"
  | "delete"
  | "trigger"
  | "suspend"
  | "resume"
  | "rerun";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  actionType: ConfirmActionType;
  context?: string;
  namespace: string;
  podName?: string;
  itemName?: string;
  confirmLabel?: string;
  description?: React.ReactNode;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  showForceCheckbox?: boolean;
  isForce?: boolean;
  onToggleForce?: (force: boolean) => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  actionType,
  context = "",
  namespace,
  podName,
  itemName,
  confirmLabel,
  description,
  isSubmitting = false,
  errorMessage,
  showForceCheckbox = false,
  isForce = false,
  onToggleForce,
}) => {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const targetName = itemName || podName || "item";

  // Focus cancel button on open & listen for Escape
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => cancelBtnRef.current?.focus(), 50);
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isSubmitting]);

  if (!isOpen) return null;

  const isDanger = actionType === "kill" || actionType === "delete";
  const confirmBtnLabel =
    confirmLabel ||
    (actionType === "kill"
      ? "Confirm & Kill Pod"
      : actionType === "delete"
      ? "Confirm & Delete"
      : actionType === "restart"
      ? "Confirm & Restart Pod"
      : actionType === "rerun"
      ? "Confirm & Rerun Job"
      : actionType === "trigger"
      ? "Confirm & Trigger Run"
      : actionType === "suspend"
      ? "Confirm & Suspend Schedule"
      : actionType === "resume"
      ? "Confirm & Resume Schedule"
      : "Confirm Action");

  const confirmBtnColor = isDanger
    ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/40"
    : actionType === "trigger" || actionType === "resume"
    ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40"
    : "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/40";

  const submittingLabel =
    actionType === "trigger"
      ? "Triggering..."
      : actionType === "rerun"
      ? "Rerunning..."
      : actionType === "kill" || actionType === "delete"
      ? "Deleting..."
      : actionType === "restart"
      ? "Restarting..."
      : actionType === "suspend"
      ? "Suspending..."
      : actionType === "resume"
      ? "Resuming..."
      : "Processing...";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isDanger
                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                  : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-300 leading-relaxed">
            {description || (
              <>
                Are you sure you want to {isDanger ? "terminate / delete" : actionType} resource{" "}
                <strong className="font-mono text-cyan-300">&quot;{targetName}&quot;</strong>?
              </>
            )}
          </p>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs space-y-1 font-mono">
            <div className="flex justify-between">
              <span className="text-slate-500">Context:</span>
              <span className="text-slate-200 truncate">{context || "current"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Namespace:</span>
              <span className="text-slate-200 truncate">{namespace}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Target:</span>
              <span className="text-slate-200 truncate">{targetName}</span>
            </div>
          </div>

          {errorMessage && (
            <div className="p-2.5 rounded-md bg-rose-950/60 border border-rose-800/80 text-[11px] text-rose-300 flex items-start space-x-2 animate-in fade-in">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
              <span className="leading-tight break-all">{errorMessage}</span>
            </div>
          )}

          {showForceCheckbox && (
            <label className="flex items-center space-x-2.5 p-2.5 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer hover:bg-slate-800/60 transition-colors select-none">
              <input
                type="checkbox"
                checked={isForce}
                onChange={(e) => onToggleForce?.(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-rose-500 focus:ring-offset-slate-900 w-4 h-4 cursor-pointer"
              />
              <div className="flex flex-col">
                <span className="text-xs font-medium text-rose-300">
                  Force delete immediately (grace period: 0s)
                </span>
                <span className="text-[10px] text-slate-400">
                  Bypasses graceful shutdown and sends SIGKILL immediately
                </span>
              </div>
            </label>
          )}

          <div className="p-2.5 rounded-md bg-amber-950/40 border border-amber-900/60 text-[11px] text-amber-300 flex items-start space-x-2">
            <span className="text-amber-400 font-bold">⚠️</span>
            <span>
              {isDanger
                ? "This operation cannot be undone. Associated workloads and running containers will be terminated."
                : actionType === "trigger"
                ? "A new job pod instance will be immediately created and scheduled to run."
                : actionType === "suspend"
                ? "Future cron executions will be paused until this schedule is resumed."
                : "Kubernetes will trigger an execution sequence according to the active configuration."}
            </span>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end space-x-2.5">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className={`px-4 py-2 rounded-md text-xs font-medium transition-colors shadow-md flex items-center justify-center space-x-1.5 ${confirmBtnColor} disabled:opacity-50`}
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{isSubmitting ? submittingLabel : confirmBtnLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
