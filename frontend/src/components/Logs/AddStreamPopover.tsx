import React, { useState, useRef, useEffect, useMemo } from "react";
import { Search, Box } from "lucide-react";
import { ipc } from "../../../wailsjs/go/models";
import { kubeApi } from "../../services/kubeApi";

export interface AddStreamPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  allPods: ipc.PodSummary[];
  activeStreams: { podName: string; [key: string]: any }[];
  activeNamespace?: string;
  onSelectPod: (pod: ipc.PodSummary) => void;
}

export const AddStreamPopover: React.FC<AddStreamPopoverProps> = ({
  isOpen,
  onClose,
  allPods,
  activeStreams,
  activeNamespace,
  onSelectPod,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [fallbackPods, setFallbackPods] = useState<ipc.PodSummary[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the search field when opened and reset query
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Fallback pod fetching if allPods prop is empty
  useEffect(() => {
    if (isOpen && (!allPods || allPods.length === 0)) {
      const ns = activeNamespace && activeNamespace !== "all" ? activeNamespace : "";
      kubeApi
        .getPods(ns)
        .then((fetched) => {
          setFallbackPods(fetched || []);
        })
        .catch(() => {});
    }
  }, [isOpen, allPods, activeNamespace]);

  // Dismiss on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Dismiss on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen, onClose]);

  // Filter candidate pods
  const candidatePods = useMemo(() => {
    const pool = Array.isArray(allPods) && allPods.length > 0 ? allPods : fallbackPods;
    const activeStreamPodNames = new Set(activeStreams.map((s) => s.podName));

    return pool
      .filter((pod) => !activeStreamPodNames.has(pod.name))
      .filter((pod) => {
        if (activeNamespace && activeNamespace !== "all" && pod.namespace !== activeNamespace) {
          return false;
        }
        return true;
      })
      .filter((pod) => {
        if (!searchQuery.trim()) return true;
        return pod.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
      });
  }, [allPods, fallbackPods, activeStreams, activeNamespace, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute top-full left-0 mt-1 z-50 w-72 bg-surface border border-border-strong rounded-lg shadow-2xl p-2 select-none font-sans text-xs"
    >
      {/* Search Input Field */}
      <div className="relative mb-2">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-content-dim pointer-events-none" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search pod to stream..."
          className="w-full bg-surface-active border border-border-subtle focus:border-accent-primary text-content-main pl-8 pr-2.5 py-1.5 text-xs rounded focus:outline-none placeholder:text-content-dim font-mono"
          autoFocus
        />
      </div>

      {/* Candidate Pods Scrollable List */}
      <div className="max-h-48 overflow-y-auto space-y-0.5 scrollbar-thin">
        {candidatePods.length === 0 ? (
          <div className="text-content-dim text-xs py-3 text-center">No matching pods found</div>
        ) : (
          candidatePods.map((pod) => (
            <button
              key={`${pod.namespace}/${pod.name}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectPod(pod);
                onClose();
                setSearchQuery("");
              }}
              className="w-full text-left hover:bg-surface-hover hover:text-accent-primary px-2 py-1.5 rounded cursor-pointer text-xs flex items-center justify-between group transition-colors"
            >
              <div className="flex items-center space-x-1.5 truncate mr-2 min-w-0">
                <Box className="w-3.5 h-3.5 text-content-dim group-hover:text-accent-primary flex-shrink-0" />
                <span className="truncate font-mono text-content-main group-hover:text-accent-primary" title={pod.name}>
                  {pod.name}
                </span>
              </div>
              <div className="flex items-center space-x-1.5 flex-shrink-0">
                <span className="text-[10px] font-mono text-content-dim truncate max-w-[80px]">
                  {pod.containers?.[0] || pod.name}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    pod.status === "Running"
                      ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/60"
                      : "bg-amber-950/80 text-amber-400 border border-amber-800/60"
                  }`}
                >
                  {pod.status}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
