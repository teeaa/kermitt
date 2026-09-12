import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Terminal,
  X,
  Copy,
  Check,
  Trash2,
  Search,
  ArrowDownCircle,
} from "lucide-react";
import { kubeApi } from "../../services/kubeApi";
import { EventsOn } from "../../../wailsjs/runtime/runtime";
import { copyText } from "../../utils/clipboard";

export interface ParsedAppLog {
  id: string;
  raw: string;
  timestamp: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  message: string;
  attributes?: string;
}

export function parseAppLogLine(raw: string, index: number): ParsedAppLog {
  const id = `backend-log-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  let level: ParsedAppLog["level"] = "INFO";
  let timestamp = "";
  let message = raw;
  let attributes = "";

  // 1. Extract timestamp: time=2026-09-07T12:34:56.789+01:00 or ISO timestamp
  const timeMatch = raw.match(/\btime=([^\s]+)/);
  if (timeMatch) {
    const rawTime = timeMatch[1].replace(/"/g, "");
    try {
      const d = new Date(rawTime);
      if (!isNaN(d.getTime())) {
        timestamp = d.toLocaleTimeString();
      } else {
        timestamp = rawTime.slice(11, 19) || rawTime;
      }
    } catch {
      timestamp = rawTime;
    }
  }

  // 2. Extract level: level=DEBUG, level=INFO, level=WARN, level=ERROR
  const levelMatch = raw.match(/\blevel=([A-Za-z]+)/i);
  if (levelMatch) {
    const lvl = levelMatch[1].toUpperCase();
    if (lvl === "DEBUG") level = "DEBUG";
    else if (lvl === "INFO") level = "INFO";
    else if (lvl === "WARN" || lvl === "WARNING") level = "WARN";
    else if (lvl === "ERROR" || lvl === "FATAL" || lvl === "PANIC") level = "ERROR";
  } else {
    // Check for standard prefix formats: [INFO], INFO:, etc.
    const altLevelMatch = raw.match(/\b(DEBUG|INFO|WARN(?:ING)?|ERROR)\b/i);
    if (altLevelMatch) {
      const lvl = altLevelMatch[1].toUpperCase();
      if (lvl === "DEBUG") level = "DEBUG";
      else if (lvl === "INFO") level = "INFO";
      else if (lvl.startsWith("WARN")) level = "WARN";
      else if (lvl === "ERROR") level = "ERROR";
    }
  }

  // 3. Extract msg="..." and trailing key-value attributes
  const msgMatch = raw.match(/\bmsg="([^"]*)"/);
  if (msgMatch) {
    message = msgMatch[1];
    const afterMsg = raw.slice((msgMatch.index || 0) + msgMatch[0].length).trim();
    if (afterMsg) {
      attributes = afterMsg;
    }
  } else {
    // Look for unquoted msg=something
    const unquotedMsgMatch = raw.match(/\bmsg=([^\s]+)/);
    if (unquotedMsgMatch) {
      message = unquotedMsgMatch[1];
      const afterMsg = raw.slice((unquotedMsgMatch.index || 0) + unquotedMsgMatch[0].length).trim();
      if (afterMsg) {
        attributes = afterMsg;
      }
    }
  }

  return {
    id,
    raw,
    timestamp,
    level,
    message,
    attributes,
  };
}

export interface AppLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AppLogsModal: React.FC<AppLogsModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<ParsedAppLog[]>([]);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Load initial log history from backend ring buffer on modal open
  useEffect(() => {
    if (!isOpen) return;

    kubeApi
      .getApplicationLogs()
      .then((lines) => {
        const parsed = (lines || []).map((line, idx) => parseAppLogLine(line, idx));
        setLogs(parsed);
      })
      .catch((err) => {
        console.debug("Failed to fetch application logs:", err);
      });
  }, [isOpen]);

  // Subscribe to real-time backend log streaming via Wails runtime event
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const unlisten = EventsOn("app:log:entry", (line: string) => {
      if (!isMounted || typeof line !== "string") return;
      setLogs((prev) => {
        const nextEntry = parseAppLogLine(line, prev.length);
        const updated = [...prev, nextEntry];
        return updated.length > 1000 ? updated.slice(-1000) : updated;
      });
    });

    return () => {
      isMounted = false;
      if (typeof unlisten === "function") {
        unlisten();
      }
    };
  }, [isOpen]);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (isOpen && autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, isOpen, autoScroll]);

  // Handle scroll detection for auto-scroll toggle
  const handleScroll = () => {
    if (!logsContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    } else if (isAtBottom && !autoScroll) {
      setAutoScroll(true);
    }
  };

  const filteredLogs = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.toLowerCase();
    return logs.filter(
      (l) =>
        l.raw.toLowerCase().includes(q) ||
        l.message.toLowerCase().includes(q) ||
        l.level.toLowerCase().includes(q) ||
        (l.attributes && l.attributes.toLowerCase().includes(q)) ||
        l.timestamp.toLowerCase().includes(q)
    );
  }, [logs, search]);

  const handleCopyAll = async () => {
    const text = filteredLogs.map((l) => l.raw).join("\n");
    const success = await copyText(text);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClear = async () => {
    await kubeApi.clearApplicationLogs();
    setLogs([]);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Application Logs"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl h-[650px] max-h-[85vh] bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden text-zinc-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
          <div className="flex items-center space-x-2.5">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-zinc-100 font-sans">Application Logs</h3>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
              {filteredLogs.length} events
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {/* Search Bar */}
            <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs space-x-1.5 focus-within:border-cyan-500">
              <Search className="w-3.5 h-3.5 text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter logs..."
                className="bg-transparent text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none w-36 sm:w-48 font-mono"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Copy Button */}
            <button
              type="button"
              onClick={handleCopyAll}
              title="Copy all visible logs"
              className="p-1.5 rounded bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100 text-zinc-300 transition-colors flex items-center space-x-1 text-xs cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[11px] text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline text-[11px]">Copy</span>
                </>
              )}
            </button>

            {/* Clear Button */}
            <button
              type="button"
              onClick={handleClear}
              title="Clear log buffer"
              className="p-1.5 rounded bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 hover:text-rose-300 text-zinc-400 transition-colors text-xs cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Logs Scroll Body */}
        <div
          ref={logsContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed space-y-1 bg-black/50 select-text cursor-text"
        >
          {filteredLogs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-zinc-500 font-sans text-xs">
              No application log events recorded yet.
            </div>
          ) : (
            filteredLogs.map((l) => {
              const levelColor =
                l.level === "ERROR"
                  ? "text-rose-400 bg-rose-950/60 border-rose-800"
                  : l.level === "WARN"
                  ? "text-amber-400 bg-amber-950/60 border-amber-800"
                  : l.level === "INFO"
                  ? "text-emerald-400 bg-emerald-950/60 border-emerald-800"
                  : "text-cyan-400 bg-cyan-950/60 border-cyan-800"; // DEBUG

              return (
                <div
                  key={l.id}
                  className="flex items-start space-x-2 py-0.5 hover:bg-zinc-900/50 px-1.5 rounded transition-colors"
                >
                  {l.timestamp && (
                    <span className="text-[11px] text-zinc-500 select-none flex-shrink-0">
                      {l.timestamp}
                    </span>
                  )}
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase border flex-shrink-0 select-none ${levelColor}`}
                  >
                    {l.level}
                  </span>
                  <div className="text-zinc-200 break-all select-text cursor-text flex-1">
                    <span>{l.message}</span>
                    {l.attributes && (
                      <span className="ml-2 text-zinc-500 text-[11px] font-mono">
                        {l.attributes}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800 bg-zinc-900/60 text-[11px] text-zinc-400">
          <span>
            Shortcut: <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300 font-mono">Cmd+L</kbd>
          </span>

          {!autoScroll && (
            <button
              type="button"
              onClick={() => {
                setAutoScroll(true);
                bottomRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
              className="flex items-center space-x-1 text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
            >
              <ArrowDownCircle className="w-3.5 h-3.5" />
              <span>Scroll to bottom</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const ApplicationLogsModal = AppLogsModal;
