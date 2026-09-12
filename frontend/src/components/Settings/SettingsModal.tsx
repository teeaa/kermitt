import React, { useState, useEffect } from "react";
import {
  X,
  Palette,
  Wrench,
  Check,
  Moon,
  Sun,
  Laptop,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  Terminal,
  Minus,
  Plus,
} from "lucide-react";
import { useTheme, ThemeMode, ThemePreset } from "../../hooks/useTheme";
import { useQuickTools, QuickToolId } from "../../hooks/useQuickTools";
import { useTableDensity } from "../../context/TableDensityContext";
import {
  useLogTypography,
  LOG_FONT_FAMILIES,
  DEFAULT_LOG_FONT_SIZE,
  MIN_LOG_FONT_SIZE,
  MAX_LOG_FONT_SIZE,
} from "../../hooks/useLogTypography";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"appearance" | "quickTools">("appearance");
  const { mode, setMode, preset, setPreset, presets } = useTheme();
  const { density, setDensity } = useTableDensity();
  const {
    allTools,
    enabledToolIds,
    toggleTool,
    moveTool,
    resetTools,
  } = useQuickTools();
  const {
    fontId,
    setFontId,
    fontFamily,
    fontSize,
    setFontSize,
    increaseFontSize,
    decreaseFontSize,
    resetTypography,
    availableFonts,
  } = useLogTypography();

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Settings</h2>
              <p className="text-[11px] text-slate-400">
                Customize appearance, theme palettes, and container quick tools
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
        <div className="flex items-center px-5 border-b border-slate-800 bg-slate-950/40 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("appearance")}
            className={`py-2.5 px-3 border-b-2 font-medium flex items-center space-x-1.5 transition-colors ${
              activeTab === "appearance"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Appearance & Themes</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("quickTools")}
            className={`py-2.5 px-3 border-b-2 font-medium flex items-center space-x-1.5 transition-colors ${
              activeTab === "quickTools"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Quick Tools ({enabledToolIds.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5 text-xs">
          {activeTab === "appearance" && (
            <div className="space-y-5">
              {/* Standard Mode Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-2">
                  Display Mode
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: "dark", label: "Dark", icon: Moon },
                      { id: "light", label: "Light", icon: Sun },
                      { id: "system", label: "System", icon: Laptop },
                    ] as { id: ThemeMode; label: string; icon: any }[]
                  ).map((m) => {
                    const isSelected = mode === m.id;
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMode(m.id)}
                        className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-lg border text-xs font-medium transition-all ${
                          isSelected
                            ? "bg-cyan-950/60 border-cyan-400 text-cyan-300 shadow-sm ring-1 ring-cyan-500/30"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Table Display Density */}
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">
                  Table Display Density
                </label>
                <p className="text-[11px] text-slate-400 mb-2">
                  Adjust row height and spacing across workload and resource tables
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDensity("comfortable")}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      density === "comfortable"
                        ? "bg-cyan-950/60 border-cyan-400 text-cyan-300 ring-1 ring-cyan-500/30"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold">Comfortable</span>
                      {density === "comfortable" && (
                        <Check className="w-3.5 h-3.5 text-cyan-400 stroke-[3]" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Standard spacing (h-11) for balanced readability and comfortable clicking
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDensity("compact")}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      density === "compact"
                        ? "bg-cyan-950/60 border-cyan-400 text-cyan-300 ring-1 ring-cyan-500/30"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold">Compact</span>
                      {density === "compact" && (
                        <Check className="w-3.5 h-3.5 text-cyan-400 stroke-[3]" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Condensed rows (h-8) maximized for high-density pod inspection
                    </p>
                  </button>
                </div>
              </div>

              {/* Developer Color Palettes */}
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-2">
                  Developer Color Theme
                </label>
                <div className="space-y-2">
                  {presets.map((p) => {
                    const isSelected = preset === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPreset(p.id)}
                        className={`w-full p-3 rounded-lg border text-left flex items-center justify-between transition-all ${
                          isSelected
                            ? "bg-slate-800/80 border-cyan-400 ring-1 ring-cyan-500/40 shadow-md"
                            : "bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60"
                        }`}
                      >
                        <div className="flex items-center space-x-3 min-w-0 pr-2">
                          {/* Visual color swatch pill */}
                          <div className="flex items-center space-x-1 flex-shrink-0">
                            <span
                              className="w-4 h-4 rounded-full border border-white/10"
                              style={{ backgroundColor: p.previewBg }}
                            />
                            <span
                              className="w-4 h-4 rounded-full border border-white/10"
                              style={{ backgroundColor: p.previewAccent }}
                            />
                            <span
                              className="w-4 h-4 rounded-full border border-white/10"
                              style={{ backgroundColor: p.previewCard }}
                            />
                          </div>

                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-200 truncate">
                              {p.name}
                            </div>
                            <p className="text-[11px] text-slate-400 truncate">
                              {p.description}
                            </p>
                          </div>
                        </div>

                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center flex-shrink-0">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Log Viewer Typography */}
              <div className="pt-3 border-t border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Terminal className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <div>
                      <label className="block text-xs font-semibold text-slate-200">
                        Log Viewer Typography
                      </label>
                      <p className="text-[11px] text-slate-400">
                        Configure monospace font family, text scale, and terminal styling
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={resetTypography}
                    title="Reset to default typography (Default Mono, 12px)"
                    className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-slate-100 text-[11px] transition-colors border border-slate-700/60 cursor-pointer shadow-xs"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                </div>

                {/* Font Family Selection Grid */}
                <div>
                  <span className="block text-[11px] font-medium text-slate-300 mb-1.5">
                    Font Family
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {availableFonts.map((f) => {
                      const isSelected = fontId === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setFontId(f.id)}
                          style={{ fontFamily: f.fontFamily }}
                          className={`p-2 rounded-lg border text-left text-xs transition-all ${
                            isSelected
                              ? "bg-cyan-950/60 border-cyan-400 text-cyan-300 ring-1 ring-cyan-500/30"
                              : "bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="truncate">{f.name}</span>
                            {isSelected && (
                              <Check className="w-3 h-3 text-cyan-400 flex-shrink-0 stroke-[3]" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Font Size Stepper & Slider */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium text-slate-300">
                      Font Size
                    </span>
                    <div className="flex items-center space-x-1 bg-slate-950 border border-slate-800 rounded-md p-0.5">
                      <button
                        type="button"
                        onClick={decreaseFontSize}
                        disabled={fontSize <= MIN_LOG_FONT_SIZE}
                        className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                        title="Decrease font size"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-mono text-xs font-semibold text-cyan-400 px-1.5 min-w-[34px] text-center">
                        {fontSize}px
                      </span>
                      <button
                        type="button"
                        onClick={increaseFontSize}
                        disabled={fontSize >= MAX_LOG_FONT_SIZE}
                        className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                        title="Increase font size"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={MIN_LOG_FONT_SIZE}
                    max={MAX_LOG_FONT_SIZE}
                    step={1}
                    value={fontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                    className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                    <span>{MIN_LOG_FONT_SIZE}px (Compact)</span>
                    <span>{DEFAULT_LOG_FONT_SIZE}px (Default)</span>
                    <span>{MAX_LOG_FONT_SIZE}px (Large)</span>
                  </div>
                </div>

                {/* Live Terminal Preview Card */}
                <div>
                  <span className="block text-[11px] font-medium text-slate-300 mb-1.5">
                    Live Preview
                  </span>
                  <div className="bg-slate-950 rounded-lg border border-slate-800/90 overflow-hidden shadow-inner">
                    {/* Window Title Bar */}
                    <div className="bg-slate-900/90 px-3 py-1.5 border-b border-slate-800 flex items-center justify-between text-[10px] select-none">
                      <div className="flex items-center space-x-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
                        <span className="text-slate-400 ml-1.5 font-mono">terminal — logs</span>
                      </div>
                      <span className="text-slate-500 font-mono text-[10px]">
                        {fontFamily.split(",")[0].replace(/['"]/g, "")} • {fontSize}px
                      </span>
                    </div>

                    {/* Preview Mock Lines */}
                    <div
                      style={{
                        fontFamily: fontFamily,
                        fontSize: `${fontSize}px`,
                        lineHeight: "1.5",
                      }}
                      className="p-3 bg-[var(--terminal-bg)] text-slate-200 overflow-x-auto select-text space-y-1"
                    >
                      <div className="flex items-center">
                        <span className="text-cyan-400 font-bold mr-2 select-none text-[10px]">[INFO]</span>
                        <span className="text-slate-500 mr-2 text-[10px] select-none">2026-09-07T14:32:01.124Z</span>
                        <span className="text-slate-200">Starting server on :8080 (cluster: prod-all)</span>
                      </div>
                      <div className="flex items-center">
                        <span className="text-amber-400 font-bold mr-2 select-none text-[10px]">[WARN]</span>
                        <span className="text-slate-500 mr-2 text-[10px] select-none">2026-09-07T14:32:02.890Z</span>
                        <span className="text-amber-200">Slow query detected on cache read (142ms)</span>
                      </div>
                      <div className="flex items-center">
                        <span className="text-rose-400 font-bold mr-2 select-none text-[10px]">[ERROR]</span>
                        <span className="text-slate-500 mr-2 text-[10px] select-none">2026-09-07T14:32:04.012Z</span>
                        <span className="text-rose-300">Connection timeout: redis-cluster.internal:6379</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "quickTools" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-200">
                    Active Container Actions
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Enable, disable, or reorder the compact quick-action buttons rendered in each pod row.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetTools}
                  className="px-2.5 py-1 text-[11px] rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 flex items-center space-x-1 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>

              <div className="space-y-2">
                {allTools.map((tool) => {
                  const isEnabled = enabledToolIds.includes(tool.id);
                  const Icon = tool.icon;
                  const idx = enabledToolIds.indexOf(tool.id);

                  return (
                    <div
                      key={tool.id}
                      className={`p-3 rounded-lg border flex items-center justify-between transition-colors ${
                        isEnabled
                          ? "bg-slate-950 border-slate-800"
                          : "bg-slate-950/40 border-slate-900 opacity-60"
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0 pr-2">
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => toggleTool(tool.id)}
                          className="rounded border-slate-700 text-cyan-500 focus:ring-0 bg-slate-900 cursor-pointer"
                        />

                        {/* Icon */}
                        <div
                          className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                            tool.isDestructive
                              ? "bg-rose-950/40 text-rose-400 border border-rose-900/50"
                              : "bg-slate-900 text-cyan-400 border border-slate-800"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-semibold text-slate-200">
                              {tool.label}
                            </span>
                            {tool.isDestructive && (
                              <span className="inline-flex items-center space-x-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-950 text-rose-400 border border-rose-900">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                <span>REQUIRES CONFIRMATION</span>
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 truncate">
                            {tool.description}
                          </p>
                        </div>
                      </div>

                      {/* Reorder Buttons (only for enabled tools) */}
                      {isEnabled && (
                        <div className="flex items-center space-x-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => moveTool(tool.id, "up")}
                            disabled={idx === 0}
                            title="Move left"
                            className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-20 rounded hover:bg-slate-800"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveTool(tool.id, "down")}
                            disabled={idx === enabledToolIds.length - 1}
                            title="Move right"
                            className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-20 rounded hover:bg-slate-800"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between flex-shrink-0">
          <span className="text-[10px] text-slate-500">
            Settings persist automatically in local storage
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white transition-colors shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
