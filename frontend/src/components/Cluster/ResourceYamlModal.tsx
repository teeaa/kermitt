import React, { useState, useEffect } from "react";
import { X, Copy, Check, FileCode, Loader2, AlertCircle } from "lucide-react";
import { kubeApi } from "../../services/kubeApi";

interface ResourceYamlModalProps {
  isOpen: boolean;
  onClose: () => void;
  kind: string;
  namespace?: string;
  name: string;
  title?: string;
}

export const ResourceYamlModal: React.FC<ResourceYamlModalProps> = ({
  isOpen,
  onClose,
  kind,
  namespace = "",
  name,
  title,
}) => {
  const [yamlContent, setYamlContent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !name) return;

    let active = true;
    setLoading(true);
    setError(null);

    kubeApi
      .getResourceYAML(kind, namespace, name)
      .then((data) => {
        if (active) {
          setYamlContent(data || "# No manifest available");
        }
      })
      .catch((err) => {
        if (active) {
          console.error("Failed to load YAML:", err);
          setError(err?.message || "Failed to load YAML manifest from cluster");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [isOpen, kind, namespace, name]);

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

  const handleCopy = () => {
    if (!yamlContent) return;
    navigator.clipboard.writeText(yamlContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50 flex-shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <FileCode className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-slate-100 text-sm">
                  {title || `${kind.toUpperCase()}: ${name}`}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60">
                  {kind}
                </span>
                {namespace && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/60 text-cyan-300 border border-cyan-800/60">
                    {namespace}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">Live Kubernetes Manifest</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleCopy}
              disabled={loading || !!error}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy YAML</span>
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

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 bg-slate-950 font-mono text-xs text-slate-300 leading-relaxed select-text">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
              <span>Fetching live YAML from cluster...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-800/80 text-rose-300 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">Failed to load manifest</p>
                <p className="text-xs text-rose-400 mt-1">{error}</p>
              </div>
            </div>
          ) : (
            <pre className="overflow-x-auto p-2 font-mono">{yamlContent}</pre>
          )}
        </div>
      </div>
    </div>
  );
};
