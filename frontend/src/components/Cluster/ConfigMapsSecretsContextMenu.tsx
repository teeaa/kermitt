import React, { useEffect, useRef } from "react";
import {
  FileCode,
  Copy,
  Check,
  Database,
  Lock,
  Trash2,
  KeyRound,
} from "lucide-react";
import { ipc } from "../../../wailsjs/go/models";

interface ConfigMapsSecretsContextMenuProps {
  x: number;
  y: number;
  item: ipc.ConfigMapSummary | ipc.SecretSummary;
  type: "configmap" | "secret";
  onClose: () => void;
  onViewData: (item: ipc.ConfigMapSummary | ipc.SecretSummary) => void;
  onInspectYaml: (item: ipc.ConfigMapSummary | ipc.SecretSummary) => void;
  onDelete: (item: ipc.ConfigMapSummary | ipc.SecretSummary) => void;
  onToast: (msg: string) => void;
}

export const ConfigMapsSecretsContextMenu: React.FC<ConfigMapsSecretsContextMenuProps> = ({
  x,
  y,
  item,
  type,
  onClose,
  onViewData,
  onInspectYaml,
  onDelete,
  onToast,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [copiedAction, setCopiedAction] = React.useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAction(label);
    onToast(`Copied ${label} to clipboard`);
    setTimeout(() => {
      setCopiedAction(null);
      onClose();
    }, 400);
  };

  const isSecret = type === "secret";
  const typeLabel = isSecret ? "Secret" : "ConfigMap";

  return (
    <div
      ref={menuRef}
      style={{ top: y, left: x }}
      className="fixed z-50 min-w-[210px] bg-slate-900 border border-slate-700/80 rounded-lg shadow-xl py-1.5 text-xs text-slate-200 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none"
    >
      <div className="px-3 py-1.5 border-b border-slate-800 text-[11px] font-mono text-slate-400 truncate flex items-center space-x-1.5">
        {isSecret ? (
          <Lock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        ) : (
          <Database className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
        )}
        <span className="truncate">{item.name}</span>
      </div>

      <div className="py-1">
        <button
          type="button"
          onClick={() => {
            onViewData(item);
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center space-x-2.5 hover:bg-slate-800 text-left transition-colors cursor-pointer"
        >
          <KeyRound className="w-3.5 h-3.5 text-blue-400" />
          <span>View Data &amp; Keys</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onInspectYaml(item);
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center space-x-2.5 hover:bg-slate-800 text-left transition-colors cursor-pointer"
        >
          <FileCode className="w-3.5 h-3.5 text-cyan-400" />
          <span>Inspect YAML</span>
        </button>

        <div className="my-1 border-t border-slate-800" />

        <button
          type="button"
          onClick={() => copyText(item.name, `${typeLabel} Name`)}
          className="w-full px-3 py-1.5 flex items-center space-x-2.5 hover:bg-slate-800 text-left transition-colors cursor-pointer"
        >
          {copiedAction === `${typeLabel} Name` ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-slate-400" />
          )}
          <span>Copy Name</span>
        </button>

        {item.namespace && (
          <button
            type="button"
            onClick={() => copyText(item.namespace, "Namespace")}
            className="w-full px-3 py-1.5 flex items-center space-x-2.5 hover:bg-slate-800 text-left transition-colors cursor-pointer"
          >
            {copiedAction === "Namespace" ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>Copy Namespace</span>
          </button>
        )}

        <div className="my-1 border-t border-slate-800" />

        <button
          type="button"
          onClick={() => {
            onDelete(item);
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center space-x-2.5 hover:bg-rose-950/60 text-rose-300 hover:text-rose-200 text-left transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
          <span>Delete {typeLabel}</span>
        </button>
      </div>
    </div>
  );
};
