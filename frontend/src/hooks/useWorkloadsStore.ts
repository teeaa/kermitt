import { useSyncExternalStore } from "react";
import { ipc } from "../../wailsjs/go/models";

export interface WorkloadsState {
  pods: ipc.PodSummary[];
  loadingPods: boolean;

  // Auxiliary workloads cache keyed by namespace (e.g. "default", "kube-system", or "all")
  deploymentsCache: Record<string, ipc.DeploymentSummary[]>;
  statefulSetsCache: Record<string, ipc.StatefulSetSummary[]>;
  jobsCache: Record<string, ipc.JobSummary[]>;
  cronJobsCache: Record<string, ipc.CronJobSummary[]>;
  nodesCache: ipc.NodeSummary[];
  servicesCache: Record<string, ipc.ServiceSummary[]>;
  ingressesCache: Record<string, ipc.IngressSummary[]>;

  // Dynamic badge counts
  counts: {
    podCount: number;
    deploymentCount: number;
    statefulSetCount: number;
    jobCount: number;
    cronJobCount: number;
    nodeCount: number;
    servicesIngressCount: number;
    configMapsSecretsCount: number;
  };
}

let state: WorkloadsState = {
  pods: [],
  loadingPods: false,
  deploymentsCache: {},
  statefulSetsCache: {},
  jobsCache: {},
  cronJobsCache: {},
  nodesCache: [],
  servicesCache: {},
  ingressesCache: {},
  counts: {
    podCount: 0,
    deploymentCount: 0,
    statefulSetCount: 0,
    jobCount: 0,
    cronJobCount: 0,
    nodeCount: 0,
    servicesIngressCount: 0,
    configMapsSecretsCount: 0,
  },
};

const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function updateState(updater: (prev: WorkloadsState) => WorkloadsState) {
  state = updater(state);
  emitChange();
}

export const workloadsStore = {
  getState(): WorkloadsState {
    return state;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  setInitialPods(pods: ipc.PodSummary[]) {
    updateState((prev) => ({
      ...prev,
      pods,
      loadingPods: false,
      counts: {
        ...prev.counts,
        podCount: pods.length,
      },
    }));
  },

  setPods(pods: ipc.PodSummary[]) {
    updateState((prev) => ({
      ...prev,
      pods,
      loadingPods: false,
      counts: {
        ...prev.counts,
        podCount: pods.length,
      },
    }));
  },

  setLoadingPods(loading: boolean) {
    updateState((prev) => ({
      ...prev,
      loadingPods: loading,
    }));
  },

  setDeployments(namespace: string, items: ipc.DeploymentSummary[]) {
    updateState((prev) => ({
      ...prev,
      deploymentsCache: {
        ...prev.deploymentsCache,
        [namespace]: items,
      },
      counts: {
        ...prev.counts,
        deploymentCount: items.length,
      },
    }));
  },

  setStatefulSets(namespace: string, items: ipc.StatefulSetSummary[]) {
    updateState((prev) => ({
      ...prev,
      statefulSetsCache: {
        ...prev.statefulSetsCache,
        [namespace]: items,
      },
      counts: {
        ...prev.counts,
        statefulSetCount: items.length,
      },
    }));
  },

  setJobs(namespace: string, items: ipc.JobSummary[]) {
    updateState((prev) => ({
      ...prev,
      jobsCache: {
        ...prev.jobsCache,
        [namespace]: items,
      },
      counts: {
        ...prev.counts,
        jobCount: items.length,
      },
    }));
  },

  setCronJobs(namespace: string, items: ipc.CronJobSummary[]) {
    updateState((prev) => ({
      ...prev,
      cronJobsCache: {
        ...prev.cronJobsCache,
        [namespace]: items,
      },
      counts: {
        ...prev.counts,
        cronJobCount: items.length,
      },
    }));
  },

  setNodes(items: ipc.NodeSummary[]) {
    updateState((prev) => ({
      ...prev,
      nodesCache: items,
      counts: {
        ...prev.counts,
        nodeCount: items.length,
      },
    }));
  },

  setServices(namespace: string, items: ipc.ServiceSummary[]) {
    updateState((prev) => {
      const ingCount = prev.ingressesCache[namespace]?.length || 0;
      return {
        ...prev,
        servicesCache: {
          ...prev.servicesCache,
          [namespace]: items,
        },
        counts: {
          ...prev.counts,
          servicesIngressCount: items.length + ingCount,
        },
      };
    });
  },

  setIngresses(namespace: string, items: ipc.IngressSummary[]) {
    updateState((prev) => {
      const svcCount = prev.servicesCache[namespace]?.length || 0;
      return {
        ...prev,
        ingressesCache: {
          ...prev.ingressesCache,
          [namespace]: items,
        },
        counts: {
          ...prev.counts,
          servicesIngressCount: items.length + svcCount,
        },
      };
    });
  },

  updateCounts(rawCounts: Record<string, number>) {
    updateState((prev) => {
      const newCounts = { ...prev.counts };
      if (typeof rawCounts.pods === "number") newCounts.podCount = rawCounts.pods;
      if (typeof rawCounts.deployments === "number") newCounts.deploymentCount = rawCounts.deployments;
      if (typeof rawCounts.statefulsets === "number") newCounts.statefulSetCount = rawCounts.statefulsets;
      if (typeof rawCounts.jobs === "number") newCounts.jobCount = rawCounts.jobs;
      if (typeof rawCounts.cronjobs === "number") newCounts.cronJobCount = rawCounts.cronjobs;
      if (typeof rawCounts.nodes === "number") newCounts.nodeCount = rawCounts.nodes;
      if (typeof rawCounts.servicesIngress === "number") newCounts.servicesIngressCount = rawCounts.servicesIngress;
      if (typeof rawCounts.servicesIngressCount === "number") newCounts.servicesIngressCount = rawCounts.servicesIngressCount;
      if (typeof rawCounts.configMapsSecretsCount === "number") newCounts.configMapsSecretsCount = rawCounts.configMapsSecretsCount;

      return {
        ...prev,
        counts: newCounts,
      };
    });
  },

  clearCache() {
    updateState((prev) => ({
      ...prev,
      deploymentsCache: {},
      statefulSetsCache: {},
      jobsCache: {},
      cronJobsCache: {},
      nodesCache: [],
      servicesCache: {},
      ingressesCache: {},
    }));
  },
};

export function useWorkloadsStore(): WorkloadsState & {
  setInitialPods: (pods: ipc.PodSummary[]) => void;
  setPods: (pods: ipc.PodSummary[]) => void;
  setLoadingPods: (loading: boolean) => void;
  setDeployments: (ns: string, items: ipc.DeploymentSummary[]) => void;
  setStatefulSets: (ns: string, items: ipc.StatefulSetSummary[]) => void;
  setJobs: (ns: string, items: ipc.JobSummary[]) => void;
  setCronJobs: (ns: string, items: ipc.CronJobSummary[]) => void;
  setNodes: (items: ipc.NodeSummary[]) => void;
  setServices: (ns: string, items: ipc.ServiceSummary[]) => void;
  setIngresses: (ns: string, items: ipc.IngressSummary[]) => void;
  updateCounts: (rawCounts: Record<string, number>) => void;
  clearCache: () => void;
} {
  const current = useSyncExternalStore(workloadsStore.subscribe, workloadsStore.getState);

  return {
    ...current,
    setInitialPods: workloadsStore.setInitialPods,
    setPods: workloadsStore.setPods,
    setLoadingPods: workloadsStore.setLoadingPods,
    setDeployments: workloadsStore.setDeployments,
    setStatefulSets: workloadsStore.setStatefulSets,
    setJobs: workloadsStore.setJobs,
    setCronJobs: workloadsStore.setCronJobs,
    setNodes: workloadsStore.setNodes,
    setServices: workloadsStore.setServices,
    setIngresses: workloadsStore.setIngresses,
    updateCounts: workloadsStore.updateCounts,
    clearCache: workloadsStore.clearCache,
  };
}
