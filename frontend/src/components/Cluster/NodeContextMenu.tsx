import React, { useEffect, useRef } from "react";
import {
  FileCode,
  Copy,
  Check,
  Server,
  Network,
  Cpu,
} from "lucide-react";
import { ipc } from "../../../wailsjs/go/models";

interface NodeContextMenuProps {
  x: number;
  y: number;
  node: ipc.NodeSummary;
  onClose: () => void;
  onInspectYaml: (node: ipc.NodeSummary) => void;
  onToast: (msg: string) => void;
}

export const NodeContextMenu: React.FC<NodeContextMenuProps> = ({
  x,
  y,
  node,
  onClose,
  onInspectYaml,
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

  return (
    <div
      ref={menuRef}
      style={{ top: y, left: x }}
      className="fixed z-50 min-w-[210px] bg-slate-900 border border-slate-700/80 rounded-lg shadow-xl py-1.5 text-xs text-slate-200 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none"
    >
      <div className="px-3 py-1.5 border-b border-slate-800 text-[11px] font-mono text-slate-400 truncate flex items-center space-x-1.5">
        <Server className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
        <span className="truncate">{node.name}</span>
      </div>

      <div className="py-1">
        <button
          type="button"
          onClick={() => {
            onInspectYaml(node);
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
          onClick={() => copyText(node.name, "Node Name")}
          className="w-full px-3 py-1.5 flex items-center space-x-2.5 hover:bg-slate-800 text-left transition-colors cursor-pointer"
        >
          {copiedAction === "Node Name" ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-slate-400" />
          )}
          <span>Copy Node Name</span>
        </button>

        <button
          type="button"
          onClick={() => copyText(node.internalIp, "Internal IP")}
          className="w-full px-3 py-1.5 flex items-center space-x-2.5 hover:bg-slate-800 text-left transition-colors cursor-pointer"
        >
          {copiedAction === "Internal IP" ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Network className="w-3.5 h-3.5 text-slate-400" />
          )}
          <span>Copy Internal IP</span>
        </button>

        <button
          type="button"
          onClick={() => copyText(node.version, "Version")}
          className="w-full px-3 py-1.5 flex items-center space-x-2.5 hover:bg-slate-800 text-left transition-colors cursor-pointer"
        >
          {copiedAction === "Version" ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Cpu className="w-3.5 h-3.5 text-slate-400" />
          )}
          <span>Copy Kubelet Version</span>
        </button>
      </div>
    </div>
  );
};
