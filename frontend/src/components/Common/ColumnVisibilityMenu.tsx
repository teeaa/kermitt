import React from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { ColumnDefinition } from "../../hooks/useTableColumns";

export interface ColumnVisibilityMenuProps<TKey extends string = string> {
  columns: ColumnDefinition<TKey>[];
  columnVisibility: Record<TKey, boolean>;
  onToggleVisibility: (key: TKey) => void;
  onResetToDefaults: () => void;
  onClose: () => void;
  position: { x: number; y: number } | null;
  menuRef: React.RefObject<HTMLDivElement | null>;
  title?: string;
}

export function ColumnVisibilityMenu<TKey extends string = string>({
  columns,
  columnVisibility,
  onToggleVisibility,
  onResetToDefaults,
  onClose,
  position,
  menuRef,
  title = "Customize Columns",
}: ColumnVisibilityMenuProps<TKey>) {
  if (!position) return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-md shadow-2xl py-1 w-56 text-xs text-zinc-200 select-none animate-in fade-in zoom-in-95 duration-100 font-sans"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase border-b border-zinc-800 flex items-center justify-between">
        <span>{title}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded transition-colors"
          title="Close menu"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      <div className="py-1 max-h-64 overflow-y-auto">
        {columns.map((col) => {
          const isVisible = columnVisibility[col.key] ?? true;
          const isRequired = col.required || col.key === "name";

          return (
            <button
              key={col.key}
              type="button"
              disabled={isRequired}
              onClick={() => {
                if (isRequired) return;
                onToggleVisibility(col.key);
              }}
              className={`w-full px-3 py-1.5 text-left flex items-center justify-between transition-colors ${
                isRequired
                  ? "opacity-60 cursor-not-allowed bg-zinc-900/40"
                  : "hover:bg-zinc-800 cursor-pointer"
              }`}
            >
              <span className="flex items-center space-x-2">
                <span
                  className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                    isVisible
                      ? "bg-cyan-500 border-cyan-400 text-slate-950"
                      : "border-zinc-600 bg-zinc-800"
                  }`}
                >
                  {isVisible && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                </span>
                <span className="text-zinc-200 truncate">{col.label}</span>
              </span>
              {isRequired && (
                <span className="text-[10px] text-zinc-500 flex-shrink-0">Required</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="border-t border-zinc-800 pt-1 mt-1 px-2 pb-1 flex flex-col space-y-1">
        <button
          type="button"
          onClick={() => {
            onResetToDefaults();
            onClose();
          }}
          className="w-full text-left px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
        >
          Reset to default columns
        </button>
      </div>
    </div>,
    document.body
  );
}
