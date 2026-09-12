import React, { useState, useEffect } from "react";
import {
  X,
  FileCode,
  Activity,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Clock,
  Briefcase,
  CalendarClock,
} from "lucide-react";
import { JobItem, CronJobItem } from "./JobsView";

export interface JobDetailsModalProps {
  item: JobItem | CronJobItem | null;
  itemType: "jobs" | "cronjobs";
  isOpen: boolean;
  initialTab?: "yaml" | "events";
  onClose: () => void;
}

export const JobDetailsModal: React.FC<JobDetailsModalProps> = ({
  item,
  itemType,
  isOpen,
  initialTab = "yaml",
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"yaml" | "events">(initialTab);
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

  const isJob = itemType === "jobs";
  const job = isJob ? (item as JobItem) : null;
  const cron = !isJob ? (item as CronJobItem) : null;

  // Synthesize realistic Kubernetes YAML manifest
  const yamlContent = isJob
    ? `apiVersion: batch/v1
kind: Job
metadata:
  name: ${job?.name}
  namespace: ${job?.namespace}
  labels:
    app.kubernetes.io/name: ${job?.name.split("-")[0]}
    app.kubernetes.io/managed-by: kermitt
    job-name: ${job?.name}
spec:
  completions: 1
  parallelism: 1
  backoffLimit: 4
  template:
    metadata:
      labels:
        job-name: ${job?.name}
    spec:
      restartPolicy: OnFailure
      containers:
      - name: worker
        image: ${job?.image}
        resources:
          limits:
            cpu: "500m"
            memory: "512Mi"
          requests:
            cpu: "100m"
            memory: "128Mi"
status:
  conditions:
  - type: ${job?.status === "Completed" ? "Complete" : job?.status === "Failed" ? "Failed" : "Active"}
    status: "True"
    lastProbeTime: "2026-09-03T12:00:00Z"
    lastTransitionTime: "2026-09-03T12:00:15Z"
  startTime: "2026-09-03T12:00:00Z"
  completionTime: "${job?.status === "Completed" ? "2026-09-03T12:04:12Z" : ""}"
  succeeded: ${job?.status === "Completed" ? 1 : 0}
  failed: ${job?.status === "Failed" ? 1 : 0}
  active: ${job?.status === "Running" ? 1 : 0}`
    : `apiVersion: batch/v1
kind: CronJob
metadata:
  name: ${cron?.name}
  namespace: ${cron?.namespace}
  labels:
    app.kubernetes.io/name: ${cron?.name.split("-")[0]}
    app.kubernetes.io/managed-by: kermitt
spec:
  schedule: "${cron?.schedule}"
  concurrencyPolicy: Forbid
  suspend: ${cron?.suspend}
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: runner
            image: registry.k8s.io/${cron?.name.split("-")[0]}:latest
status:
  lastScheduleTime: "2026-09-03T10:30:00Z"
  active: ${cron && cron.activeJobs > 0 ? `\n  - apiVersion: batch/v1\n    kind: Job\n    name: ${cron?.name}-manual` : "[]"}`;

  // Synthesize realistic Kubernetes event timeline
  const events = isJob
    ? [
        {
          type: "Normal",
          reason: "SuccessfulCreate",
          age: job?.age || "10m",
          message: `Created pod: ${job?.name}-w8x4l`,
        },
        {
          type: "Normal",
          reason: "Scheduled",
          age: job?.age || "9m",
          message: `Successfully assigned ${job?.namespace}/${job?.name}-w8x4l to node-worker-01`,
        },
        {
          type: "Normal",
          reason: "Pulled",
          age: job?.age || "8m",
          message: `Container image "${job?.image}" already present on machine`,
        },
        job?.status === "Failed"
          ? {
              type: "Warning",
              reason: "BackOff",
              age: job?.age || "2m",
              message: "Back-off restarting failed container worker in pod",
            }
          : {
              type: "Normal",
              reason: "Completed",
              age: job?.age || "5m",
              message: "Job completed successfully with 1/1 completions",
            },
      ]
    : [
        {
          type: "Normal",
          reason: "Scheduled",
          age: cron?.lastSchedule || "15m ago",
          message: `CronJob ${cron?.name} scheduled job run: ${cron?.name}-28492019`,
        },
        {
          type: "Normal",
          reason: "SuccessfulCreate",
          age: cron?.lastSchedule || "15m ago",
          message: `Created Job ${cron?.name}-28492019 from CronJob spec`,
        },
        cron?.suspend
          ? {
              type: "Warning",
              reason: "Suspended",
              age: "1d ago",
              message: `CronJob ${cron?.name} schedule is suspended (spec.suspend=true)`,
            }
          : {
              type: "Normal",
              reason: "SawCompletedJob",
              age: cron?.lastSchedule || "10m ago",
              message: `Saw completed job: ${cron?.name}-28492019, status: Succeeded`,
            },
      ];

  const handleCopy = () => {
    const textToCopy = activeTab === "yaml" ? yamlContent : JSON.stringify(events, null, 2);
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-950/80 border border-cyan-800/80 flex items-center justify-center text-cyan-400">
              {isJob ? <Briefcase className="w-5 h-5" /> : <CalendarClock className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-semibold text-slate-100 font-mono">
                  {item.name}
                </h2>
                <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                  {item.namespace}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {isJob ? "Kubernetes Batch Job" : "Kubernetes CronJob"}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors border border-slate-700/60 flex items-center space-x-1 text-xs"
              title="Copy content"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center px-5 border-b border-slate-800 bg-slate-950/40 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("yaml")}
            className={`py-2.5 px-3 border-b-2 font-medium flex items-center space-x-1.5 transition-colors ${
              activeTab === "yaml"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>YAML Manifest</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("events")}
            className={`py-2.5 px-3 border-b-2 font-medium flex items-center space-x-1.5 transition-colors ${
              activeTab === "events"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Events ({events.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 overflow-y-auto flex-1 text-xs font-mono">
          {activeTab === "yaml" ? (
            <pre className="p-3 bg-slate-950 border border-slate-800/80 rounded-lg text-slate-300 text-[11px] leading-5 overflow-x-auto selection:bg-cyan-950 selection:text-cyan-200">
              {yamlContent}
            </pre>
          ) : (
            <div className="space-y-2">
              {events.map((evt, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border flex items-start space-x-3 transition-colors ${
                    evt.type === "Warning"
                      ? "bg-rose-950/20 border-rose-900/40 text-rose-300"
                      : "bg-slate-950/60 border-slate-800 text-slate-300"
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {evt.type === "Warning" ? (
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-slate-200 font-sans text-xs">
                        {evt.reason}
                      </span>
                      <span className="text-[10px] text-slate-500 font-sans flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{evt.age}</span>
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-400 break-words">
                      {evt.message}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
