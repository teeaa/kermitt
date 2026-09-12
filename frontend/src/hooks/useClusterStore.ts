import { useSyncExternalStore, useEffect } from "react";
import { ipc } from "../../wailsjs/go/models";
import { kubeApi } from "../services/kubeApi";

export interface ClusterState {
  contexts: ipc.KubeContext[];
  activeContext: string;
  namespaces: ipc.Namespace[];
  activeNamespace: string;
  clusterOverview: ipc.ClusterOverview | null;
  clusterHealthInfo: ipc.ClusterHealthInfo | null;
  isContextsLoading: boolean;
  isNamespacesLoading: boolean;
  loadingContext: boolean;
  errorMessage: string | null;
}

let state: ClusterState = {
  contexts: [],
  activeContext: "",
  namespaces: [],
  activeNamespace: "default",
  clusterOverview: null,
  clusterHealthInfo: null,
  isContextsLoading: true,
  isNamespacesLoading: true,
  loadingContext: false,
  errorMessage: null,
};

const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function updateState(updater: (prev: ClusterState) => ClusterState) {
  state = updater(state);
  emitChange();
}

export const clusterStore = {
  getState(): ClusterState {
    return state;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  setInitialBootstrap(activeContext: string, activeNamespace: string) {
    updateState((prev) => ({
      ...prev,
      activeContext: activeContext || prev.activeContext,
      activeNamespace: activeNamespace || prev.activeNamespace,
      // We don't mark isContextsLoading false until k8s:contexts:ready fires or getContexts completes
    }));
  },

  setContexts(contexts: ipc.KubeContext[]) {
    updateState((prev) => {
      const active = contexts.find((c) => c.isActive) || contexts.find((c) => c.name === prev.activeContext) || contexts[0];
      return {
        ...prev,
        contexts,
        activeContext: prev.activeContext || (active ? active.name : ""),
        isContextsLoading: false,
      };
    });
  },

  setNamespaces(rawNamespaces: (string | ipc.Namespace)[]) {
    const formatted: ipc.Namespace[] = rawNamespaces.map((ns) => {
      if (typeof ns === "string") {
        return new ipc.Namespace({
          name: ns,
          status: "Active",
          age: "-",
          createdAt: new Date(),
        });
      }
      return ns;
    });

    updateState((prev) => ({
      ...prev,
      namespaces: formatted,
      isNamespacesLoading: false,
    }));
  },

  setActiveContext(contextName: string) {
    updateState((prev) => ({
      ...prev,
      activeContext: contextName,
      isNamespacesLoading: true,
    }));
  },

  setActiveNamespace(namespace: string) {
    updateState((prev) => ({
      ...prev,
      activeNamespace: namespace,
    }));
  },

  setClusterOverview(overview: ipc.ClusterOverview | null) {
    updateState((prev) => ({
      ...prev,
      clusterOverview: overview,
    }));
  },

  setClusterHealthInfo(healthInfo: ipc.ClusterHealthInfo | null) {
    updateState((prev) => ({
      ...prev,
      clusterHealthInfo: healthInfo,
    }));
  },

  setLoadingContext(loading: boolean) {
    updateState((prev) => ({
      ...prev,
      loadingContext: loading,
    }));
  },

  setErrorMessage(msg: string | null) {
    updateState((prev) => ({
      ...prev,
      errorMessage: msg,
    }));
  },

  async switchContext(contextName: string) {
    if (contextName === state.activeContext) return;
    updateState((prev) => ({
      ...prev,
      loadingContext: true,
      errorMessage: null,
      isNamespacesLoading: true,
    }));

    try {
      await kubeApi.switchContext(contextName);
      updateState((prev) => ({
        ...prev,
        activeContext: contextName,
        contexts: prev.contexts.map((c) => ({
          ...c,
          isActive: c.name === contextName,
        })),
        loadingContext: false,
      }));
    } catch (err: any) {
      updateState((prev) => ({
        ...prev,
        loadingContext: false,
        errorMessage: err?.message || `Failed to switch to context ${contextName}`,
      }));
      throw err;
    }
  },

  async selectNamespace(namespace: string) {
    updateState((prev) => ({
      ...prev,
      activeNamespace: namespace,
    }));
    try {
      await kubeApi.setNamespace(namespace);
    } catch (err) {
      console.warn("[CLUSTER-STORE] Failed to sync namespace with backend:", err);
    }
  },
};

export function useClusterStore(): ClusterState & {
  switchContext: (name: string) => Promise<void>;
  selectNamespace: (ns: string) => Promise<void>;
  setInitialBootstrap: (activeContext: string, activeNamespace: string) => void;
  setContexts: (contexts: ipc.KubeContext[]) => void;
  setNamespaces: (namespaces: (string | ipc.Namespace)[]) => void;
  setClusterOverview: (overview: ipc.ClusterOverview | null) => void;
  setClusterHealthInfo: (healthInfo: ipc.ClusterHealthInfo | null) => void;
  setErrorMessage: (msg: string | null) => void;
} {
  const current = useSyncExternalStore(clusterStore.subscribe, clusterStore.getState);

  return {
    ...current,
    switchContext: clusterStore.switchContext,
    selectNamespace: clusterStore.selectNamespace,
    setInitialBootstrap: clusterStore.setInitialBootstrap,
    setContexts: clusterStore.setContexts,
    setNamespaces: clusterStore.setNamespaces,
    setClusterOverview: clusterStore.setClusterOverview,
    setClusterHealthInfo: clusterStore.setClusterHealthInfo,
    setErrorMessage: clusterStore.setErrorMessage,
  };
}
