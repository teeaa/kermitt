import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Briefcase,
  CalendarClock,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCw,
  Copy,
  Check,
  Filter,
  XCircle,
  FileCode,
  Layers,
  Terminal,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Sliders,
} from "lucide-react";
import { JobContextMenu, CronJobContextMenu } from "./JobContextMenu";
import { JobDetailsModal } from "./JobDetailsModal";
import { ConfirmDialog, ConfirmActionType } from "../Common/ConfirmDialog";
import {
  useTableColumns,
  ColumnDefinition,
  parseAgeToSeconds,
} from "../../hooks/useTableColumns";
import { ColumnVisibilityMenu } from "../Common/ColumnVisibilityMenu";
import { kubeApi } from "../../services/kubeApi";
import { reportApiError } from "../../hooks/useNotificationStore";

export interface JobItem {
  name: string;
  namespace: string;
  status: "Completed" | "Running" | "Failed";
  completions: string;
  duration: string;
  age: string;
  image: string;
}

export interface CronJobItem {
  name: string;
  namespace: string;
  schedule: string;
  scheduleDescription: string;
  suspend: boolean;
  activeJobs: number;
  lastSchedule: string;
  age: string;
}

export type JobColumnKey =
  | "status"
  | "name"
  | "namespace"
  | "completions"
  | "duration"
  | "age"
  | "image";

export const JOB_COLUMNS: ColumnDefinition<JobColumnKey>[] = [
  {
    key: "status",
    label: "Status",
    defaultWidth: 130,
    minWidth: 95,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "name",
    label: "Job Name",
    defaultWidth: 260,
    minWidth: 160,
    align: "left",
    required: true,
    resizable: true,
    sortable: true,
  },
  {
    key: "namespace",
    label: "Namespace",
    defaultWidth: 140,
    minWidth: 100,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "completions",
    label: "Completions",
    defaultWidth: 120,
    minWidth: 90,
    align: "center",
    resizable: true,
    sortable: true,
  },
  {
    key: "duration",
    label: "Duration",
    defaultWidth: 110,
    minWidth: 80,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "age",
    label: "Age",
    defaultWidth: 90,
    minWidth: 65,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "image",
    label: "Image",
    defaultWidth: 240,
    minWidth: 120,
    align: "left",
    resizable: true,
    sortable: true,
  },
];

export type CronJobColumnKey =
  | "name"
  | "namespace"
  | "schedule"
  | "suspend"
  | "active"
  | "lastSchedule"
  | "age";

export const CRONJOB_COLUMNS: ColumnDefinition<CronJobColumnKey>[] = [
  {
    key: "name",
    label: "CronJob Name",
    defaultWidth: 260,
    minWidth: 160,
    align: "left",
    required: true,
    resizable: true,
    sortable: true,
  },
  {
    key: "namespace",
    label: "Namespace",
    defaultWidth: 140,
    minWidth: 100,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "schedule",
    label: "Schedule",
    defaultWidth: 220,
    minWidth: 140,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "suspend",
    label: "Suspend",
    defaultWidth: 100,
    minWidth: 80,
    align: "center",
    resizable: true,
    sortable: true,
  },
  {
    key: "active",
    label: "Active",
    defaultWidth: 90,
    minWidth: 70,
    align: "center",
    resizable: true,
    sortable: true,
  },
  {
    key: "lastSchedule",
    label: "Last Schedule",
    defaultWidth: 130,
    minWidth: 90,
    align: "left",
    resizable: true,
    sortable: true,
  },
  {
    key: "age",
    label: "Age",
    defaultWidth: 90,
    minWidth: 65,
    align: "left",
    resizable: true,
    sortable: true,
  },
];

interface JobsViewProps {
  resourceType: "jobs" | "cronjobs";
  activeNamespace: string;
  activeContext?: string;
  onToast: (msg: string) => void;
  onSwitchToPods: () => void;
  mutationsDisabled?: boolean;
  onViewJobLogs?: (jobName: string, namespace: string, previous?: boolean) => void;
}

export const JobsView: React.FC<JobsViewProps> = ({
  resourceType,
  activeNamespace,
  activeContext = "",
  onToast,
  onSwitchToPods,
  mutationsDisabled = false,
  onViewJobLogs,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  // Dynamic workload item collections
  const [jobsList, setJobsList] = useState<JobItem[]>([]);
  const [cronJobsList, setCronJobsList] = useState<CronJobItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchWorkloads = useCallback(async () => {
    setLoading(true);
    try {
      if (resourceType === "jobs") {
        const data = await kubeApi.getJobs(activeNamespace);
        setJobsList(
          (data || []).map((j) => ({
            ...j,
            status: (j.status as "Completed" | "Running" | "Failed") || "Running",
          }))
        );
      } else {
        const data = await kubeApi.getCronJobs(activeNamespace);
        setCronJobsList(data || []);
      }
    } catch (err) {
      console.error("[JOBS/CRONJOBS] Failed to fetch data:", err);
      if (resourceType === "jobs") {
        setJobsList([]);
      } else {
        setCronJobsList([]);
      }
      reportApiError(err, resourceType, activeNamespace);
    } finally {
      setLoading(false);
    }
  }, [resourceType, activeNamespace]);

  const refreshWorkloads = useCallback(async () => {
    try {
      const [jobsData, cronData] = await Promise.all([
        kubeApi.getJobs(activeNamespace).catch(() => []),
        kubeApi.getCronJobs(activeNamespace).catch(() => []),
      ]);
      setJobsList(
        (jobsData || []).map((j) => ({
          ...j,
          status: (j.status as "Completed" | "Running" | "Failed") || "Running",
        }))
      );
      setCronJobsList(cronData || []);
    } catch (err) {
      console.error("[JOBS/CRONJOBS] Failed to refresh workloads:", err);
    }
  }, [activeNamespace]);

  useEffect(() => {
    let active = true;
    fetchWorkloads();
    return () => {
      active = false;
    };
  }, [fetchWorkloads]);

  // Synchronous Position Right-Click Context Menu States
  const [jobContextMenu, setJobContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    job: JobItem;
  } | null>(null);

  const [cronJobContextMenu, setCronJobContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    cronJob: CronJobItem;
  } | null>(null);

  // Inspector Details Modal State
  const [detailsModal, setDetailsModal] = useState<{
    isOpen: boolean;
    item: JobItem | CronJobItem;
    type: "jobs" | "cronjobs";
    tab: "yaml" | "events";
  } | null>(null);

  // Guarded Confirm Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    actionType: ConfirmActionType;
    itemName: string;
    namespace: string;
    context?: string;
    description?: React.ReactNode;
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [isConfirmSubmitting, setIsConfirmSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const handleConfirmAction = async () => {
    if (!confirmDialog) return;
    setIsConfirmSubmitting(true);
    setConfirmError(null);
    try {
      await confirmDialog.onConfirm();
    } catch (err: any) {
      console.error("[JOBS] Confirmation action failed:", err);
      const errMsg = err?.message || (typeof err === "string" ? err : "Failed to execute action");
      setConfirmError(errMsg);
      reportApiError(err, confirmDialog.actionType, confirmDialog.namespace);
    } finally {
      setIsConfirmSubmitting(false);
    }
  };

  const isJobs = resourceType === "jobs";

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(text);
    onToast(`Copied ${label} "${text}" to clipboard.`);
    setTimeout(() => setCopiedItem(null), 1500);
  };

  // Table columns & resizing hooks for Jobs & CronJobs
  const jobsCols = useTableColumns<JobColumnKey>({
    resourceKey: "jobs",
    columns: JOB_COLUMNS,
  });

  const cronJobsCols = useTableColumns<CronJobColumnKey>({
    resourceKey: "cronjobs",
    columns: CRONJOB_COLUMNS,
  });

  const handleAutoFitJobColumn = (colKey: JobColumnKey) => {
    jobsCols.handleAutoFitColumn(colKey, filteredJobs, (job: JobItem, key: JobColumnKey) => {
      switch (key) {
        case "status":
          return job.status;
        case "name":
          return job.name;
        case "namespace":
          return job.namespace;
        case "completions":
          return job.completions;
        case "duration":
          return job.duration;
        case "age":
          return job.age;
        case "image":
          return job.image;
        default:
          return "";
      }
    });
  };

  const handleAutoFitCronJobColumn = (colKey: CronJobColumnKey) => {
    cronJobsCols.handleAutoFitColumn(colKey, filteredCronJobs, (cron: CronJobItem, key: CronJobColumnKey) => {
      switch (key) {
        case "name":
          return cron.name;
        case "namespace":
          return cron.namespace;
        case "schedule":
          return `${cron.schedule} (${cron.scheduleDescription})`;
        case "suspend":
          return cron.suspend ? "True" : "False";
        case "active":
          return String(cron.activeJobs);
        case "lastSchedule":
          return cron.lastSchedule;
        case "age":
          return cron.age;
        default:
          return "";
      }
    });
  };

  // Filter Jobs
  const filteredJobs = useMemo(() => {
    return jobsList.filter((job) => {
      if (activeNamespace !== "all" && job.namespace !== activeNamespace) {
        return false;
      }
      const q = searchTerm.toLowerCase().trim();
      if (
        q &&
        !job.name.toLowerCase().includes(q) &&
        !job.namespace.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (statusFilter !== "ALL" && job.status.toUpperCase() !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [jobsList, activeNamespace, searchTerm, statusFilter]);

  // Sort Jobs
  const sortedJobs = useMemo(() => {
    if (!jobsCols.sortConfig) return filteredJobs;
    const { column, direction } = jobsCols.sortConfig;
    const factor = direction === "asc" ? 1 : -1;
    return [...filteredJobs].sort((a, b) => {
      switch (column) {
        case "status":
          return a.status.localeCompare(b.status) * factor;
        case "name":
          return a.name.localeCompare(b.name) * factor;
        case "namespace":
          return a.namespace.localeCompare(b.namespace) * factor;
        case "completions":
          return a.completions.localeCompare(b.completions) * factor;
        case "duration":
          return (parseAgeToSeconds(a.duration) - parseAgeToSeconds(b.duration)) * factor;
        case "age":
          return (parseAgeToSeconds(a.age) - parseAgeToSeconds(b.age)) * factor;
        case "image":
          return a.image.localeCompare(b.image) * factor;
        default:
          return 0;
      }
    });
  }, [filteredJobs, jobsCols.sortConfig]);

  // Filter CronJobs
  const filteredCronJobs = useMemo(() => {
    return cronJobsList.filter((cron) => {
      if (activeNamespace !== "all" && cron.namespace !== activeNamespace) {
        return false;
      }
      const q = searchTerm.toLowerCase().trim();
      if (
        q &&
        !cron.name.toLowerCase().includes(q) &&
        !cron.namespace.toLowerCase().includes(q) &&
        !cron.schedule.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (statusFilter === "ACTIVE" && cron.suspend) return false;
      if (statusFilter === "SUSPENDED" && !cron.suspend) return false;
      return true;
    });
  }, [cronJobsList, activeNamespace, searchTerm, statusFilter]);

  // Sort CronJobs
  const sortedCronJobs = useMemo(() => {
    if (!cronJobsCols.sortConfig) return filteredCronJobs;
    const { column, direction } = cronJobsCols.sortConfig;
    const factor = direction === "asc" ? 1 : -1;
    return [...filteredCronJobs].sort((a, b) => {
      switch (column) {
        case "name":
          return a.name.localeCompare(b.name) * factor;
        case "namespace":
          return a.namespace.localeCompare(b.namespace) * factor;
        case "schedule":
          return a.schedule.localeCompare(b.schedule) * factor;
        case "suspend":
          return ((a.suspend ? 1 : 0) - (b.suspend ? 1 : 0)) * factor;
        case "active":
          return (a.activeJobs - b.activeJobs) * factor;
        case "lastSchedule":
          return (parseAgeToSeconds(a.lastSchedule) - parseAgeToSeconds(b.lastSchedule)) * factor;
        case "age":
          return (parseAgeToSeconds(a.age) - parseAgeToSeconds(b.age)) * factor;
        default:
          return 0;
      }
    });
  }, [filteredCronJobs, cronJobsCols.sortConfig]);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* Top Header Controls */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
              {isJobs ? (
                <Briefcase className="w-4 h-4" />
              ) : (
                <CalendarClock className="w-4 h-4" />
              )}
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-100 flex items-center space-x-2">
                <span>{isJobs ? "Jobs" : "CronJobs"}</span>
                <span className="text-xs px-2.5 py-0.5 bg-slate-800 text-slate-300 rounded-full font-mono font-normal border border-slate-700/60">
                  {activeNamespace === "all" ? "All Namespaces" : activeNamespace}
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {isJobs
                  ? `Showing ${filteredJobs.length} batch job runs`
                  : `Showing ${filteredCronJobs.length} recurring schedules`}
              </p>
            </div>
          </div>

          <div className="hidden lg:flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950/60 border border-cyan-800/80 text-cyan-300">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>Kubernetes Batch/v1 API Ready</span>
          </div>
        </div>

        {/* Search & Quick Status Filters */}
        <div className="flex items-center space-x-2.5">
          {isJobs ? (
            <div className="hidden md:flex items-center p-0.5 bg-slate-950 border border-slate-800 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === "ALL"
                    ? "bg-slate-800 text-slate-100 font-medium"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("COMPLETED")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === "COMPLETED"
                    ? "bg-emerald-950 text-emerald-300 font-medium border border-emerald-800"
                    : "text-slate-400 hover:text-emerald-400"
                }`}
              >
                Completed
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("RUNNING")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === "RUNNING"
                    ? "bg-blue-950 text-blue-300 font-medium border border-blue-800"
                    : "text-slate-400 hover:text-blue-400"
                }`}
              >
                Running
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("FAILED")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === "FAILED"
                    ? "bg-rose-950 text-rose-300 font-medium border border-rose-800"
                    : "text-slate-400 hover:text-rose-400"
                }`}
              >
                Failed
              </button>
            </div>
          ) : (
            <div className="hidden md:flex items-center p-0.5 bg-slate-950 border border-slate-800 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === "ALL"
                    ? "bg-slate-800 text-slate-100 font-medium"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("ACTIVE")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === "ACTIVE"
                    ? "bg-emerald-950 text-emerald-300 font-medium border border-emerald-800"
                    : "text-slate-400 hover:text-emerald-400"
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("SUSPENDED")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === "SUSPENDED"
                    ? "bg-amber-950 text-amber-300 font-medium border border-amber-800"
                    : "text-slate-400 hover:text-amber-400"
                }`}
              >
                Suspended
              </button>
            </div>
          )}

          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={`Search ${isJobs ? "jobs" : "cronjobs"}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-md pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <XCircle className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Column Settings Trigger */}
          <button
            type="button"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              if (isJobs) {
                jobsCols.setContextMenu({ x: rect.left, y: rect.bottom + 5 });
              } else {
                cronJobsCols.setContextMenu({ x: rect.left, y: rect.bottom + 5 });
              }
            }}
            title="Customize columns"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors border border-slate-700/60"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Table Area with Horizontal Scroll & Right Margin Padding */}
      <div className="flex-1 overflow-auto select-text pr-4 sm:pr-6">
        {isJobs ? (
          /* Jobs Table */
          <table className="w-full text-left border-collapse table-fixed select-none">
            <colgroup>
              {jobsCols.visibleColumns.map((col) => (
                <col
                  key={col.key}
                  style={{ width: `${jobsCols.columnWidths[col.key]}px` }}
                />
              ))}
            </colgroup>
            <thead
              onContextMenu={jobsCols.handleHeaderContextMenu}
              className="bg-slate-900/95 text-[11px] font-semibold text-slate-400 uppercase tracking-wider sticky top-0 z-10 border-b border-slate-800 shadow-xs"
            >
              <tr>
                {jobsCols.visibleColumns.map((col) => {
                  const isSorted = jobsCols.sortConfig?.column === col.key;
                  const isBeingResized = jobsCols.resizingColKey === col.key;

                  return (
                    <th
                      key={col.key}
                      style={{ width: `${jobsCols.columnWidths[col.key]}px` }}
                      onClick={() => jobsCols.handleSortClick(col)}
                      className={`py-2.5 px-3.5 relative group/th select-none ${
                        col.sortable
                          ? "cursor-pointer hover:text-slate-200 hover:bg-slate-800/60"
                          : ""
                      } ${col.align === "center" ? "text-center" : "text-left"} ${
                        isBeingResized ? "bg-slate-800 text-cyan-300" : ""
                      } transition-colors`}
                    >
                      <div
                        className={`flex items-center space-x-1.5 min-w-0 ${
                          col.align === "center" ? "justify-center" : "justify-start"
                        }`}
                      >
                        <span className="truncate">{col.label}</span>
                        {col.sortable && (
                          <span className="inline-flex items-center flex-shrink-0">
                            {isSorted ? (
                              jobsCols.sortConfig?.direction === "asc" ? (
                                <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-cyan-400" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-slate-500 opacity-0 group-hover/th:opacity-60 transition-opacity" />
                            )}
                          </span>
                        )}
                      </div>

                      {/* Permanent Visual Resize Divider & Double-Click Auto-Fit Handle */}
                      {col.resizable && (
                        <div
                          onMouseDown={(e) => jobsCols.handleResizeStart(e, col)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleAutoFitJobColumn(col.key);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          title="Drag to resize column (Double-click to auto-fit)"
                          className="absolute right-0 top-0 bottom-0 w-3 -mr-1.5 flex items-center justify-center cursor-col-resize z-20 group/divider"
                        >
                          <div
                            className={`h-4/5 w-[1px] transition-colors ${
                              isBeingResized
                                ? "bg-cyan-400 w-[2px]"
                                : "bg-slate-700/70 group-hover/divider:bg-sky-400 group-hover/divider:w-[2px]"
                            }`}
                          />
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {loading ? (
                <tr>
                  <td
                    colSpan={jobsCols.visibleColumns.length}
                    className="py-16 text-center text-slate-500"
                  >
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <RotateCw className="w-8 h-8 text-cyan-400 animate-spin" />
                      <span className="text-slate-300 font-medium">
                        Loading jobs...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : sortedJobs.length === 0 ? (
                <tr>
                  <td
                    colSpan={jobsCols.visibleColumns.length}
                    className="py-16 text-center text-slate-500"
                  >
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Briefcase className="w-8 h-8 text-slate-600" />
                      <span className="text-slate-300 font-medium">
                        {activeNamespace === "all"
                          ? "No jobs found in cluster"
                          : `No jobs found in namespace "${activeNamespace}"`}
                      </span>
                      <button
                        type="button"
                        onClick={onSwitchToPods}
                        className="text-cyan-400 hover:underline text-xs"
                      >
                        Return to Pods view
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedJobs.map((job) => (
                  <tr
                    key={`${job.namespace}/${job.name}`}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();

                      const MENU_WIDTH = 240;
                      const MENU_HEIGHT = 320;

                      const x =
                        e.clientX + MENU_WIDTH > window.innerWidth
                          ? window.innerWidth - MENU_WIDTH - 8
                          : e.clientX;
                      const y =
                        e.clientY + MENU_HEIGHT > window.innerHeight
                          ? window.innerHeight - MENU_HEIGHT - 8
                          : e.clientY;

                      setJobContextMenu({
                        isOpen: true,
                        position: { x, y },
                        job,
                      });
                    }}
                    className={`cursor-pointer transition-colors group ${
                      jobContextMenu?.isOpen &&
                      jobContextMenu.job.name === job.name
                        ? "bg-slate-800/90 ring-1 ring-cyan-500/50"
                        : "hover:bg-slate-900/70"
                    }`}
                  >
                    {jobsCols.columnVisibility.status && (
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        {job.status === "Completed" ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                            <span>Completed</span>
                          </span>
                        ) : job.status === "Running" ? (
                          <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                            <span>Running</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
                            <AlertCircle className="w-3 h-3 flex-shrink-0" />
                            <span>Failed</span>
                          </span>
                        )}
                      </td>
                    )}

                    {jobsCols.columnVisibility.name && (
                      <td className="py-2.5 px-3.5 font-mono font-medium text-slate-200 truncate">
                        <div className="flex items-center space-x-1.5">
                          <span className="truncate" title={job.name}>
                            {job.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(job.name, "job name")}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-slate-300 rounded transition-opacity"
                          >
                            {copiedItem === job.name ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>
                    )}

                    {jobsCols.columnVisibility.namespace && (
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 font-mono border border-slate-700/50">
                          {job.namespace}
                        </span>
                      </td>
                    )}

                    {jobsCols.columnVisibility.completions && (
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-center font-mono">
                        <span
                          className={
                            job.completions.startsWith("1")
                              ? "text-emerald-400 font-semibold"
                              : "text-slate-400"
                          }
                        >
                          {job.completions}
                        </span>
                      </td>
                    )}

                    {jobsCols.columnVisibility.duration && (
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-300 font-mono">
                        {job.duration}
                      </td>
                    )}

                    {jobsCols.columnVisibility.age && (
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-400 font-mono">
                        {job.age}
                      </td>
                    )}

                    {jobsCols.columnVisibility.image && (
                      <td
                        className="py-2.5 px-3.5 font-mono text-[11px] text-slate-400 truncate"
                        title={job.image}
                      >
                        {job.image}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          /* CronJobs Table */
          <table className="w-full text-left border-collapse table-fixed select-none">
            <colgroup>
              {cronJobsCols.visibleColumns.map((col) => (
                <col
                  key={col.key}
                  style={{ width: `${cronJobsCols.columnWidths[col.key]}px` }}
                />
              ))}
            </colgroup>
            <thead
              onContextMenu={cronJobsCols.handleHeaderContextMenu}
              className="bg-slate-900/95 text-[11px] font-semibold text-slate-400 uppercase tracking-wider sticky top-0 z-10 border-b border-slate-800 shadow-xs"
            >
              <tr>
                {cronJobsCols.visibleColumns.map((col) => {
                  const isSorted = cronJobsCols.sortConfig?.column === col.key;
                  const isBeingResized =
                    cronJobsCols.resizingColKey === col.key;

                  return (
                    <th
                      key={col.key}
                      style={{ width: `${cronJobsCols.columnWidths[col.key]}px` }}
                      onClick={() => cronJobsCols.handleSortClick(col)}
                      className={`py-2.5 px-3.5 relative group/th select-none ${
                        col.sortable
                          ? "cursor-pointer hover:text-slate-200 hover:bg-slate-800/60"
                          : ""
                      } ${col.align === "center" ? "text-center" : "text-left"} ${
                        isBeingResized ? "bg-slate-800 text-cyan-300" : ""
                      } transition-colors`}
                    >
                      <div
                        className={`flex items-center space-x-1.5 min-w-0 ${
                          col.align === "center" ? "justify-center" : "justify-start"
                        }`}
                      >
                        <span className="truncate">{col.label}</span>
                        {col.sortable && (
                          <span className="inline-flex items-center flex-shrink-0">
                            {isSorted ? (
                              cronJobsCols.sortConfig?.direction === "asc" ? (
                                <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-cyan-400" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-slate-500 opacity-0 group-hover/th:opacity-60 transition-opacity" />
                            )}
                          </span>
                        )}
                      </div>

                      {/* Permanent Visual Resize Divider & Double-Click Auto-Fit Handle */}
                      {col.resizable && (
                        <div
                          onMouseDown={(e) =>
                            cronJobsCols.handleResizeStart(e, col)
                          }
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleAutoFitCronJobColumn(col.key);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          title="Drag to resize column (Double-click to auto-fit)"
                          className="absolute right-0 top-0 bottom-0 w-3 -mr-1.5 flex items-center justify-center cursor-col-resize z-20 group/divider"
                        >
                          <div
                            className={`h-4/5 w-[1px] transition-colors ${
                              isBeingResized
                                ? "bg-cyan-400 w-[2px]"
                                : "bg-slate-700/70 group-hover/divider:bg-sky-400 group-hover/divider:w-[2px]"
                            }`}
                          />
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {loading ? (
                <tr>
                  <td
                    colSpan={cronJobsCols.visibleColumns.length}
                    className="py-16 text-center text-slate-500"
                  >
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <RotateCw className="w-8 h-8 text-cyan-400 animate-spin" />
                      <span className="text-slate-300 font-medium">
                        Loading cronjobs...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : sortedCronJobs.length === 0 ? (
                <tr>
                  <td
                    colSpan={cronJobsCols.visibleColumns.length}
                    className="py-16 text-center text-slate-500"
                  >
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <CalendarClock className="w-8 h-8 text-slate-600" />
                      <span className="text-slate-300 font-medium">
                        {activeNamespace === "all"
                          ? "No cronjobs found in cluster"
                          : `No cronjobs found in namespace "${activeNamespace}"`}
                      </span>
                      <button
                        type="button"
                        onClick={onSwitchToPods}
                        className="text-cyan-400 hover:underline text-xs"
                      >
                        Return to Pods view
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedCronJobs.map((cron) => (
                  <tr
                    key={`${cron.namespace}/${cron.name}`}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();

                      const MENU_WIDTH = 256;
                      const MENU_HEIGHT = 350;

                      const x =
                        e.clientX + MENU_WIDTH > window.innerWidth
                          ? window.innerWidth - MENU_WIDTH - 8
                          : e.clientX;
                      const y =
                        e.clientY + MENU_HEIGHT > window.innerHeight
                          ? window.innerHeight - MENU_HEIGHT - 8
                          : e.clientY;

                      setCronJobContextMenu({
                        isOpen: true,
                        position: { x, y },
                        cronJob: cron,
                      });
                    }}
                    className={`cursor-pointer transition-colors group ${
                      cronJobContextMenu?.isOpen &&
                      cronJobContextMenu.cronJob.name === cron.name
                        ? "bg-slate-800/90 ring-1 ring-cyan-500/50"
                        : "hover:bg-slate-900/70"
                    }`}
                  >
                    {cronJobsCols.columnVisibility.name && (
                      <td className="py-2.5 px-3.5 font-mono font-medium text-slate-200 truncate">
                        <div className="flex items-center space-x-1.5">
                          <span className="truncate" title={cron.name}>
                            {cron.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(cron.name, "cronjob name")}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-slate-300 rounded transition-opacity"
                          >
                            {copiedItem === cron.name ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>
                    )}

                    {cronJobsCols.columnVisibility.namespace && (
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 font-mono border border-slate-700/50">
                          {cron.namespace}
                        </span>
                      </td>
                    )}

                    {cronJobsCols.columnVisibility.schedule && (
                      <td className="py-2.5 px-3.5 whitespace-nowrap font-mono">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-cyan-300 bg-cyan-950/60 border border-cyan-800/80 px-1.5 py-0.5 rounded text-[11px]">
                            {cron.schedule}
                          </span>
                          <span className="text-slate-500 text-[10px] hidden xl:inline">
                            ({cron.scheduleDescription})
                          </span>
                        </div>
                      </td>
                    )}

                    {cronJobsCols.columnVisibility.suspend && (
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-center font-mono">
                        {cron.suspend ? (
                          <span className="text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-900/50 text-[10px]">
                            True
                          </span>
                        ) : (
                          <span className="text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-900/50 text-[10px]">
                            False
                          </span>
                        )}
                      </td>
                    )}

                    {cronJobsCols.columnVisibility.active && (
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-center font-mono text-slate-400">
                        {cron.activeJobs}
                      </td>
                    )}

                    {cronJobsCols.columnVisibility.lastSchedule && (
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-300 font-mono">
                        {cron.lastSchedule}
                      </td>
                    )}

                    {cronJobsCols.columnVisibility.age && (
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-400 font-mono">
                        {cron.age}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer Banner */}
      <div className="px-4 py-2 bg-slate-900/80 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-2">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span>
            Batch Workload Engine • Viewing {isJobs ? "Job Runs" : "CronJobs"}
          </span>
        </div>
        <button
          type="button"
          onClick={onSwitchToPods}
          className="text-xs text-cyan-400 hover:text-cyan-300 hover:underline flex items-center space-x-1"
        >
          <span>Switch back to Workload Pods →</span>
        </button>
      </div>

      {/* Job Right-Click Context Menu */}
      {jobContextMenu && jobContextMenu.isOpen && jobContextMenu.position && (
        <JobContextMenu
          job={jobContextMenu.job}
          position={jobContextMenu.position}
          onClose={() => setJobContextMenu(null)}
          onViewLogs={(job, previous) => {
            if (onViewJobLogs) {
              onViewJobLogs(job.name, job.namespace, previous);
            } else {
              onToast(`Streaming logs for job "${job.name}"...`);
            }
          }}
          onInspectDetails={(job, tab) => {
            setDetailsModal({
              isOpen: true,
              item: job,
              type: "jobs",
              tab: tab || "yaml",
            });
          }}
          onCopyName={(job) => {
            navigator.clipboard.writeText(job.name);
            onToast(`Copied job name "${job.name}" to clipboard.`);
          }}
          onCopyImage={(job) => {
            navigator.clipboard.writeText(job.image);
            onToast(`Copied container image "${job.image}" to clipboard.`);
          }}
          onRerunJob={(job) => {
            setConfirmError(null);
            setConfirmDialog({
              isOpen: true,
              title: "Rerun Job?",
              actionType: "rerun",
              itemName: job.name,
              namespace: job.namespace,
              description: (
                <>
                  Are you sure you want to rerun Job{" "}
                  <strong className="font-mono text-cyan-300">&quot;{job.name}&quot;</strong>? A
                  new Job execution instance will be cloned and scheduled in namespace{" "}
                  <strong className="font-mono text-cyan-300">&quot;{job.namespace}&quot;</strong>.
                </>
              ),
              onConfirm: async () => {
                const created = await kubeApi.rerunJob(job.namespace, job.name);
                const newName = created?.name || `${job.name}-rerun`;
                onToast(`Job "${newName}" has been triggered for re-execution.`);
                setConfirmDialog(null);
                await refreshWorkloads();
              },
            });
          }}
          onDeleteJob={(job) => {
            setConfirmError(null);
            setConfirmDialog({
              isOpen: true,
              title: "Delete Job?",
              actionType: "delete",
              itemName: job.name,
              namespace: job.namespace,
              onConfirm: () => {
                setJobsList((prev) => prev.filter((j) => j.name !== job.name));
                onToast(`Job "${job.name}" and associated pods were deleted.`);
                setConfirmDialog(null);
              },
            });
          }}
          mutationsDisabled={mutationsDisabled}
        />
      )}

      {/* CronJob Right-Click Context Menu */}
      {cronJobContextMenu && cronJobContextMenu.isOpen && cronJobContextMenu.position && (
        <CronJobContextMenu
          cronJob={cronJobContextMenu.cronJob}
          position={cronJobContextMenu.position}
          onClose={() => setCronJobContextMenu(null)}
          onTriggerRun={(cron) => {
            setConfirmError(null);
            setConfirmDialog({
              isOpen: true,
              title: "Trigger Run Now?",
              actionType: "trigger",
              itemName: cron.name,
              namespace: cron.namespace,
              description: (
                <>
                  Are you sure you want to trigger an immediate run for CronJob{" "}
                  <strong className="font-mono text-cyan-300">&quot;{cron.name}&quot;</strong>? A
                  new Job pod instance will be scheduled in namespace{" "}
                  <strong className="font-mono text-cyan-300">&quot;{cron.namespace}&quot;</strong>.
                </>
              ),
              onConfirm: async () => {
                const created = await kubeApi.triggerCronJob(cron.namespace, cron.name);
                const newName = created?.name || `${cron.name}-manual`;
                onToast(`Triggered immediate job run for CronJob "${cron.name}" (Job: ${newName}).`);
                setConfirmDialog(null);
                await refreshWorkloads();
              },
            });
          }}
          onToggleSuspend={(cron) => {
            const willSuspend = !cron.suspend;
            setConfirmError(null);
            setConfirmDialog({
              isOpen: true,
              title: willSuspend ? "Suspend Schedule?" : "Resume Schedule?",
              actionType: willSuspend ? "suspend" : "resume",
              itemName: cron.name,
              namespace: cron.namespace,
              onConfirm: () => {
                setCronJobsList((prev) =>
                  prev.map((c) =>
                    c.name === cron.name ? { ...c, suspend: willSuspend } : c
                  )
                );
                onToast(
                  willSuspend
                    ? `Suspended CronJob schedule "${cron.name}".`
                    : `Resumed CronJob schedule "${cron.name}".`
                );
                setConfirmDialog(null);
              },
            });
          }}
          onViewLogs={(cron) => {
            if (onViewJobLogs) {
              onViewJobLogs(`${cron.name}-manual`, cron.namespace);
            } else {
              onToast(`Viewing logs for latest run of cronjob "${cron.name}"...`);
            }
          }}
          onInspectDetails={(cron, tab) => {
            setDetailsModal({
              isOpen: true,
              item: cron,
              type: "cronjobs",
              tab: tab || "yaml",
            });
          }}
          onCopyName={(cron) => {
            navigator.clipboard.writeText(cron.name);
            onToast(`Copied CronJob name "${cron.name}" to clipboard.`);
          }}
          onCopySchedule={(cron) => {
            navigator.clipboard.writeText(cron.schedule);
            onToast(`Copied cron expression "${cron.schedule}" to clipboard.`);
          }}
          onDeleteCronJob={(cron) => {
            setConfirmError(null);
            setConfirmDialog({
              isOpen: true,
              title: "Delete CronJob?",
              actionType: "delete",
              itemName: cron.name,
              namespace: cron.namespace,
              onConfirm: () => {
                setCronJobsList((prev) => prev.filter((c) => c.name !== cron.name));
                onToast(`CronJob "${cron.name}" was deleted.`);
                setConfirmDialog(null);
              },
            });
          }}
          mutationsDisabled={mutationsDisabled}
        />
      )}

      {/* Details / YAML / Events Inspector Modal */}
      {detailsModal && detailsModal.isOpen && (
        <JobDetailsModal
          item={detailsModal.item}
          itemType={detailsModal.type}
          isOpen={detailsModal.isOpen}
          initialTab={detailsModal.tab}
          onClose={() => setDetailsModal(null)}
        />
      )}

      {/* Destructive / Mutating Confirmation Dialog */}
      {confirmDialog && confirmDialog.isOpen && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          onClose={() => {
            if (!isConfirmSubmitting) {
              setConfirmDialog(null);
              setConfirmError(null);
            }
          }}
          onConfirm={handleConfirmAction}
          title={confirmDialog.title}
          actionType={confirmDialog.actionType}
          context={confirmDialog.context || activeContext}
          namespace={confirmDialog.namespace}
          itemName={confirmDialog.itemName}
          description={confirmDialog.description}
          isSubmitting={isConfirmSubmitting}
          errorMessage={confirmError}
        />
      )}

      {/* Header Context Menu Popovers (Column Visibility) */}
      {isJobs ? (
        <ColumnVisibilityMenu
          columns={jobsCols.columns}
          columnVisibility={jobsCols.columnVisibility}
          onToggleVisibility={jobsCols.toggleColumnVisibility}
          onResetToDefaults={jobsCols.resetToDefaults}
          onClose={jobsCols.closeContextMenu}
          position={jobsCols.contextMenu}
          menuRef={jobsCols.contextMenuRef}
        />
      ) : (
        <ColumnVisibilityMenu
          columns={cronJobsCols.columns}
          columnVisibility={cronJobsCols.columnVisibility}
          onToggleVisibility={cronJobsCols.toggleColumnVisibility}
          onResetToDefaults={cronJobsCols.resetToDefaults}
          onClose={cronJobsCols.closeContextMenu}
          position={cronJobsCols.contextMenu}
          menuRef={cronJobsCols.contextMenuRef}
        />
      )}
    </div>
  );
};
