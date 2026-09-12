import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Info,
  SquareTerminal,
  RotateCw,
  Trash2,
  LucideIcon,
} from "lucide-react";

export type QuickToolId = "logs" | "details" | "exec" | "restart" | "kill";

export interface QuickToolItem {
  id: QuickToolId;
  label: string;
  description: string;
  icon: LucideIcon;
  isDestructive: boolean;
  colorClass: string;
  hoverColorClass: string;
}

export const ALL_QUICK_TOOLS: QuickToolItem[] = [
  {
    id: "logs",
    label: "View Logs",
    description: "Open the live streaming container log viewer.",
    icon: FileText,
    isDestructive: false,
    colorClass: "text-slate-400 hover:text-cyan-300 hover:bg-slate-800",
    hoverColorClass: "hover:text-cyan-300",
  },
  {
    id: "details",
    label: "Details",
    description: "Inspect container specs, env vars, mounts, and limits.",
    icon: Info,
    isDestructive: false,
    colorClass: "text-slate-400 hover:text-sky-300 hover:bg-slate-800",
    hoverColorClass: "hover:text-sky-300",
  },
  {
    id: "exec",
    label: "Open Shell / Exec",
    description: "Launch interactive terminal shell into the container.",
    icon: SquareTerminal,
    isDestructive: false,
    colorClass: "text-slate-400 hover:text-emerald-300 hover:bg-slate-800",
    hoverColorClass: "hover:text-emerald-300",
  },
  {
    id: "restart",
    label: "Restart",
    description: "Trigger rollout restart for this workload (Destructive).",
    icon: RotateCw,
    isDestructive: true,
    colorClass: "text-slate-400 hover:text-amber-400 hover:bg-amber-950/40",
    hoverColorClass: "hover:text-amber-400",
  },
  {
    id: "kill",
    label: "Kill / Delete",
    description: "Terminate and delete this pod instance (Destructive).",
    icon: Trash2,
    isDestructive: true,
    colorClass: "text-slate-400 hover:text-rose-400 hover:bg-rose-950/40",
    hoverColorClass: "hover:text-rose-400",
  },
];

const DEFAULT_ENABLED_TOOLS: QuickToolId[] = [
  "logs",
  "details",
  "exec",
  "restart",
  "kill",
];

const STORAGE_KEY = "kermitt_quick_tools";

export function useQuickTools() {
  const [enabledToolIds, setEnabledToolIds] = useState<QuickToolId[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Filter to known valid tool IDs
          const valid = parsed.filter((id) =>
            ALL_QUICK_TOOLS.some((t) => t.id === id)
          );
          if (valid.length > 0) return valid;
        }
      }
    } catch {}
    return DEFAULT_ENABLED_TOOLS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(enabledToolIds));
    } catch {}
  }, [enabledToolIds]);

  const toggleTool = useCallback((toolId: QuickToolId) => {
    setEnabledToolIds((prev) => {
      if (prev.includes(toolId)) {
        // Prevent disabling all tools (keep at least 1)
        if (prev.length <= 1) return prev;
        return prev.filter((id) => id !== toolId);
      } else {
        // Append
        return [...prev, toolId];
      }
    });
  }, []);

  const moveTool = useCallback((toolId: QuickToolId, direction: "up" | "down") => {
    setEnabledToolIds((prev) => {
      const idx = prev.indexOf(toolId);
      if (idx === -1) return prev;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, item);
      return copy;
    });
  }, []);

  const resetTools = useCallback(() => {
    setEnabledToolIds(DEFAULT_ENABLED_TOOLS);
  }, []);

  const enabledTools = enabledToolIds
    .map((id) => ALL_QUICK_TOOLS.find((t) => t.id === id))
    .filter((t): t is QuickToolItem => Boolean(t));

  return {
    allTools: ALL_QUICK_TOOLS,
    enabledToolIds,
    enabledTools,
    toggleTool,
    moveTool,
    resetTools,
  };
}
