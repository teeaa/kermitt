import { useState, useEffect, useCallback } from "react";

export interface PinnedItem {
  id: string;
  label: string;
  emoji: string;
  color: string; // 'emerald' | 'sky' | 'rose' | 'amber' | 'purple' | 'indigo' | 'fuchsia'
  context: string;
  namespace: string;
  podPattern?: string; // e.g. "auth-service-*"
}

const STORAGE_KEY = "kermitt:pinned-items";

/**
 * Automatically strips Kubernetes replica/hash suffixes to generate a reusable pattern.
 * e.g.:
 * - "auth-service-589fc485f5-9m74p" -> "auth-service-*"
 * - "db-migration-job-v12-2n98r"   -> "db-migration-job-v12-*"
 * - "redis-cache-0"                 -> "redis-cache-*"
 */
export function extractPodPattern(podName: string): string {
  if (!podName) return "*";

  // Standard deployment pod: <name>-<pod-template-hash 8-10 chars>-<random 5 chars>
  const deploymentMatch = podName.match(/^(.+)-[0-9a-f]{5,10}-[0-9a-z]{5}$/i);
  if (deploymentMatch) {
    return `${deploymentMatch[1]}-*`;
  }

  // Jobs / Replicasets with single suffix: <name>-<5 chars>
  const jobMatch = podName.match(/^(.+)-[0-9a-z]{5}$/i);
  if (jobMatch) {
    return `${jobMatch[1]}-*`;
  }

  // StatefulSet pod with numeric ordinal index: <name>-<number>
  const statefulMatch = podName.match(/^(.+)-\d+$/);
  if (statefulMatch) {
    return `${statefulMatch[1]}-*`;
  }

  return `${podName}-*`;
}

/**
 * Derives a human-friendly display label from a pod name or pattern.
 */
export function deriveFriendlyLabel(nameOrPattern: string): string {
  const clean = nameOrPattern.replace(/-\*$/, "").replace(/-[0-9a-f]{5,10}-[0-9a-z]{5}$/i, "");
  // Capitalize words separated by hyphens
  return clean
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const DEFAULT_PINS: PinnedItem[] = [];

export function usePinnedItems() {
  const [pinnedItems, setPinnedItems] = useState<PinnedItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Filter out legacy dummy pins
          return parsed.filter(
            (p: PinnedItem) =>
              p.context !== "kermit-dev-local" &&
              p.namespace !== "kermit-dev" &&
              !p.podPattern?.includes("payment-processor") &&
              !p.podPattern?.includes("auth-service")
          );
        }
      }
    } catch (e) {
      console.warn("Failed to load pinned items from localStorage:", e);
    }
    return DEFAULT_PINS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pinnedItems));
    } catch (e) {
      console.warn("Failed to save pinned items to localStorage:", e);
    }
  }, [pinnedItems]);

  const addPin = useCallback((pin: Omit<PinnedItem, "id">): PinnedItem => {
    const newPin: PinnedItem = {
      ...pin,
      id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
    setPinnedItems((prev) => [newPin, ...prev]);
    return newPin;
  }, []);

  const updatePin = useCallback((id: string, updates: Partial<PinnedItem>) => {
    setPinnedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  }, []);

  const deletePin = useCallback((id: string) => {
    setPinnedItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const getPinForPod = useCallback(
    (context: string, namespace: string, podName: string): PinnedItem | undefined => {
      const pattern = extractPodPattern(podName);
      const prefix = pattern.replace(/-\*$/, "");
      return pinnedItems.find(
        (p) =>
          p.context === context &&
          p.namespace === namespace &&
          (p.podPattern === pattern || podName.startsWith(prefix))
      );
    },
    [pinnedItems]
  );

  const isPinned = useCallback(
    (context: string, namespace: string, podName: string): boolean => {
      return !!getPinForPod(context, namespace, podName);
    },
    [getPinForPod]
  );

  const togglePin = useCallback(
    (context: string, namespace: string, podName: string): PinnedItem | null => {
      const existing = getPinForPod(context, namespace, podName);
      if (existing) {
        deletePin(existing.id);
        return null;
      }

      const pattern = extractPodPattern(podName);
      const label = deriveFriendlyLabel(pattern);
      const colorOptions = ["emerald", "sky", "rose", "amber", "purple", "indigo"];
      const randomColor = colorOptions[Math.floor(Math.random() * colorOptions.length)];

      return addPin({
        label,
        emoji: "📦",
        color: randomColor,
        context,
        namespace,
        podPattern: pattern,
      });
    },
    [getPinForPod, deletePin, addPin]
  );

  return {
    pinnedItems,
    addPin,
    updatePin,
    deletePin,
    isPinned,
    getPinForPod,
    togglePin,
  };
}
