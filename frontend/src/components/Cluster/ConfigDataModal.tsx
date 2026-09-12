import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Copy,
  Check,
  FileCode,
  KeyRound,
  Eye,
  EyeOff,
  Search,
  Loader2,
  AlertCircle,
  Database,
  Lock,
} from "lucide-react";
import { kubeApi } from "../../services/kubeApi";

interface ConfigDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  kind: "configmap" | "secret";
  namespace: string;
  name: string;
  onToast?: (message: string, type?: "info" | "success" | "warning" | "error") => void;
}

export const ConfigDataModal: React.FC<ConfigDataModalProps> = ({
  isOpen,
  onClose,
  kind,
  namespace,
  name,
  onToast,
}) => {
  const [activeTab, setActiveTab] = useState<"data" | "yaml">("data");
  const [dataEntries, setDataEntries] = useState<Record<string, string>>({});
  const [yamlContent, setYamlContent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [revealedAll, setRevealedAll] = useState<boolean>(false);
  const [individuallyRevealed, setIndividuallyRevealed] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedYaml, setCopiedYaml] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    if (!isOpen || !name) return;

    let active = true;
    setLoading(true);
    setError(null);
    setRevealedAll(false);
    setIndividuallyRevealed({});
    setSearchQuery("");
    setActiveTab("data");

    const fetchData = async () => {
      try {
        if (kind === "configmap") {
          const res = await kubeApi.getConfigMapData(namespace, name);
          if (active) setDataEntries(res || {});
        } else {
          const res = await kubeApi.getSecretData(namespace, name);
          if (active) setDataEntries(res || {});
        }

        const yaml = await kubeApi.getResourceYAML(kind, namespace, name);
        if (active) setYamlContent(yaml || "# No manifest available");
      } catch (err: any) {
        if (active) {
          console.error(`Failed to load ${kind} data:`, err);
          setError(err?.message || `Failed to fetch ${kind} data`);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchData();

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

  const filteredEntries = useMemo(() => {
    const keys = Object.keys(dataEntries);
    if (!searchQuery.trim()) return keys;
    const q = searchQuery.toLowerCase();
    return keys.filter(
      (k) =>
        k.toLowerCase().includes(q) ||
        (kind === "configmap" && dataEntries[k].toLowerCase().includes(q))
    );
  }, [dataEntries, searchQuery, kind]);

  if (!isOpen) return null;

  const handleCopyValue = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    if (onToast) {
      onToast(`Copied value for "${key}" to clipboard`, "info");
    }
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCopyYaml = () => {
    if (!yamlContent) return;
    navigator.clipboard.writeText(yamlContent);
    setCopiedYaml(true);
    if (onToast) {
      onToast("YAML manifest copied to clipboard", "info");
    }
    setTimeout(() => setCopiedYaml(false), 2000);
  };

  const toggleRevealKey = (key: string) => {
    setIndividuallyRevealed((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const isValueRevealed = (key: string) => {
    if (kind === "configmap") return true;
    if (revealedAll) return true;
    return !!individuallyRevealed[key];
  };

  const isSecret = kind === "secret";
  const entryCount = Object.keys(dataEntries).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50 flex-shrink-0">
          <div className="flex items-center space-x-2.5">
            <div
              className={`w-8 h-8 rounded-lg border flex items-center justify-center ${
                isSecret
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                  : "bg-blue-500/10 border-blue-500/30 text-blue-400"
              }`}
            >
              {isSecret ? <Lock className="w-4 h-4" /> : <Database className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-slate-100 text-sm">{name}</span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    isSecret
                      ? "bg-amber-950/60 text-amber-300 border-amber-800/60"
                      : "bg-blue-950/60 text-blue-300 border-blue-800/60"
                  }`}
                >
                  {isSecret ? "Secret" : "ConfigMap"}
                </span>
                {namespace && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60">
                    {namespace}
                  </span>
                )}
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400">
                  {entryCount} {entryCount === 1 ? "entry" : "entries"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {isSecret ? "Decoded Kubernetes Secret Data" : "Kubernetes ConfigMap Key-Value Pairs"}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* View tabs */}
            <div className="flex bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60">
              <button
                onClick={() => setActiveTab("data")}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors flex items-center space-x-1.5 ${
                  activeTab === "data"
                    ? "bg-slate-700 text-slate-100 shadow-xs"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Data</span>
              </button>
              <button
                onClick={() => setActiveTab("yaml")}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors flex items-center space-x-1.5 ${
                  activeTab === "yaml"
                    ? "bg-slate-700 text-slate-100 shadow-xs"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>YAML</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 p-1.5 rounded-lg transition-colors ml-1"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action / Filter Bar */}
        {activeTab === "data" && !loading && !error && entryCount > 0 && (
          <div className="px-5 py-2.5 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between gap-3 flex-shrink-0">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Filter keys..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950/60 border border-slate-800 rounded-md pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-slate-600 font-mono"
              />
            </div>

            {isSecret && (
              <button
                onClick={() => setRevealedAll(!revealedAll)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center space-x-1.5 border transition-colors ${
                  revealedAll
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30"
                    : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-slate-100"
                }`}
              >
                {revealedAll ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                    <span>Hide Secret Values</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>Reveal Secret Values</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-auto bg-slate-950 p-5">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
              <span className="text-xs">Loading {kind} details from cluster...</span>
            </div>
          ) : error ? (
            <div className="h-64 flex flex-col items-center justify-center text-rose-400 space-y-3">
              <AlertCircle className="w-8 h-8 opacity-80" />
              <span className="text-sm font-medium">Failed to load {kind} data</span>
              <span className="text-xs text-rose-400/80 max-w-md text-center">{error}</span>
            </div>
          ) : activeTab === "data" ? (
            filteredEntries.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-slate-500 space-y-2">
                <Database className="w-7 h-7 opacity-40" />
                <span className="text-xs">
                  {searchQuery
                    ? `No keys matching "${searchQuery}"`
                    : "This resource does not contain any data entries."}
                </span>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredEntries.map((key) => {
                  const val = dataEntries[key] ?? "";
                  const revealed = isValueRevealed(key);
                  const isMultiline = val.includes("\n");
                  const isCopied = copiedKey === key;

                  return (
                    <div
                      key={key}
                      className="border border-slate-800 rounded-lg bg-slate-900/60 overflow-hidden shadow-xs"
                    >
                      {/* Entry Header */}
                      <div className="px-3.5 py-2 bg-slate-850/80 border-b border-slate-800 flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-2 min-w-0">
                          <span className="font-mono text-xs font-semibold text-cyan-300 truncate">
                            {key}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            ({val.length} bytes)
                          </span>
                        </div>

                        <div className="flex items-center space-x-1.5 flex-shrink-0">
                          {isSecret && !revealedAll && (
                            <button
                              onClick={() => toggleRevealKey(key)}
                              className="px-2 py-0.5 rounded text-[11px] font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700/50 flex items-center space-x-1"
                              title={revealed ? "Hide value" : "Reveal value"}
                            >
                              {revealed ? (
                                <>
                                  <EyeOff className="w-3 h-3" />
                                  <span>Hide</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3 h-3" />
                                  <span>Reveal</span>
                                </>
                              )}
                            </button>
                          )}

                          <button
                            onClick={() => handleCopyValue(key, val)}
                            className="px-2 py-0.5 rounded text-[11px] font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 border border-slate-700/60 flex items-center space-x-1 transition-colors"
                            title="Copy value"
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Entry Content */}
                      <div className="p-3 bg-slate-950/40">
                        {revealed ? (
                          <pre
                            className={`font-mono text-xs text-slate-200 leading-relaxed whitespace-pre-wrap break-all ${
                              isMultiline ? "max-h-60 overflow-y-auto pr-1" : ""
                            }`}
                          >
                            {val || <span className="text-slate-600 italic">&lt;empty&gt;</span>}
                          </pre>
                        ) : (
                          <div className="font-mono text-xs text-slate-600 select-none py-0.5 tracking-widest">
                            ••••••••••••••••••••••••••••••••
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* YAML tab */
            <div className="relative">
              <div className="absolute top-2 right-2 z-10">
                <button
                  onClick={handleCopyYaml}
                  className="px-2.5 py-1 rounded bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-slate-100 border border-slate-700 text-xs font-medium flex items-center space-x-1.5 backdrop-blur-xs transition-colors shadow-sm"
                >
                  {copiedYaml ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy YAML</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="font-mono text-xs text-slate-200 leading-relaxed overflow-x-auto whitespace-pre p-4 bg-slate-900/50 rounded-lg border border-slate-800/80">
                {yamlContent}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs text-slate-500 flex-shrink-0">
          <div>
            Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">Esc</kbd> to close
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
