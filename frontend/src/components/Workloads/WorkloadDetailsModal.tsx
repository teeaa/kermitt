import React, { useState, useEffect } from "react";
import {
  X,
  FileCode,
  Layers,
  Activity,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Clock,
  Boxes,
  FolderGit2,
} from "lucide-react";
import { DeploymentItem } from "./DeploymentsView";
import { StatefulSetItem } from "./StatefulSetsView";

export interface WorkloadDetailsModalProps {
  item: DeploymentItem | StatefulSetItem | null;
  resourceType: "deployment" | "statefulset";
  isOpen: boolean;
  initialTab?: "yaml" | "spec" | "events";
  onClose: () => void;
}

export const WorkloadDetailsModal: React.FC<WorkloadDetailsModalProps> = ({
  item,
  resourceType,
  isOpen,
  initialTab = "yaml",
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"yaml" | "spec" | "events">(initialTab);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  const isDeployment = resourceType === "deployment";
  const dep = isDeployment ? (item as DeploymentItem) : null;
  const sts = !isDeployment ? (item as StatefulSetItem) : null;

  // Synthesize realistic Kubernetes YAML manifest
  const yamlContent = isDeployment
    ? `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${dep?.name}
  namespace: ${dep?.namespace}
  labels:
    app.kubernetes.io/name: ${dep?.name.split("-")[0]}
    app.kubernetes.io/instance: ${dep?.name}
    app.kubernetes.io/managed-by: kermitt
spec:
  replicas: ${dep?.totalReplicas ?? 1}
  selector:
    matchLabels:
      app: ${dep?.name.split("-")[0]}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 25%
      maxUnavailable: 25%
  template:
    metadata:
      labels:
        app: ${dep?.name.split("-")[0]}
    spec:
      containers:
      - name: ${dep?.name.split("-")[0]}
        image: ghcr.io/kermit/${dep?.name.split("-")[0]}:v1.8.4
        ports:
        - containerPort: 8080
          name: http
        resources:
          limits:
            cpu: "500m"
            memory: "512Mi"
          requests:
            cpu: "100m"
            memory: "128Mi"
status:
  availableReplicas: ${dep?.available ?? 0}
  readyReplicas: ${dep?.readyReplicas ?? 0}
  replicas: ${dep?.totalReplicas ?? 0}
  updatedReplicas: ${dep?.upToDate ?? 0}
  conditions:
  - type: Available
    status: "${dep?.status === "Ready" ? "True" : "False"}"
    reason: MinimumReplicasAvailable
  - type: Progressing
    status: "True"
    reason: NewReplicaSetAvailable`
    : `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: ${sts?.name}
  namespace: ${sts?.namespace}
  labels:
    app.kubernetes.io/name: ${sts?.name.split("-")[0]}
    app.kubernetes.io/instance: ${sts?.name}
    app.kubernetes.io/managed-by: kermitt
spec:
  serviceName: "${sts?.serviceName}"
  replicas: ${sts?.totalReplicas ?? 1}
  selector:
    matchLabels:
      app: ${sts?.name.split("-")[0]}
  updateStrategy:
    type: RollingUpdate
  podManagementPolicy: OrderedReady
  template:
    metadata:
      labels:
        app: ${sts?.name.split("-")[0]}
    spec:
      containers:
      - name: ${sts?.name.split("-")[0]}
        image: docker.io/bitnami/${sts?.name.split("-")[0]}:latest
        ports:
        - containerPort: 6379
          name: tcp
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: [ "ReadWriteOnce" ]
      resources:
        requests:
          storage: 10Gi
status:
  replicas: ${sts?.totalReplicas ?? 0}
  readyReplicas: ${sts?.readyReplicas ?? 0}
  currentReplicas: ${sts?.readyReplicas ?? 0}
  updatedReplicas: ${sts?.totalReplicas ?? 0}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(yamlContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 font-sans"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 flex-shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-cyan-950/80 border border-cyan-800/80 flex items-center justify-center text-cyan-400 flex-shrink-0">
              {isDeployment ? (
                <Boxes className="w-5 h-5" />
              ) : (
                <FolderGit2 className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-semibold text-slate-100 truncate" title={item.name}>
                  {item.name}
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-slate-800 text-slate-300 border border-slate-700/60 flex-shrink-0">
                  {item.namespace}
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center space-x-1 flex-shrink-0 ${
                    item.status === "Ready"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                      : item.status === "Progressing"
                      ? "bg-blue-500/10 text-blue-400 border border-blue-500/30"
                      : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                  }`}
                >
                  {item.status === "Ready" ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <AlertCircle className="w-3 h-3" />
                  )}
                  <span>{item.status}</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                apps/v1 • {isDeployment ? "Deployment" : "StatefulSet"} • Replicas: {item.ready}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-6 border-b border-slate-800 bg-slate-950/40 text-xs flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("yaml")}
            className={`flex items-center space-x-1.5 py-2.5 px-3 border-b-2 font-medium transition-colors ${
              activeTab === "yaml"
                ? "border-cyan-500 text-cyan-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Manifest (YAML)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("spec")}
            className={`flex items-center space-x-1.5 py-2.5 px-3 border-b-2 font-medium transition-colors ${
              activeTab === "spec"
                ? "border-cyan-500 text-cyan-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Spec & Details</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("events")}
            className={`flex items-center space-x-1.5 py-2.5 px-3 border-b-2 font-medium transition-colors ${
              activeTab === "events"
                ? "border-cyan-500 text-cyan-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Events Timeline</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto p-6 bg-slate-950/80">
          {activeTab === "yaml" ? (
            <div className="relative">
              <button
                type="button"
                onClick={handleCopy}
                className="absolute right-3 top-3 p-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs flex items-center space-x-1 z-10 transition-colors shadow"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-medium">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy YAML</span>
                  </>
                )}
              </button>
              <pre className="p-4 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 font-mono text-xs overflow-x-auto leading-relaxed select-text">
                {yamlContent}
              </pre>
            </div>
          ) : activeTab === "spec" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                  <div className="text-[10px] uppercase font-semibold text-slate-400 mb-1">
                    Ready Replicas
                  </div>
                  <div className="font-mono text-sm font-bold text-slate-200">
                    {item.ready}
                  </div>
                </div>

                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                  <div className="text-[10px] uppercase font-semibold text-slate-400 mb-1">
                    Age
                  </div>
                  <div className="font-mono text-sm font-bold text-slate-200 flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{item.age}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                  <div className="text-[10px] uppercase font-semibold text-slate-400 mb-1">
                    {isDeployment ? "Up-to-date Replicas" : "Service Name"}
                  </div>
                  <div className="font-mono text-sm font-bold text-slate-200 truncate">
                    {isDeployment ? dep?.upToDate : sts?.serviceName}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                <div className="text-xs font-semibold text-slate-300">Selector & Labels</div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-cyan-300">
                    app={item.name.split("-")[0]}
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
                    app.kubernetes.io/instance={item.name}
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
                    app.kubernetes.io/managed-by=kermitt
                  </span>
                </div>
              </div>

              {isDeployment && dep?.conditions && (
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                  <div className="text-xs font-semibold text-slate-300">Conditions</div>
                  <div className="text-xs font-mono text-slate-400">
                    {dep.conditions}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-slate-400 mb-2">
                Recent Kubernetes events for{" "}
                <span className="font-mono text-slate-300">{item.name}</span>:
              </div>
              <div className="space-y-2 font-mono text-xs">
                <div className="p-3 bg-slate-900 border border-slate-800 rounded flex items-start space-x-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="text-slate-300 font-semibold">ScalingReplicaSet</span>
                      <span>15m ago</span>
                    </div>
                    <p className="text-slate-300 mt-1">
                      Scaled up replica set {item.name}-6d8f58b to {item.readyReplicas}
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-slate-900 border border-slate-800 rounded flex items-start space-x-3">
                  <Activity className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="text-slate-300 font-semibold">SuccessfulCreate</span>
                      <span>25m ago</span>
                    </div>
                    <p className="text-slate-300 mt-1">
                      Created pod: {item.name}-6d8f58b-x7g9q
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-900 border-t border-slate-800 flex items-center justify-end flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
