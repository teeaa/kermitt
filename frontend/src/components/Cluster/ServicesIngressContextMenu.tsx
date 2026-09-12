import React, { useEffect, useRef } from "react";
import {
  FileCode,
  Copy,
  Check,
  Network,
  Globe,
} from "lucide-react";
import { ipc } from "../../../wailsjs/go/models";

interface ServicesIngressContextMenuProps {
  x: number;
  y: number;
  item: ipc.ServiceSummary | ipc.IngressSummary;
  type: "service" | "ingress";
  onClose: () => void;
  onInspectYaml: (item: ipc.ServiceSummary | ipc.IngressSummary, type: "service" | "ingress") => void;
  onToast: (msg: string) => void;
}

export const ServicesIngressContextMenu: React.FC<ServicesIngressContextMenuProps> = ({
  x,
  y,
  item,
  type,
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

  const isService = type === "service";
  const svc = isService ? (item as ipc.ServiceSummary) : null;
  const ing = !isService ? (item as ipc.IngressSummary) : null;

  return (
    <div
      ref={menuRef}
      style={{ top: y, left: x }}
      className="fixed z-50 min-w-[210px] bg-slate-900 border border-slate-700/80 rounded-lg shadow-xl py-1.5 text-xs text-slate-200 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none"
    >
      <div className="px-3 py-1.5 border-b border-slate-800 text-[11px] font-mono text-slate-400 truncate flex items-center space-x-1.5">
        {isService ? (
          <Network className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
        ) : (
          <Globe className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
        )}
        <span className="truncate">{item.name}</span>
        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
          {item.namespace}
        </span>
      </div>

      <div className="py-1">
        <button
          type="button"
          onClick={() => {
            onInspectYaml(item, type);
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
          onClick={() => copyText(item.name, isService ? "Service Name" : "Ingress Name")}
          className="w-full px-3 py-1.5 flex items-center space-x-2.5 hover:bg-slate-800 text-left transition-colors cursor-pointer"
        >
          {copiedAction === (isService ? "Service Name" : "Ingress Name") ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-slate-400" />
          )}
          <span>Copy Name</span>
        </button>

        {isService && svc && (
          <>
            {svc.clusterIp && svc.clusterIp !== "<none>" && (
              <button
                type="button"
                onClick={() => copyText(svc.clusterIp, "Cluster IP")}
                className="w-full px-3 py-1.5 flex items-center space-x-2.5 hover:bg-slate-800 text-left transition-colors cursor-pointer"
              >
                {copiedAction === "Cluster IP" ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>Copy Cluster IP</span>
              </button>
            )}

            {svc.externalIp && svc.externalIp !== "<none>" && svc.externalIp !== "<pending>" && (
              <button
                type="button"
                onClick={() => copyText(svc.externalIp, "External IP")}
                className="w-full px-3 py-1.5 flex items-center space-x-2.5 hover:bg-slate-800 text-left transition-colors cursor-pointer"
              >
                {copiedAction === "External IP" ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>Copy External IP</span>
              </button>
            )}

            {svc.ports && svc.ports !== "<none>" && (
              <button
                type="button"
                onClick={() => copyText(svc.ports, "Ports")}
                className="w-full px-3 py-1.5 flex items-center space-x-2.5 hover:bg-slate-800 text-left transition-colors cursor-pointer"
              >
                {copiedAction === "Ports" ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>Copy Ports</span>
              </button>
            )}
          </>
        )}

        {!isService && ing && (
          <>
            {ing.hosts && ing.hosts !== "*" && (
              <button
                type="button"
                onClick={() => copyText(ing.hosts, "Hosts")}
                className="w-full px-3 py-1.5 flex items-center space-x-2.5 hover:bg-slate-800 text-left transition-colors cursor-pointer"
              >
                {copiedAction === "Hosts" ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>Copy Hosts</span>
              </button>
            )}

            {ing.endpoints && ing.endpoints !== "<none>" && (
              <button
                type="button"
                onClick={() => copyText(ing.endpoints, "Endpoints")}
                className="w-full px-3 py-1.5 flex items-center space-x-2.5 hover:bg-slate-800 text-left transition-colors cursor-pointer"
              >
                {copiedAction === "Endpoints" ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>Copy Endpoints</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
