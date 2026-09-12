import { useSyncExternalStore } from "react";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  details?: string;
  timestamp: Date;
  isForbidden?: boolean;
}

let notifications: AppNotification[] = [];
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

export const notificationStore = {
  getNotifications(): AppNotification[] {
    return notifications;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  addError(notification: Omit<AppNotification, "id" | "timestamp"> & { id?: string; timestamp?: Date }) {
    const id = notification.id || `err-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = notification.timestamp || new Date();

    // Prevent identical duplicated banners
    const existing = notifications.find(
      (n) => n.title === notification.title && n.message === notification.message
    );
    if (existing) {
      return existing.id;
    }

    const item: AppNotification = {
      ...notification,
      id,
      timestamp,
    };

    notifications = [item, ...notifications.slice(0, 4)]; // Keep at most 5 active errors
    notifyListeners();
    return id;
  },

  dismiss(id: string) {
    notifications = notifications.filter((n) => n.id !== id);
    notifyListeners();
  },

  clear() {
    notifications = [];
    notifyListeners();
  },
};

/**
 * React hook to access active error notifications.
 */
export function useNotifications() {
  return useSyncExternalStore(notificationStore.subscribe, notificationStore.getNotifications);
}

/**
 * Formats and reports an API error to the notification store.
 * Automatically checks for RBAC 403 Forbidden status, especially when querying at cluster scope ("all").
 */
export function reportApiError(
  err: any,
  contextResource: string,
  namespace?: string
): string {
  const errMsg = typeof err === "string" ? err : err?.message || JSON.stringify(err || {});
  const errCode = err?.code || "";
  const errDetails = err?.details || "";

  const isForbidden =
    errCode === "FORBIDDEN" ||
    /forbidden|403|unauthorized|rbac|access denied/i.test(errMsg) ||
    /forbidden|403|unauthorized|rbac|access denied/i.test(errDetails);

  const isClusterScope = !namespace || namespace === "all" || namespace === "*" || namespace === "";

  let title = "Kubernetes API Error";
  let message = errMsg || `Failed to process ${contextResource}.`;

  if (isForbidden && isClusterScope) {
    title = "Cluster-Scope Access Restricted";
    message = `Unable to list ${contextResource} at cluster scope (Access Forbidden). Select an individual namespace.`;
  } else if (isForbidden) {
    title = "Access Forbidden (RBAC)";
    message = `Permission denied listing ${contextResource} in namespace "${namespace}".`;
  }

  return notificationStore.addError({
    title,
    message,
    details: errDetails && errDetails !== errMsg ? errDetails : errMsg !== message ? errMsg : undefined,
    isForbidden,
  });
}
