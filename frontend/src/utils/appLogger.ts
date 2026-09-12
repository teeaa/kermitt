import { useSyncExternalStore } from "react";

export interface AppLogEntry {
  id: string;
  timestamp: Date;
  level: "debug" | "info" | "warn" | "error";
  message: string;
}

const MAX_LOG_ENTRIES = 1000;
let logEntries: AppLogEntry[] = [];
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((fn) => fn());
}

export const appLogger = {
  getLogs(): AppLogEntry[] {
    return logEntries;
  },

  subscribe(callback: () => void): () => void {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  },

  log(level: AppLogEntry["level"], message: string) {
    const entry: AppLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date(),
      level,
      message,
    };

    logEntries = [...logEntries.slice(-MAX_LOG_ENTRIES + 1), entry];
    notify();
  },

  info(message: string) {
    this.log("info", message);
  },

  warn(message: string) {
    this.log("warn", message);
  },

  error(message: string) {
    this.log("error", message);
  },

  debug(message: string) {
    this.log("debug", message);
  },

  clear() {
    logEntries = [];
    notify();
  },
};

// Hook to subscribe to app logs
export function useAppLogs(): AppLogEntry[] {
  return useSyncExternalStore(appLogger.subscribe, appLogger.getLogs);
}

// Intercept window console to capture app-wide logs
if (typeof window !== "undefined") {
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.info = (...args: any[]) => {
    originalInfo.apply(console, args);
    appLogger.info(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));
  };

  console.warn = (...args: any[]) => {
    originalWarn.apply(console, args);
    appLogger.warn(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));
  };

  console.error = (...args: any[]) => {
    originalError.apply(console, args);
    appLogger.error(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));
  };
}
