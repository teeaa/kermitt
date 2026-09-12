import * as KubeBridge from "../../wailsjs/go/ipc/KubeBridge";
import { ipc } from "../../wailsjs/go/models";
import { EventsOn } from "../../wailsjs/runtime/runtime";

export interface LogPayload {
  streamId: string;
  timestamp?: string;
  line: string;
  podName?: string;
  containerName: string;
  isStderr: boolean;
}

export interface ResourceChangeEvent {
  resourceType: string;
  action: "add" | "update" | "delete";
  name: string;
  namespace: string;
  phase?: string;
}

// Helper to resolve active Wails IPC bridge
const getBridge = () => {
  if (typeof window !== "undefined") {
    const go = (window as any).go?.ipc;
    if (go?.KubeBridge) return KubeBridge;
  }
  return null;
};

// Helper to detect if running within the Wails desktop WebView environment
const isWailsEnvironment = (): boolean => {
  return getBridge() !== null;
};

// ============================================================================
// Service API Layer (Live Backend IPC)
// ============================================================================

export const kubeApi = {
  /**
   * Fast-path startup: returns active context, active namespace, and active pods immediately (<300ms)
   * while triggering asynchronous background Phase 2 warm-up.
   */
  getInitialState: async (): Promise<ipc.InitialBootstrapState> => {
    console.debug("[IPC-REQ] Calling GetInitialState");
    try {
      const bridge = getBridge();
      if (!bridge || typeof (bridge as any).GetInitialState !== "function") {
        console.debug("[IPC] Non-Wails environment or GetInitialState missing; returning fallback");
        return new ipc.InitialBootstrapState({
          activeContext: "",
          activeNamespace: "default",
          pods: [],
        });
      }
      const res = await (bridge as any).GetInitialState();
      console.debug("[IPC-RESP] GetInitialState received:", res);
      return res;
    } catch (err) {
      console.error("[IPC-ERR] GetInitialState call failed:", err);
      throw err;
    }
  },

  /**
   * Fetches all available Kubernetes contexts from kubeconfig
   */
  getContexts: async (): Promise<ipc.KubeContext[]> => {
    console.debug("[IPC-REQ] Calling GetContexts");
    try {
      const bridge = getBridge();
      if (!bridge) {
        console.debug("[IPC] Non-Wails environment; returning empty contexts");
        return [];
      }
      const res = await bridge.GetContexts();
      const safeContexts = Array.isArray(res) ? res : [];
      console.debug("[IPC-RESP] GetContexts received:", safeContexts);
      return safeContexts;
    } catch (err) {
      console.error("[IPC-ERR] GetContexts call failed:", err);
      throw err;
    }
  },

  /**
   * Switches the active Kubernetes context
   */
  switchContext: async (contextName: string): Promise<void> => {
    console.debug("[IPC-REQ] Calling SwitchContext:", { contextName });
    try {
      const bridge = getBridge();
      if (bridge) {
        await bridge.SwitchContext(contextName);
      }
      console.debug("[IPC-RESP] SwitchContext succeeded for:", contextName);
    } catch (err) {
      console.error("[IPC-ERR] SwitchContext call failed:", err);
      throw err;
    }
  },

  /**
   * Sets the active namespace in session memory and triggers cluster refresh
   */
  setNamespace: async (namespace: string): Promise<void> => {
    console.debug("[IPC-REQ] Calling SetNamespace:", { namespace });
    try {
      const bridge = getBridge();
      if (bridge && (bridge as any).SetNamespace) {
        await (bridge as any).SetNamespace(namespace);
      }
      console.debug("[IPC-RESP] SetNamespace succeeded for:", namespace);
    } catch (err) {
      console.error("[IPC-ERR] SetNamespace call failed:", err);
      throw err;
    }
  },

  /**
   * Retrieves all namespaces for the active cluster
   */
  getNamespaces: async (): Promise<ipc.Namespace[]> => {
    console.debug("[IPC-REQ] Calling GetNamespaces");
    try {
      const bridge = getBridge();
      if (!bridge) {
        console.debug("[IPC] Non-Wails environment; returning empty namespaces");
        return [];
      }
      const res = await bridge.GetNamespaces();
      const safeNamespaces = Array.isArray(res) ? res : [];
      console.debug("[IPC-RESP] GetNamespaces received:", safeNamespaces);
      return safeNamespaces;
    } catch (err) {
      console.error("[IPC-ERR] GetNamespaces call failed:", err);
      throw err;
    }
  },

  /**
   * Retrieves all pods (filtered by namespace if specified, or all namespaces if empty)
   */
  getPods: async (namespace: string): Promise<ipc.PodSummary[]> => {
    console.debug("[IPC-REQ] Calling GetPods:", { namespace });
    try {
      const bridge = getBridge();
      if (!bridge) {
        console.debug("[IPC] Non-Wails environment; returning empty pods");
        return [];
      }
      const res = await bridge.GetPods(namespace);
      const safePods = Array.isArray(res) ? res : [];
      console.debug("[IPC-RESP] GetPods received:", safePods);
      return safePods;
    } catch (err) {
      console.error("[IPC-ERR] GetPods call failed:", err);
      throw err;
    }
  },

  /**
   * Retrieves all deployments (filtered by namespace if specified, or all namespaces if empty)
   */
  getDeployments: async (namespace: string): Promise<ipc.DeploymentSummary[]> => {
    console.debug("[IPC-REQ] Calling GetDeployments:", { namespace });
    try {
      const bridge = getBridge();
      if (!bridge) {
        console.debug("[IPC] Non-Wails environment; returning empty deployments");
        return [];
      }
      const res = await bridge.GetDeployments(namespace);
      const safeDeployments = Array.isArray(res) ? res : [];
      console.debug("[IPC-RESP] GetDeployments received:", safeDeployments);
      return safeDeployments;
    } catch (err) {
      console.error("[IPC-ERR] GetDeployments call failed:", err);
      throw err;
    }
  },

  /**
   * Retrieves all statefulsets (filtered by namespace if specified, or all namespaces if empty)
   */
  getStatefulSets: async (namespace: string): Promise<ipc.StatefulSetSummary[]> => {
    console.debug("[IPC-REQ] Calling GetStatefulSets:", { namespace });
    try {
      const bridge = getBridge();
      if (!bridge) {
        console.debug("[IPC] Non-Wails environment; returning empty statefulsets");
        return [];
      }
      const res = await bridge.GetStatefulSets(namespace);
      const safeStatefulSets = Array.isArray(res) ? res : [];
      console.debug("[IPC-RESP] GetStatefulSets received:", safeStatefulSets);
      return safeStatefulSets;
    } catch (err) {
      console.error("[IPC-ERR] GetStatefulSets call failed:", err);
      throw err;
    }
  },

  /**
   * Retrieves all jobs (filtered by namespace if specified, or all namespaces if empty)
   */
  getJobs: async (namespace: string): Promise<ipc.JobSummary[]> => {
    console.debug("[IPC-REQ] Calling GetJobs:", { namespace });
    try {
      const bridge = getBridge();
      if (!bridge) {
        console.debug("[IPC] Non-Wails environment; returning empty jobs");
        return [];
      }
      const res = await bridge.GetJobs(namespace);
      const safeJobs = Array.isArray(res) ? res : [];
      console.debug("[IPC-RESP] GetJobs received:", safeJobs);
      return safeJobs;
    } catch (err) {
      console.error("[IPC-ERR] GetJobs call failed:", err);
      throw err;
    }
  },

  /**
   * Retrieves all cronjobs (filtered by namespace if specified, or all namespaces if empty)
   */
  getCronJobs: async (namespace: string): Promise<ipc.CronJobSummary[]> => {
    console.debug("[IPC-REQ] Calling GetCronJobs:", { namespace });
    try {
      const bridge = getBridge();
      if (!bridge) {
        console.debug("[IPC] Non-Wails environment; returning empty cronjobs");
        return [];
      }
      const res = await bridge.GetCronJobs(namespace);
      const safeCronJobs = Array.isArray(res) ? res : [];
      console.debug("[IPC-RESP] GetCronJobs received:", safeCronJobs);
      return safeCronJobs;
    } catch (err) {
      console.error("[IPC-ERR] GetCronJobs call failed:", err);
      throw err;
    }
  },

  /**
   * Triggers an immediate manual run of a CronJob
   */
  triggerCronJob: async (
    namespace: string,
    cronJobName: string
  ): Promise<ipc.JobSummary | null> => {
    console.debug("[IPC-REQ] Calling TriggerCronJob:", { namespace, cronJobName });
    try {
      const bridge = getBridge();
      if (!bridge) {
        return null;
      }
      const res = await bridge.TriggerCronJob(namespace, cronJobName);
      console.debug("[IPC-RESP] TriggerCronJob received:", res);
      return res;
    } catch (err) {
      console.error("[IPC-ERR] TriggerCronJob call failed:", err);
      throw err;
    }
  },

  /**
   * Clones and reruns an existing Job
   */
  rerunJob: async (
    namespace: string,
    jobName: string
  ): Promise<ipc.JobSummary | null> => {
    console.debug("[IPC-REQ] Calling RerunJob:", { namespace, jobName });
    try {
      const bridge = getBridge();
      if (!bridge) {
        return null;
      }
      const res = await bridge.RerunJob(namespace, jobName);
      console.debug("[IPC-RESP] RerunJob received:", res);
      return res;
    } catch (err) {
      console.error("[IPC-ERR] RerunJob call failed:", err);
      throw err;
    }
  },

  /**
   * Retrieves detailed container state for a pod
   */
  getContainerDetails: async (
    namespace: string,
    podName: string
  ): Promise<ipc.ContainerDetail[]> => {
    console.debug("[IPC-REQ] Calling GetContainerDetails:", { namespace, podName });
    try {
      const bridge = getBridge();
      if (!bridge) {
        return [];
      }
      const res = await bridge.GetContainerDetails(namespace, podName);
      const safeDetails = Array.isArray(res) ? res : [];
      console.debug("[IPC-RESP] GetContainerDetails received:", safeDetails);
      return safeDetails;
    } catch (err) {
      console.error("[IPC-ERR] GetContainerDetails call failed:", err);
      throw err;
    }
  },

  /**
   * Initiates a live log stream session
   */
  startLogStream: async (
    req: ipc.LogStreamRequest,
    _onLogLine?: (line: LogPayload) => void
  ): Promise<string> => {
    console.debug("[IPC-REQ] Calling StartLogStream:", {
      namespace: req.namespace,
      podName: req.podName,
      containerName: req.containerName,
      follow: req.follow,
    });
    try {
      const bridge = getBridge();
      if (!bridge) {
        console.debug("[IPC] Non-Wails environment; cannot stream logs");
        return "";
      }
      const streamId = await bridge.StartLogStream(req);
      console.debug("[IPC-RESP] StartLogStream session started:", { streamId });
      return streamId;
    } catch (err) {
      console.error("[IPC-ERR] StartLogStream failed:", err);
      throw err;
    }
  },

  /**
   * Stops an active log stream session.
   * It is idempotent: stopping an already-concluded or non-existent stream succeeds silently.
   */
  stopLogStream: async (streamId: string): Promise<void> => {
    console.debug("[IPC-REQ] Calling StopLogStream:", { streamId });
    try {
      const bridge = getBridge();
      if (bridge) {
        await bridge.StopLogStream(streamId);
      }
      console.debug("[IPC-RESP] StopLogStream terminated session:", { streamId });
    } catch (err) {
      console.debug("[IPC-DEBUG] StopLogStream called on inactive or concluded session:", { streamId, err });
    }
  },

  /**
   * Subscribes to a specific log stream by stream ID
   */
  subscribeToStream: (
    streamId: string,
    onLine: (payload: LogPayload) => void,
    onEnd?: (reason: string) => void,
    onError?: (err: any) => void
  ): (() => void) => {
    if (isWailsEnvironment()) {
      const eventName = `k8s:log:${streamId}`;
      const endEventName = `k8s:log:end:${streamId}`;
      const errorEventName = `k8s:log:error:${streamId}`;

      const unsubs: (() => void)[] = [];
      unsubs.push(EventsOn(eventName, (data: any) => {
        onLine(data as LogPayload);
      }));

      if (onEnd) {
        unsubs.push(EventsOn(endEventName, (data: any) => {
          onEnd(data?.reason || "ended");
        }));
      }

      if (onError) {
        unsubs.push(EventsOn(errorEventName, (data: any) => {
          onError(data);
        }));
      }

      return () => {
        unsubs.forEach(unsub => unsub());
      };
    }
    return () => {};
  },

  /**
   * Subscribes to global log stream events emitted by the backend
   */
  subscribeToLogs: (callback: (payload: LogPayload) => void): (() => void) => {
    if (isWailsEnvironment()) {
      return EventsOn("k8s:log:data", (data: any) => {
        callback(data as LogPayload);
      });
    }
    return () => {};
  },

  /**
   * Subscribes to real-time cluster state refresh signals (debounced informers)
   */
  subscribeToClusterRefresh: (callback: () => void): (() => void) => {
    if (isWailsEnvironment()) {
      return EventsOn("k8s:cluster:refresh", () => {
        callback();
      });
    }
    return () => {};
  },

  /**
   * Subscribes to individual resource lifecycle events (add, update, delete)
   */
  subscribeToResourceChanges: (
    callback: (event: ResourceChangeEvent) => void
  ): (() => void) => {
    if (isWailsEnvironment()) {
      return EventsOn("k8s:resource:changed", (data: any) => {
        callback(data as ResourceChangeEvent);
      });
    }
    return () => {};
  },

  /**
   * Deletes a pod (optionally with grace period 0 for force termination)
   */
  deletePod: async (
    namespace: string,
    podName: string,
    gracePeriodSeconds?: number
  ): Promise<void> => {
    console.debug("[IPC-REQ] Calling DeletePod:", { namespace, podName, gracePeriodSeconds });
    try {
      const bridge = getBridge();
      if (bridge) {
        await bridge.DeletePod(namespace, podName, gracePeriodSeconds ?? null);
      }
      console.debug("[IPC-RESP] DeletePod succeeded for:", { namespace, podName });
    } catch (err) {
      console.error("[IPC-ERR] DeletePod call failed:", err);
      throw err;
    }
  },

  /**
   * Restarts a pod via standard deletion prompting controller recreation
   */
  restartPod: async (namespace: string, podName: string): Promise<void> => {
    console.debug("[IPC-REQ] Calling RestartPod:", { namespace, podName });
    try {
      const bridge = getBridge();
      if (bridge) {
        await bridge.RestartPod(namespace, podName);
      }
      console.debug("[IPC-RESP] RestartPod succeeded for:", { namespace, podName });
    } catch (err) {
      console.error("[IPC-ERR] RestartPod call failed:", err);
      throw err;
    }
  },

  /**
   * Finds the latest created pod for a batch/v1 Job
   */
  getJobLatestPod: async (namespace: string, jobName: string): Promise<ipc.PodSummary | null> => {
    console.debug("[IPC-REQ] Calling GetJobLatestPod:", { namespace, jobName });
    try {
      const bridge = getBridge();
      if (!bridge) {
        return null;
      }
      const res = await bridge.GetJobLatestPod(namespace, jobName);
      console.debug("[IPC-RESP] GetJobLatestPod received:", res);
      return res;
    } catch (err) {
      console.error("[IPC-ERR] GetJobLatestPod call failed:", err);
      throw err;
    }
  },

  /**
   * Retrieves active matching pods for a workload controller (Deployment, StatefulSet, DaemonSet, Job, or Pod)
   */
  getControllerPods: async (
    namespace: string,
    kind: string,
    name: string
  ): Promise<ipc.PodSummary[]> => {
    console.debug("[IPC-REQ] Calling GetControllerPods:", { namespace, kind, name });
    try {
      const bridge = getBridge();
      if (!bridge) {
        return [];
      }
      const res = await bridge.GetControllerPods(namespace, kind, name);
      const safePods = Array.isArray(res) ? res : [];
      console.debug("[IPC-RESP] GetControllerPods received:", safePods);
      return safePods;
    } catch (err) {
      console.error("[IPC-ERR] GetControllerPods call failed:", err);
      throw err;
    }
  },


  /**
   * Retrieves high-level cluster metrics
   */
  getClusterOverview: async (): Promise<ipc.ClusterOverview> => {
    console.debug("[IPC-REQ] Calling GetClusterOverview");
    try {
      const bridge = getBridge();
      if (!bridge) {
        return new ipc.ClusterOverview({
          contextName: "",
          nodeCount: 0,
          namespaceCount: 0,
          podCount: 0,
          runningPods: 0,
          pendingPods: 0,
          failedPods: 0,
        });
      }
      const res = await bridge.GetClusterOverview();
      console.debug("[IPC-RESP] GetClusterOverview received:", res);
      return res;
    } catch (err) {
      console.error("[IPC-ERR] GetClusterOverview failed:", err);
      throw err;
    }
  },

  /**
   * Retrieves live cluster connectivity, latency, endpoint URL, and server version
   */
  getClusterHealthInfo: async (): Promise<ipc.ClusterHealthInfo> => {
    console.debug("[IPC-REQ] Calling GetClusterHealthInfo");
    try {
      const bridge = getBridge();
      if (!bridge) {
        return new ipc.ClusterHealthInfo({
          endpoint: "",
          serverVersion: "",
          latencyMs: 0,
          authIdentity: "",
          status: "disconnected",
        });
      }
      const res = await bridge.GetClusterHealthInfo();
      console.debug("[IPC-RESP] GetClusterHealthInfo received:", res);
      return res;
    } catch (err) {
      console.error("[IPC-ERR] GetClusterHealthInfo failed:", err);
      return new ipc.ClusterHealthInfo({
        endpoint: "",
        serverVersion: "",
        latencyMs: 0,
        authIdentity: "",
        status: "disconnected",
        error: (err as any)?.message || "Failed to query health info",
      });
    }
  },

  /**
   * Retrieves all log lines currently stored in the Go backend application buffer.
   */
  getApplicationLogs: async (): Promise<string[]> => {
    console.debug("[IPC-REQ] Calling GetApplicationLogs");
    try {
      const bridge = getBridge();
      if (bridge && typeof bridge.GetApplicationLogs === "function") {
        const res = await bridge.GetApplicationLogs();
        return Array.isArray(res) ? res : [];
      }
      return [];
    } catch (err) {
      console.error("[IPC-ERR] GetApplicationLogs failed:", err);
      return [];
    }
  },

  /**
   * Clears the Go backend application buffer.
   */
  clearApplicationLogs: async (): Promise<void> => {
    console.debug("[IPC-REQ] Calling ClearApplicationLogs");
    try {
      const bridge = getBridge();
      if (bridge && typeof bridge.ClearApplicationLogs === "function") {
        await bridge.ClearApplicationLogs();
      }
    } catch (err) {
      console.error("[IPC-ERR] ClearApplicationLogs failed:", err);
    }
  },

  /**
   * Retrieves all cluster nodes
   */
  getNodes: async (): Promise<ipc.NodeSummary[]> => {
    console.debug("[IPC-REQ] Calling GetNodes");
    try {
      const bridge = getBridge();
      if (!bridge) return [];
      const res = await bridge.GetNodes();
      return Array.isArray(res) ? res : [];
    } catch (err) {
      console.error("[IPC-ERR] GetNodes failed:", err);
      throw err;
    }
  },

  /**
   * Retrieves services for namespace (or all)
   */
  getServices: async (namespace: string): Promise<ipc.ServiceSummary[]> => {
    console.debug("[IPC-REQ] Calling GetServices:", { namespace });
    try {
      const bridge = getBridge();
      if (!bridge) return [];
      const res = await bridge.GetServices(namespace);
      return Array.isArray(res) ? res : [];
    } catch (err) {
      console.error("[IPC-ERR] GetServices failed:", err);
      throw err;
    }
  },

  /**
   * Retrieves ingresses for namespace (or all)
   */
  getIngresses: async (namespace: string): Promise<ipc.IngressSummary[]> => {
    console.debug("[IPC-REQ] Calling GetIngresses:", { namespace });
    try {
      const bridge = getBridge();
      if (!bridge) return [];
      const res = await bridge.GetIngresses(namespace);
      return Array.isArray(res) ? res : [];
    } catch (err) {
      console.error("[IPC-ERR] GetIngresses failed:", err);
      throw err;
    }
  },

  /**
   * Retrieves configmaps for namespace (or all)
   */
  getConfigMaps: async (namespace: string): Promise<ipc.ConfigMapSummary[]> => {
    console.debug("[IPC-REQ] Calling GetConfigMaps:", { namespace });
    try {
      const bridge = getBridge();
      if (!bridge) return [];
      const res = await bridge.GetConfigMaps(namespace);
      return Array.isArray(res) ? res : [];
    } catch (err) {
      console.error("[IPC-ERR] GetConfigMaps failed:", err);
      throw err;
    }
  },

  /**
   * Retrieves secrets for namespace (or all)
   */
  getSecrets: async (namespace: string): Promise<ipc.SecretSummary[]> => {
    console.debug("[IPC-REQ] Calling GetSecrets:", { namespace });
    try {
      const bridge = getBridge();
      if (!bridge) return [];
      const res = await bridge.GetSecrets(namespace);
      return Array.isArray(res) ? res : [];
    } catch (err) {
      console.error("[IPC-ERR] GetSecrets failed:", err);
      throw err;
    }
  },

  /**
   * Retrieves dynamic item counts for cluster & config resources
   */
  getClusterConfigCounts: async (
    namespace: string
  ): Promise<ipc.ClusterConfigCounts> => {
    try {
      const bridge = getBridge();
      if (!bridge) {
        return {
          nodeCount: 0,
          serviceCount: 0,
          ingressCount: 0,
          configMapCount: 0,
          secretCount: 0,
        } as ipc.ClusterConfigCounts;
      }
      return await bridge.GetClusterConfigCounts(namespace);
    } catch (err) {
      console.error("[IPC-ERR] GetClusterConfigCounts failed:", err);
      return {
        nodeCount: 0,
        serviceCount: 0,
        ingressCount: 0,
        configMapCount: 0,
        secretCount: 0,
      } as ipc.ClusterConfigCounts;
    }
  },

  /**
   * Retrieves authentic live YAML manifest for any supported resource
   */
  getResourceYAML: async (
    kind: string,
    namespace: string,
    name: string
  ): Promise<string> => {
    console.debug("[IPC-REQ] Calling GetResourceYAML:", { kind, namespace, name });
    try {
      const bridge = getBridge();
      if (!bridge) return "";
      return await bridge.GetResourceYAML(kind, namespace, name);
    } catch (err) {
      console.error("[IPC-ERR] GetResourceYAML failed:", err);
      throw err;
    }
  },

  /**
   * Retrieves all key-value entries for a configmap
   */
  getConfigMapData: async (
    namespace: string,
    name: string
  ): Promise<Record<string, string>> => {
    console.debug("[IPC-REQ] Calling GetConfigMapData:", { namespace, name });
    try {
      const bridge = getBridge();
      if (!bridge) return {};
      const res = await bridge.GetConfigMapData(namespace, name);
      return res || {};
    } catch (err) {
      console.error("[IPC-ERR] GetConfigMapData failed:", err);
      throw err;
    }
  },

  /**
   * Retrieves all decoded key-value entries for a secret
   */
  getSecretData: async (
    namespace: string,
    name: string
  ): Promise<Record<string, string>> => {
    console.debug("[IPC-REQ] Calling GetSecretData:", { namespace, name });
    try {
      const bridge = getBridge();
      if (!bridge) return {};
      const res = await bridge.GetSecretData(namespace, name);
      return res || {};
    } catch (err) {
      console.error("[IPC-ERR] GetSecretData failed:", err);
      throw err;
    }
  },

  /**
   * Deletes a configmap by name
   */
  deleteConfigMap: async (namespace: string, name: string): Promise<void> => {
    console.debug("[IPC-REQ] Calling DeleteConfigMap:", { namespace, name });
    try {
      const bridge = getBridge();
      if (bridge) {
        await bridge.DeleteConfigMap(namespace, name);
      }
    } catch (err) {
      console.error("[IPC-ERR] DeleteConfigMap failed:", err);
      throw err;
    }
  },

  /**
   * Deletes a secret by name
   */
  deleteSecret: async (namespace: string, name: string): Promise<void> => {
    console.debug("[IPC-REQ] Calling DeleteSecret:", { namespace, name });
    try {
      const bridge = getBridge();
      if (bridge) {
        await bridge.DeleteSecret(namespace, name);
      }
    } catch (err) {
      console.error("[IPC-ERR] DeleteSecret failed:", err);
      throw err;
    }
  },

  /**
   * Starts an interactive PTY exec session for a pod container
   */
  startPodExec: async (req: {
    namespace: string;
    podName: string;
    containerName?: string;
    command?: string;
    cols?: number;
    rows?: number;
  }): Promise<string> => {
    console.debug("[IPC-REQ] Calling StartPodExec:", req);
    try {
      const bridge = getBridge();
      if (!bridge || typeof (bridge as any).StartPodExec !== "function") {
        console.debug("[IPC] Non-Wails environment or StartPodExec unavailable; returning mock session");
        return `mock-exec-${Date.now()}`;
      }
      const execReq = new ipc.ExecRequest({
        namespace: req.namespace,
        podName: req.podName,
        containerName: req.containerName || "",
        command: req.command || "",
        cols: req.cols || 80,
        rows: req.rows || 24,
      });
      const sessionId = await (bridge as any).StartPodExec(execReq);
      console.debug("[IPC-RESP] StartPodExec session started:", sessionId);
      return sessionId;
    } catch (err) {
      console.error("[IPC-ERR] StartPodExec failed:", err);
      throw err;
    }
  },

  /**
   * Writes raw keystrokes or input text to the remote stdin stream
   */
  execWrite: async (sessionId: string, data: string): Promise<void> => {
    try {
      const bridge = getBridge();
      if (bridge && typeof (bridge as any).ExecWrite === "function") {
        await (bridge as any).ExecWrite(sessionId, data);
      }
    } catch (err) {
      console.error("[IPC-ERR] ExecWrite failed:", err);
      throw err;
    }
  },

  /**
   * Pushes new PTY window dimensions (cols x rows) to client-go SPDY stream
   */
  execResize: async (sessionId: string, cols: number, rows: number): Promise<void> => {
    try {
      const bridge = getBridge();
      if (bridge && typeof (bridge as any).ExecResize === "function") {
        await (bridge as any).ExecResize(sessionId, cols, rows);
      }
    } catch (err) {
      console.error("[IPC-ERR] ExecResize failed:", err);
      throw err;
    }
  },

  /**
   * Closes an active pod exec session
   */
  stopPodExec: async (sessionId: string): Promise<void> => {
    try {
      const bridge = getBridge();
      if (bridge && typeof (bridge as any).StopPodExec === "function") {
        await (bridge as any).StopPodExec(sessionId);
      }
    } catch (err) {
      console.error("[IPC-ERR] StopPodExec failed:", err);
    }
  },

  /**
   * Subscribes to live stdout and exit events for an exec session
   */
  subscribeToExec: (
    sessionId: string,
    onStdout: (chunk: string) => void,
    onExit?: (exitPayload: { sessionId: string; exitCode: number; error?: string }) => void
  ): (() => void) => {
    if (isWailsEnvironment()) {
      const stdoutEvent = `k8s:exec:stdout:${sessionId}`;
      const exitEvent = `k8s:exec:exit:${sessionId}`;

      const unsubs: (() => void)[] = [];
      unsubs.push(EventsOn(stdoutEvent, (data: any) => {
        onStdout(typeof data === "string" ? data : String(data || ""));
      }));

      if (onExit) {
        unsubs.push(EventsOn(exitEvent, (data: any) => {
          onExit(data);
        }));
      }

      return () => {
        unsubs.forEach(unsub => unsub());
      };
    }
    return () => {};
  },

  /**
   * Subscribes to Phase 2 background warm-up contexts ready event
   */
  subscribeToContextsReady: (
    callback: (contexts: ipc.KubeContext[]) => void
  ): (() => void) => {
    if (isWailsEnvironment()) {
      return EventsOn("k8s:contexts:ready", (data: any) => {
        console.debug("[EVENT] k8s:contexts:ready received:", data);
        callback(Array.isArray(data) ? data : []);
      });
    }
    return () => {};
  },

  /**
   * Subscribes to Phase 2 background warm-up namespaces ready event
   */
  subscribeToNamespacesReady: (
    callback: (namespaces: string[]) => void
  ): (() => void) => {
    if (isWailsEnvironment()) {
      return EventsOn("k8s:namespaces:ready", (data: any) => {
        console.debug("[EVENT] k8s:namespaces:ready received:", data);
        callback(Array.isArray(data) ? data : []);
      });
    }
    return () => {};
  },

  /**
   * Subscribes to Phase 2 background warm-up sidebar counts updated event
   */
  subscribeToSidebarCounts: (
    callback: (counts: Record<string, number>) => void
  ): (() => void) => {
    if (isWailsEnvironment()) {
      return EventsOn("k8s:sidebar-counts:updated", (data: any) => {
        console.debug("[EVENT] k8s:sidebar-counts:updated received:", data);
        callback(typeof data === "object" && data !== null ? data : {});
      });
    }
    return () => {};
  },
};

