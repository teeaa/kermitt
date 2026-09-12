import React, { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { kubeApi } from "../../services/kubeApi";
import { AlertTriangle, RefreshCw, Terminal as TerminalIcon } from "lucide-react";

export interface ExecDrawerTabProps {
  namespace: string;
  podName: string;
  containerName?: string;
  isActive: boolean;
  onStatusChange?: (status: "connecting" | "live" | "ended" | "error", errorMessage?: string) => void;
  onClose?: () => void;
}

export const ExecDrawerTab: React.FC<ExecDrawerTabProps> = ({
  namespace,
  podName,
  containerName,
  isActive,
  onStatusChange,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const startedRef = useRef<boolean>(false);

  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const [sessionStatus, setSessionStatus] = useState<"connecting" | "live" | "ended" | "error">("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionRestartCounter, setSessionRestartCounter] = useState(0);

  // Helper to read current computed CSS variables from DOM root
  const getThemeOptions = useCallback(() => {
    if (typeof window === "undefined") {
      return {
        bg: "#05080f",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 12,
      };
    }
    const computed = getComputedStyle(document.documentElement);
    const bg = computed.getPropertyValue("--terminal-bg").trim() || "#05080f";
    const fontFamily =
      computed.getPropertyValue("--log-font-family").trim() ||
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    const rawFontSize = parseInt(computed.getPropertyValue("--log-font-size"), 10);
    const fontSize = !isNaN(rawFontSize) && rawFontSize >= 9 && rawFontSize <= 24 ? rawFontSize : 12;

    return { bg, fontFamily, fontSize };
  }, []);

  // Main interactive session lifecycle
  useEffect(() => {
    if (!terminalRef.current) return;
    if (startedRef.current) return;
    startedRef.current = true;

    let isDisposed = false;
    let currentSessionId: string | null = null;
    const { bg, fontFamily, fontSize } = getThemeOptions();

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily,
      fontSize,
      lineHeight: 1.25,
      theme: {
        background: bg,
        foreground: "#e2e8f0",
        cursor: "#38bdf8",
        cursorAccent: bg,
        selectionBackground: "rgba(56, 189, 248, 0.35)",
        black: "#1e293b",
        red: "#f87171",
        green: "#34d399",
        yellow: "#fbbf24",
        blue: "#38bdf8",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#f8fafc",
        brightBlack: "#475569",
        brightRed: "#fca5a5",
        brightGreen: "#6ee7b7",
        brightYellow: "#fde047",
        brightBlue: "#7dd3fc",
        brightMagenta: "#d8b4fe",
        brightCyan: "#67e8f9",
        brightWhite: "#ffffff",
      },
      convertEol: true,
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);

    termInstanceRef.current = term;
    fitAddonRef.current = fitAddon;

    try {
      fitAddon.fit();
    } catch {}

    setSessionStatus("connecting");
    setErrorMessage(null);
    onStatusChangeRef.current?.("connecting");

    const initialCols = term.cols || 80;
    const initialRows = term.rows || 24;

    const init = async () => {
      try {
        const id = await kubeApi.startPodExec({
          namespace,
          podName,
          containerName,
          cols: initialCols,
          rows: initialRows,
        });

        if (isDisposed) {
          kubeApi.stopPodExec(id).catch(() => {});
          return;
        }

        currentSessionId = id;
        sessionIdRef.current = id;
        setSessionStatus("live");
        onStatusChangeRef.current?.("live");

        // Transmit user keystrokes into remote stdin
        const dataDisposable = term.onData((data) => {
          if (sessionIdRef.current) {
            kubeApi.execWrite(sessionIdRef.current, data).catch((err) => {
              console.error("[EXEC] Failed to write stdin:", err);
            });
          }
        });

        // Browser preview mock mode
        if (id.startsWith("mock-exec-")) {
          term.writeln(`\x1b[1;32m✓ Connected to pod "${podName}" (browser preview mode)\x1b[0m`);
          term.writeln(`\x1b[90mRunning interactive shell fallback. Type 'exit' to quit.\x1b[0m\r\n`);
          term.write(`root@${podName}:/# `);
          let mockBuffer = "";
          const mockDataDisposable = term.onData((chunk) => {
            if (chunk === "\r") {
              term.writeln("");
              if (mockBuffer.trim() === "exit") {
                term.writeln("[Session concluded]");
                setSessionStatus("ended");
                onStatusChangeRef.current?.("ended");
              } else if (mockBuffer.trim() === "ls") {
                term.writeln("bin  boot  dev  etc  home  lib  media  mnt  opt  proc  root  run  sbin  sys  tmp  usr  var");
                term.write(`root@${podName}:/# `);
              } else if (mockBuffer.trim() === "pwd") {
                term.writeln("/");
                term.write(`root@${podName}:/# `);
              } else if (mockBuffer.trim() !== "") {
                term.writeln(`sh: command not found: ${mockBuffer.trim()}`);
                term.write(`root@${podName}:/# `);
              } else {
                term.write(`root@${podName}:/# `);
              }
              mockBuffer = "";
            } else if (chunk === "\u007F") {
              if (mockBuffer.length > 0) {
                mockBuffer = mockBuffer.slice(0, -1);
                term.write("\b \b");
              }
            } else {
              mockBuffer += chunk;
              term.write(chunk);
            }
          });
          dataDisposable.dispose();
          unsubscribeRef.current = () => mockDataDisposable.dispose();
          return;
        }

        // Subscribe to live Wails events
        const unsubscribe = kubeApi.subscribeToExec(
          id,
          (chunk) => {
            term.write(chunk);
          },
          (exitPayload) => {
            console.info("[EXEC] Session exit event received:", exitPayload);
            const exitErr = exitPayload.error;
            if (exitErr || exitPayload.exitCode === 127) {
              const displayErr = exitErr || "Process exited with code 127";
              setErrorMessage(displayErr);
              setSessionStatus("error");
              onStatusChangeRef.current?.("error", displayErr);
              if (exitErr) {
                term.writeln(`\r\n\x1b[1;31m[Session terminated with error: ${exitErr}]\x1b[0m`);
              }
            } else {
              setSessionStatus("ended");
              onStatusChangeRef.current?.("ended");
              term.writeln(`\r\n\x1b[90m[Process completed with exit code ${exitPayload.exitCode}]\x1b[0m`);
            }
          }
        );

        unsubscribeRef.current = () => {
          dataDisposable.dispose();
          unsubscribe();
        };

        if (term.cols && term.rows) {
          kubeApi.execResize(id, term.cols, term.rows).catch(() => {});
        }

        term.focus();
      } catch (err: any) {
        if (isDisposed) return;
        const msg = err?.message || String(err) || "Failed to start exec session";
        setErrorMessage(msg);
        setSessionStatus("error");
        onStatusChangeRef.current?.("error", msg);
        term.writeln(`\x1b[1;31m[EXEC ERROR] ${msg}\x1b[0m`);
      }
    };

    init();

    // Auto-fit terminal on container dimension changes
    let resizeTimer: any = null;
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (isDisposed || !fitAddonRef.current || !termInstanceRef.current) return;
        try {
          fitAddonRef.current.fit();
          const cols = termInstanceRef.current.cols;
          const rows = termInstanceRef.current.rows;
          if (sessionIdRef.current && cols > 0 && rows > 0) {
            kubeApi.execResize(sessionIdRef.current, cols, rows).catch(() => {});
          }
        } catch {}
      }, 50);
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      isDisposed = true;
      startedRef.current = false;
      clearTimeout(resizeTimer);
      resizeObserver.disconnect();

      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      if (currentSessionId) {
        const idToStop = currentSessionId;
        currentSessionId = null;
        sessionIdRef.current = null;
        kubeApi.stopPodExec(idToStop).catch(() => {});
      }

      term.dispose();
      termInstanceRef.current = null;
      fitAddonRef.current = null;
    };
  }, [namespace, podName, containerName, sessionRestartCounter, getThemeOptions]);

  // Focus and refit when tab becomes active
  useEffect(() => {
    if (isActive && fitAddonRef.current && termInstanceRef.current) {
      setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
          termInstanceRef.current?.focus();
        } catch {}
      }, 30);
    }
  }, [isActive]);

  const handleRestartSession = () => {
    setSessionRestartCounter((prev) => prev + 1);
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-[var(--terminal-bg)] overflow-hidden">
      {/* Session Banner if Error or Ended */}
      {sessionStatus === "error" && errorMessage && (
        <div className="px-4 py-2 bg-rose-950/80 border-b border-rose-800 text-rose-200 text-xs flex items-center justify-between z-20 flex-shrink-0 animate-in fade-in">
          <div className="flex items-center space-x-2 truncate mr-3">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span className="truncate">Shell session failed: {errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={handleRestartSession}
            className="px-2.5 py-1 rounded bg-rose-800 hover:bg-rose-700 text-white font-medium flex items-center space-x-1 transition-colors flex-shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reconnect</span>
          </button>
        </div>
      )}

      {sessionStatus === "ended" && (
        <div className="px-4 py-1.5 bg-slate-900/90 border-b border-slate-800 text-slate-400 text-xs flex items-center justify-between z-20 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <TerminalIcon className="w-3.5 h-3.5 text-slate-400" />
            <span>Interactive shell session disconnected.</span>
          </div>
          <button
            type="button"
            onClick={handleRestartSession}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center space-x-1 text-[11px] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Restart Session</span>
          </button>
        </div>
      )}

      {/* Embedded xterm DOM container */}
      <div
        ref={terminalRef}
        data-log-drawer="true"
        className="w-full flex-1 p-2 overflow-hidden select-text relative"
        style={{
          backgroundColor: "var(--terminal-bg)",
        }}
      />
    </div>
  );
};
