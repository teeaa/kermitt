import React, { useState } from "react";
import {
  AlertTriangle,
  ShieldAlert,
  X,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";
import { useNotifications, notificationStore, AppNotification } from "../../hooks/useNotificationStore";

export const ErrorAlert: React.FC = () => {
  const notifications = useNotifications();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedDetailsId, setExpandedDetailsId] = useState<string | null>(null);

  if (notifications.length === 0) {
    return null;
  }

  const handleCopy = (item: AppNotification) => {
    const textToCopy = [
      `[${item.title}]`,
      item.message,
      item.details ? `Details: ${item.details}` : "",
      `Time: ${item.timestamp.toISOString()}`,
    ]
      .filter(Boolean)
      .join("\n");

    navigator.clipboard.writeText(textToCopy);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleDetails = (id: string) => {
    setExpandedDetailsId((prev) => (prev === id ? null : id));
  };

  return (
    <aside
      aria-label="Application Notifications"
      className="fixed top-4 right-4 z-50 flex flex-col space-y-2.5 max-w-lg w-[calc(100vw-2rem)] sm:w-[460px] pointer-events-auto"
    >
      {notifications.length > 1 && (
        <div className="flex items-center justify-between px-2 py-0.5 text-[11px] text-rose-300 font-mono">
          <span>{notifications.length} Active System Alerts</span>
          <button
            type="button"
            onClick={() => notificationStore.clear()}
            className="flex items-center space-x-1 text-rose-400 hover:text-rose-200 transition-colors cursor-pointer"
            title="Clear all alerts"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear all</span>
          </button>
        </div>
      )}

      {notifications.map((item) => {
        const isCopied = copiedId === item.id;
        const isExpanded = expandedDetailsId === item.id;

        return (
          <div
            key={item.id}
            role="alert"
            className="relative bg-rose-950/95 border border-rose-700/80 text-rose-100 rounded-lg p-3.5 shadow-2xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-2 duration-150"
          >
            {/* Header: Icon, Title, Actions */}
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-start space-x-2.5 min-w-0">
                {item.isForbidden ? (
                  <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold text-rose-200 truncate select-text cursor-text font-sans">
                    {item.title}
                  </h4>
                  <div className="text-[10px] text-rose-400/80 font-mono">
                    {item.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>

              {/* Action Buttons: Copy & Dismiss */}
              <div className="flex items-center space-x-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopy(item)}
                  title="Copy full error details"
                  className="p-1 rounded text-rose-300 hover:text-white hover:bg-rose-900/60 transition-colors cursor-pointer flex items-center space-x-1 text-[11px]"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-[10px] text-emerald-300 font-mono">Copied</span>
                    </>
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => notificationStore.dismiss(item.id)}
                  title="Dismiss alert"
                  className="p-1 rounded text-rose-400 hover:text-rose-100 hover:bg-rose-900/60 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Error Message: Fully Selectable Text */}
            <div className="mt-2 text-xs text-rose-100/90 leading-relaxed font-sans select-text cursor-text bg-rose-900/30 rounded p-2 border border-rose-800/40 break-words">
              {item.message}
            </div>

            {/* Expandable Raw Details / Stack Trace */}
            {item.details && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => toggleDetails(item.id)}
                  className="flex items-center space-x-1 text-[11px] text-rose-300 hover:text-rose-100 font-mono transition-colors cursor-pointer"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="w-3 h-3" />
                      <span>Hide details</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3 h-3" />
                      <span>Show raw details</span>
                    </>
                  )}
                </button>

                {isExpanded && (
                  <pre className="mt-1.5 p-2 bg-black/40 rounded text-[11px] font-mono text-rose-200/90 overflow-x-auto select-text cursor-text border border-rose-800/50 max-h-36 whitespace-pre-wrap break-all">
                    {item.details}
                  </pre>
                )}
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
};
