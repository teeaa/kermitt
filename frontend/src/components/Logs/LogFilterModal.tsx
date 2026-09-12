import React, { useState } from "react";
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Check,
  Filter,
  ShieldCheck,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react";
import { LogFilterRule } from "../../hooks/useLogFilters";

interface LogFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  rules: LogFilterRule[];
  onAddRule: (type: "include" | "exclude", pattern: string) => void;
  onUpdateRule: (id: string, updates: Partial<LogFilterRule>) => void;
  onToggleRule: (id: string) => void;
  onDeleteRule: (id: string) => void;
  onClearRules: () => void;
}

export const LogFilterModal: React.FC<LogFilterModalProps> = ({
  isOpen,
  onClose,
  rules,
  onAddRule,
  onUpdateRule,
  onToggleRule,
  onDeleteRule,
  onClearRules,
}) => {
  const [newType, setNewType] = useState<"include" | "exclude">("exclude");
  const [newPattern, setNewPattern] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPattern, setEditPattern] = useState("");
  const [editType, setEditType] = useState<"include" | "exclude">("include");

  if (!isOpen) return null;

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPattern.trim()) return;
    onAddRule(newType, newPattern.trim());
    setNewPattern("");
  };

  const handleStartEdit = (rule: LogFilterRule) => {
    setEditingId(rule.id);
    setEditPattern(rule.pattern);
    setEditType(rule.type);
  };

  const handleSaveEdit = (id: string) => {
    if (!editPattern.trim()) return;
    onUpdateRule(id, {
      pattern: editPattern.trim(),
      type: editType,
    });
    setEditingId(null);
  };

  const handleApplyPreset = (type: "include" | "exclude", pattern: string) => {
    onAddRule(type, pattern);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-2">
            <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              Log Filtering Engine
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Add Rule Form */}
          <form onSubmit={handleAddSubmit} className="space-y-3 bg-slate-950 p-3.5 rounded-lg border border-slate-800">
            <div className="text-xs font-medium text-slate-300 flex items-center justify-between">
              <span>Add New Filter Rule</span>
              <span className="text-[10px] text-slate-500 font-normal">
                Exclude drops matching lines • Include retains matching lines
              </span>
            </div>

            <div className="flex items-center space-x-2">
              {/* Type Switcher */}
              <div className="flex rounded-md p-0.5 bg-slate-900 border border-slate-700 text-xs flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setNewType("exclude")}
                  className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center space-x-1 ${
                    newType === "exclude"
                      ? "bg-rose-950 text-rose-300 border border-rose-800 shadow-xs"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <ShieldAlert className="w-3 h-3" />
                  <span>Exclude</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNewType("include")}
                  className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center space-x-1 ${
                    newType === "include"
                      ? "bg-emerald-950 text-emerald-300 border border-emerald-800 shadow-xs"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <ShieldCheck className="w-3 h-3" />
                  <span>Include</span>
                </button>
              </div>

              {/* Pattern Input */}
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  placeholder={
                    newType === "exclude"
                      ? "e.g. GET /healthz or debug"
                      : "e.g. ERROR or exception"
                  }
                  value={newPattern}
                  onChange={(e) => setNewPattern(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded px-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={!newPattern.trim()}
                className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:pointer-events-none text-white rounded text-xs font-medium flex items-center space-x-1 transition-colors flex-shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          </form>

          {/* Quick Presets */}
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Quick Rule Presets
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleApplyPreset("exclude", "GET /healthz")}
                className="px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 text-[11px] text-slate-300 border border-slate-800 hover:border-slate-700 transition-colors"
              >
                Exclude <code className="text-rose-400 font-mono">/healthz</code>
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset("exclude", "kube-probe")}
                className="px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 text-[11px] text-slate-300 border border-slate-800 hover:border-slate-700 transition-colors"
              >
                Exclude <code className="text-rose-400 font-mono">kube-probe</code>
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset("include", "ERROR")}
                className="px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 text-[11px] text-slate-300 border border-slate-800 hover:border-slate-700 transition-colors"
              >
                Include only <code className="text-emerald-400 font-mono">ERROR</code>
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset("include", "WARN")}
                className="px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 text-[11px] text-slate-300 border border-slate-800 hover:border-slate-700 transition-colors"
              >
                Include only <code className="text-emerald-400 font-mono">WARN</code>
              </button>
            </div>
          </div>

          {/* Active Rules List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Configured Rules ({rules.length})
              </div>
              {rules.length > 0 && (
                <button
                  type="button"
                  onClick={onClearRules}
                  className="text-[11px] text-slate-500 hover:text-rose-400 transition-colors"
                >
                  Clear all rules
                </button>
              )}
            </div>

            {rules.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-lg">
                No active filter rules. Add an include or exclude rule above to filter the log stream.
              </div>
            ) : (
              <div className="space-y-1.5">
                {rules.map((rule) => {
                  const isEditing = editingId === rule.id;

                  if (isEditing) {
                    return (
                      <div
                        key={rule.id}
                        className="p-2 bg-slate-950 border border-cyan-500 rounded-lg flex items-center space-x-2"
                      >
                        <select
                          value={editType}
                          onChange={(e) =>
                            setEditType(e.target.value as "include" | "exclude")
                          }
                          className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded px-2 py-1 focus:outline-none"
                        >
                          <option value="exclude">Exclude</option>
                          <option value="include">Include</option>
                        </select>
                        <input
                          type="text"
                          value={editPattern}
                          onChange={(e) => setEditPattern(e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(rule.id)}
                          className="p-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="p-1 text-slate-400 hover:text-slate-200"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={rule.id}
                      className={`p-2 rounded-lg border flex items-center justify-between transition-colors ${
                        rule.active
                          ? "bg-slate-950 border-slate-800"
                          : "bg-slate-950/40 border-slate-900 opacity-60"
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                        {/* Checkbox toggle */}
                        <input
                          type="checkbox"
                          checked={rule.active}
                          onChange={() => onToggleRule(rule.id)}
                          className="rounded border-slate-700 text-cyan-500 focus:ring-0 focus:ring-offset-0 bg-slate-900 cursor-pointer"
                        />

                        {/* Type Badge */}
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                            rule.type === "include"
                              ? "bg-emerald-950/80 text-emerald-400 border-emerald-800/80"
                              : "bg-rose-950/80 text-rose-400 border-rose-800/80"
                          }`}
                        >
                          {rule.type}
                        </span>

                        {/* Pattern Text */}
                        <span className="text-xs font-mono text-slate-200 truncate">
                          &quot;{rule.pattern}&quot;
                        </span>
                      </div>

                      <div className="flex items-center space-x-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(rule)}
                          title="Edit rule"
                          className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteRule(rule.id)}
                          title="Delete rule"
                          className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between flex-shrink-0">
          <div className="text-[11px] text-slate-500">
            Rules evaluate sequentially: excludes drop lines, includes retain lines.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
