import { useState, useCallback, useMemo } from "react";
import { LogPayload } from "../services/kubeApi";

export interface LogFilterRule {
  id: string;
  type: "include" | "exclude";
  pattern: string;
  active: boolean;
}

const STORAGE_KEY = "kermitt:log-filter-rules";

const DEFAULT_RULES: LogFilterRule[] = [];

/**
 * Extracts and pre-lowercases active exclude and include patterns from filter rules.
 */
export function extractFilterPatterns(rules: LogFilterRule[]): {
  excludes: string[];
  includes: string[];
} {
  const excludes: string[] = [];
  const includes: string[] = [];
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (r.active) {
      const p = r.pattern.trim().toLowerCase();
      if (p) {
        if (r.type === "exclude") {
          excludes.push(p);
        } else if (r.type === "include") {
          includes.push(p);
        }
      }
    }
  }
  return { excludes, includes };
}

/**
 * Fast zero-allocation check whether pre-lowercased text satisfies filter rules:
 * 1. False if any active exclude matches.
 * 2. False if active includes exist and none match.
 * 3. True otherwise.
 */
export function matchesLogFilterRules(
  lowerText: string,
  excludes: string[],
  includes: string[]
): boolean {
  for (let i = 0; i < excludes.length; i++) {
    if (lowerText.includes(excludes[i])) {
      return false;
    }
  }
  if (includes.length > 0) {
    let matched = false;
    for (let i = 0; i < includes.length; i++) {
      if (lowerText.includes(includes[i])) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}

/**
 * Sequential Log Filter Engine:
 * 1. First drop any lines matching active Exclude rules.
 * 2. Then retain only lines matching active Include rules (if any configured).
 */
export function applyLogFilters(
  logs: LogPayload[],
  rules: LogFilterRule[]
): LogPayload[] {
  const { excludes, includes } = extractFilterPatterns(rules);

  if (excludes.length === 0 && includes.length === 0) {
    return logs;
  }

  return logs.filter((entry) => {
    const text = entry.line.toLowerCase();
    return matchesLogFilterRules(text, excludes, includes);
  });
}

export function useLogFilters() {
  const [rules, setRules] = useState<LogFilterRule[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn("Failed to load log filter rules:", e);
    }
    return DEFAULT_RULES;
  });

  const saveRules = useCallback((newRules: LogFilterRule[]) => {
    setRules(newRules);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newRules));
    } catch (e) {
      console.warn("Failed to save log filter rules:", e);
    }
  }, []);

  const addRule = useCallback(
    (type: "include" | "exclude", pattern: string) => {
      const trimmed = pattern.trim();
      if (!trimmed) return;
      const newRule: LogFilterRule = {
        id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        pattern: trimmed,
        active: true,
      };
      saveRules([...rules, newRule]);
    },
    [rules, saveRules]
  );

  const updateRule = useCallback(
    (id: string, updates: Partial<LogFilterRule>) => {
      saveRules(
        rules.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule))
      );
    },
    [rules, saveRules]
  );

  const toggleRule = useCallback(
    (id: string) => {
      saveRules(
        rules.map((rule) =>
          rule.id === id ? { ...rule, active: !rule.active } : rule
        )
      );
    },
    [rules, saveRules]
  );

  const deleteRule = useCallback(
    (id: string) => {
      saveRules(rules.filter((rule) => rule.id !== id));
    },
    [rules, saveRules]
  );

  const clearRules = useCallback(() => {
    saveRules([]);
  }, [saveRules]);

  const activeRulesCount = useMemo(() => {
    return rules.filter((r) => r.active && r.pattern.trim() !== "").length;
  }, [rules]);

  return {
    rules,
    addRule,
    updateRule,
    toggleRule,
    deleteRule,
    clearRules,
    activeRulesCount,
  };
}
