import React, { useState } from "react";
import { X, Trash2, Check, Sparkles } from "lucide-react";
import { PinnedItem } from "../../hooks/usePinnedItems";

interface PinCustomizeModalProps {
  pin: PinnedItem;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<PinnedItem>) => void;
  onDelete: (id: string) => void;
}

const PRESET_EMOJIS = [
  "🚀",
  "🔐",
  "⚡",
  "📦",
  "🐞",
  "🛑",
  "🌐",
  "💾",
  "🛡️",
  "⚙️",
  "📊",
  "🔍",
  "🎯",
  "🔥",
];

export const COLOR_PALETTES: {
  id: string;
  name: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  dotColor: string;
}[] = [
  {
    id: "emerald",
    name: "Emerald",
    bgClass: "bg-emerald-950/80",
    textClass: "text-emerald-400",
    borderClass: "border-emerald-800/80",
    dotColor: "bg-emerald-500",
  },
  {
    id: "sky",
    name: "Sky",
    bgClass: "bg-sky-950/80",
    textClass: "text-sky-400",
    borderClass: "border-sky-800/80",
    dotColor: "bg-sky-500",
  },
  {
    id: "rose",
    name: "Rose",
    bgClass: "bg-rose-950/80",
    textClass: "text-rose-400",
    borderClass: "border-rose-800/80",
    dotColor: "bg-rose-500",
  },
  {
    id: "amber",
    name: "Amber",
    bgClass: "bg-amber-950/80",
    textClass: "text-amber-400",
    borderClass: "border-amber-800/80",
    dotColor: "bg-amber-500",
  },
  {
    id: "purple",
    name: "Purple",
    bgClass: "bg-purple-950/80",
    textClass: "text-purple-400",
    borderClass: "border-purple-800/80",
    dotColor: "bg-purple-500",
  },
  {
    id: "indigo",
    name: "Indigo",
    bgClass: "bg-indigo-950/80",
    textClass: "text-indigo-400",
    borderClass: "border-indigo-800/80",
    dotColor: "bg-indigo-500",
  },
  {
    id: "fuchsia",
    name: "Fuchsia",
    bgClass: "bg-fuchsia-950/80",
    textClass: "text-fuchsia-400",
    borderClass: "border-fuchsia-800/80",
    dotColor: "bg-fuchsia-500",
  },
  {
    id: "slate",
    name: "Slate",
    bgClass: "bg-slate-800",
    textClass: "text-slate-300",
    borderClass: "border-slate-700",
    dotColor: "bg-slate-400",
  },
];

export const PinCustomizeModal: React.FC<PinCustomizeModalProps> = ({
  pin,
  isOpen,
  onClose,
  onSave,
  onDelete,
}) => {
  const [label, setLabel] = useState(pin.label);
  const [emoji, setEmoji] = useState(pin.emoji || "📦");
  const [color, setColor] = useState(pin.color || "emerald");
  const [podPattern, setPodPattern] = useState(pin.podPattern || "");

  if (!isOpen) return null;

  const activeColorObj =
    COLOR_PALETTES.find((c) => c.id === color) || COLOR_PALETTES[0];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(pin.id, {
      label: label.trim() || pin.label,
      emoji: emoji.trim() || "📦",
      color,
      podPattern: podPattern.trim(),
    });
    onClose();
  };

  const handleDelete = () => {
    onDelete(pin.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              Customize Pinned Item
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

        <form onSubmit={handleSave} className="p-5 space-y-4">
          {/* Live Preview Card */}
          <div className="flex items-center space-x-3 p-3 bg-slate-950/80 rounded-lg border border-slate-800">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg shadow-sm border ${activeColorObj.bgClass} ${activeColorObj.borderClass}`}
            >
              {emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-200 truncate">
                {label || "Untitled Pin"}
              </div>
              <div className="text-[11px] text-slate-400 truncate font-mono">
                {pin.namespace} • {podPattern || "*"}
              </div>
            </div>
          </div>

          {/* Display Label */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Display Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Auth Service"
              className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-md px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
              autoFocus
            />
          </div>

          {/* Emoji Picker */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Icon / Emoji
            </label>
            <div className="flex items-center space-x-2 mb-2">
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={4}
                className="w-12 h-9 text-center bg-slate-950 border border-slate-700 rounded-md text-base text-slate-100 focus:outline-none focus:border-cyan-500"
              />
              <span className="text-[11px] text-slate-400">
                Choose a preset or type any emoji
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {PRESET_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setEmoji(em)}
                  className={`h-8 rounded-md flex items-center justify-center text-sm transition-all ${
                    emoji === em
                      ? "bg-cyan-950 border border-cyan-500 scale-105"
                      : "bg-slate-950 border border-slate-800 hover:bg-slate-800"
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          {/* Color Palette Swatches */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Accent Color
            </label>
            <div className="grid grid-cols-4 gap-2">
              {COLOR_PALETTES.map((swatch) => {
                const isSelected = color === swatch.id;
                return (
                  <button
                    key={swatch.id}
                    type="button"
                    onClick={() => setColor(swatch.id)}
                    className={`flex items-center space-x-2 p-2 rounded-lg border text-left transition-all ${
                      isSelected
                        ? "bg-slate-800 border-cyan-400 ring-1 ring-cyan-400"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-full ${swatch.dotColor} flex-shrink-0`}
                    />
                    <span className="text-xs text-slate-200 truncate">
                      {swatch.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pod Pattern */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Workload Filter Pattern
            </label>
            <input
              type="text"
              value={podPattern}
              onChange={(e) => setPodPattern(e.target.value)}
              placeholder="e.g. redis-*"
              className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-md px-3 py-2 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none transition-colors"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Applied to the Pods table filter when this shortcut is clicked.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleDelete}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/60 border border-rose-900/60 transition-colors flex items-center space-x-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Pin</span>
            </button>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-md text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white transition-colors flex items-center space-x-1 shadow-sm"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
