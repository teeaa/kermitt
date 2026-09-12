import React, { useState, useEffect } from "react";
import {
  X,
  Layers,
  Box,
  Cpu,
  Copy,
  Check,
  Tag,
  Key,
  Network,
  Activity,
  FileCode,
  AlertTriangle,
  Info,
} from "lucide-react";
import { ipc } from "../../../wailsjs/go/models";
import { kubeApi } from "../../services/kubeApi";

interface PodDetailsModalProps {
  pod: ipc.PodSummary | null;
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "containers" | "metadata" | "resources" | "events" | "yaml";
}

export const PodDetailsModal: React.FC<PodDetailsModalProps> = ({
  pod,
  isOpen,
  onClose,
  initialTab = "containers",
}) => {
  const [activeTab, setActiveTab] = useState<
    "containers" | "metadata" | "resources" | "events" | "yaml"
  >(initialTab);
  const [containers, setContainers] = useState<ipc.ContainerDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (isOpen && pod) {
      setLoading(true);
      kubeApi
        .getContainerDetails(pod.namespace, pod.name)
        .then((details) => {
          setContainers(details);
        })
        .catch((err) => {
          console.error("Failed to load container details:", err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, pod]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !pod) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const isFailed =
    pod.status === "CrashLoopBackOff" ||
    pod.status === "Failed" ||
    pod.restartCount > 0;

  const generatedYaml = `apiVersion: v1
kind: Pod
metadata:
  name: ${pod.name}
  namespace: ${pod.namespace}
  uid: 4b68e9f2-${pod.name.slice(0, 8)}-48cf-9a1b-3ef1a95b9c1d
  resourceVersion: "3948571"
  creationTimestamp: "${new Date(Date.now() - 3600000).toISOString()}"
  labels:
    app.kubernetes.io/name: ${pod.name.split("-")[0]}
    app.kubernetes.io/instance: ${pod.namespace}-primary
    pod-template-hash: "${pod.name.split("-")[1] || "75d69b9b5f"}"
spec:
  nodeName: ${pod.nodeName || "worker-pool-node-01"}
  dnsPolicy: ClusterFirst
  restartPolicy: Always
  containers:
${(containers.length > 0
  ? containers
  : pod.containers && pod.containers.length > 0
  ? pod.containers.map((name) => ({ name, image: `registry.k8s.io/${name}:v1` }))
  : [{ name: pod.name, image: `registry.k8s.io/${pod.name}:v1` }])
  .map(
    (c) => `  - name: ${c.name}
    image: ${c.image || "registry.k8s.io/" + c.name + ":v1"}
    imagePullPolicy: IfNotPresent
    ports:
    - containerPort: 8080
      name: http
      protocol: TCP
    resources:
      requests:
        cpu: 100m
        memory: 128Mi
      limits:
        cpu: 500m
        memory: 512Mi`
  )
  .join("\n")}
status:
  phase: ${pod.status}
  podIP: ${pod.ip || "10.244.1.42"}
  hostIP: 192.168.1.104
  qosClass: Burstable`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center">
              <Box className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-semibold text-slate-100 truncate font-mono">
                  {pod.name}
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-slate-800 text-slate-300 border border-slate-700">
                  {pod.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                Namespace: <span className="font-mono text-slate-300">{pod.namespace}</span> • Node:{" "}
                <span className="font-mono text-slate-300">{pod.nodeName || "Pending"}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-5 border-b border-slate-800 bg-slate-950/40 text-xs overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("containers")}
            className={`py-2.5 px-3 border-b-2 font-medium flex items-center space-x-1.5 transition-colors whitespace-nowrap ${
              activeTab === "containers"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>Containers ({containers.length || pod.totalContainers})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("metadata")}
            className={`py-2.5 px-3 border-b-2 font-medium flex items-center space-x-1.5 transition-colors whitespace-nowrap ${
              activeTab === "metadata"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Metadata & Labels</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("resources")}
            className={`py-2.5 px-3 border-b-2 font-medium flex items-center space-x-1.5 transition-colors whitespace-nowrap ${
              activeTab === "resources"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Telemetry</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("events")}
            className={`py-2.5 px-3 border-b-2 font-medium flex items-center space-x-1.5 transition-colors whitespace-nowrap ${
              activeTab === "events"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Events</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("yaml")}
            className={`py-2.5 px-3 border-b-2 font-medium flex items-center space-x-1.5 transition-colors whitespace-nowrap ${
              activeTab === "yaml"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>YAML</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs select-text font-sans">
          {activeTab === "containers" && (
            <div className="space-y-3">
              {loading ? (
                <div className="py-8 text-center text-slate-500">
                  Loading container specifications...
                </div>
              ) : containers.length === 0 ? (
                <div className="py-8 text-center text-slate-500">
                  No container specs available.
                </div>
              ) : (
                containers.map((c) => (
                  <div
                    key={c.name}
                    className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="font-mono font-semibold text-slate-200">
                          {c.name}
                        </span>
                        {c.ready && (
                          <span className="text-[10px] px-1.5 py-0.2 bg-emerald-950 text-emerald-400 rounded border border-emerald-800">
                            Ready
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Restarts: {c.restartCount}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-0.5">
                        Image Digest
                      </span>
                      <div className="flex items-center space-x-1.5 bg-slate-900 px-2 py-1 rounded border border-slate-800 font-mono text-[11px] text-slate-300">
                        <span className="truncate flex-1">{c.image}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(c.image, `img-${c.name}`)}
                          className="text-slate-500 hover:text-slate-300 p-0.5"
                        >
                          {copiedKey === `img-${c.name}` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                      <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                        <span className="text-slate-500 text-[10px] block">State</span>
                        <span className="text-slate-200">
                          {c.state?.status || "Running"}
                        </span>
                      </div>
                      <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                        <span className="text-slate-500 text-[10px] block">Ports</span>
                        <span className="text-slate-200">8080/TCP, 9090/TCP</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "metadata" && (
            <div className="space-y-3">
              <div>
                <h3 className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center space-x-1">
                  <Tag className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Kubernetes Labels</span>
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded font-mono text-[11px] text-slate-300">
                    app.kubernetes.io/name={pod.name.split("-")[0]}
                  </span>
                  <span className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded font-mono text-[11px] text-slate-300">
                    app.kubernetes.io/instance=kermit-prod
                  </span>
                  <span className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded font-mono text-[11px] text-slate-300">
                    pod-template-hash={pod.name.split("-")[1] || "75d69b9b5f"}
                  </span>
                  <span className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded font-mono text-[11px] text-slate-300">
                    version=v1.24.0
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <h3 className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center space-x-1">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  <span>Annotations</span>
                </h3>
                <div className="space-y-1 font-mono text-[11px]">
                  <div className="bg-slate-950 p-2 rounded border border-slate-800 flex justify-between">
                    <span className="text-slate-500 truncate mr-2">
                      kubectl.kubernetes.io/restartedAt
                    </span>
                    <span className="text-slate-300">2026-09-02T18:30:00Z</span>
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800 flex justify-between">
                    <span className="text-slate-500 truncate mr-2">
                      prometheus.io/scrape
                    </span>
                    <span className="text-emerald-400">true</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "resources" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 font-mono">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                  <span className="text-slate-500 text-[10px] flex items-center space-x-1">
                    <Network className="w-3 h-3" />
                    <span>IP Address</span>
                  </span>
                  <span className="text-sm font-semibold text-slate-200">
                    {pod.ip || "Pending"}
                  </span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                  <span className="text-slate-500 text-[10px] flex items-center space-x-1">
                    <Layers className="w-3 h-3" />
                    <span>Age</span>
                  </span>
                  <span className="text-sm font-semibold text-slate-200">
                    {pod.age}
                  </span>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">
                  Resource Requests & Limits
                </span>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div>
                    <span className="text-slate-400 block">CPU Request / Limit:</span>
                    <span className="text-cyan-300 font-semibold">100m / 500m</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Memory Request / Limit:</span>
                    <span className="text-cyan-300 font-semibold">128Mi / 512Mi</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "events" && (
            <div className="space-y-2 font-mono text-[11px]">
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-start space-x-2.5">
                <div className="w-5 h-5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Info className="w-3 h-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-slate-400 text-[10px]">
                    <span className="text-emerald-400 font-semibold">Normal • Scheduled</span>
                    <span>18m ago</span>
                  </div>
                  <p className="text-slate-200 mt-0.5">
                    Successfully assigned {pod.namespace}/{pod.name} to {pod.nodeName || "worker-pool-node-01"}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-start space-x-2.5">
                <div className="w-5 h-5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Info className="w-3 h-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-slate-400 text-[10px]">
                    <span className="text-emerald-400 font-semibold">Normal • Pulled</span>
                    <span>17m ago</span>
                  </div>
                  <p className="text-slate-200 mt-0.5">
                    Container image &quot;registry.k8s.io/{pod.name.split("-")[0]}:v1.24.0&quot; already present on machine
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-start space-x-2.5">
                <div className="w-5 h-5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Info className="w-3 h-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-slate-400 text-[10px]">
                    <span className="text-emerald-400 font-semibold">Normal • Started</span>
                    <span>16m ago</span>
                  </div>
                  <p className="text-slate-200 mt-0.5">
                    Started container &quot;app&quot;
                  </p>
                </div>
              </div>

              {isFailed && (
                <div className="p-3 bg-rose-950/40 rounded-lg border border-rose-900/60 flex items-start space-x-2.5">
                  <div className="w-5 h-5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <AlertTriangle className="w-3 h-3" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-slate-400 text-[10px]">
                      <span className="text-rose-400 font-semibold">Warning • BackOff</span>
                      <span>2m ago (x{pod.restartCount} over 15m)</span>
                    </div>
                    <p className="text-rose-300 mt-0.5">
                      Back-off 5m0s restarting failed container=app pod={pod.name}_{pod.namespace}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "yaml" && (
            <div className="relative">
              <button
                type="button"
                onClick={() => handleCopy(generatedYaml, "yaml")}
                className="absolute right-3 top-3 p-1.5 rounded bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors flex items-center space-x-1 text-[11px]"
              >
                {copiedKey === "yaml" ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy YAML</span>
                  </>
                )}
              </button>
              <pre className="p-4 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto leading-relaxed">
                {generatedYaml}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between flex-shrink-0">
          <span className="text-[10px] text-slate-500">
            Workload inspector • Kermitt Client
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
