import React, { useState, useEffect, useRef } from "react";
import { Layers, X, AlertTriangle, ArrowRight } from "lucide-react";

export interface ScaleReplicasModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScale: (newReplicas: number) => void;
  itemName: string;
  resourceType: "deployment" | "statefulset";
  namespace: string;
  currentReplicas: number;
  mutationsDisabled?: boolean;
}

export const ScaleReplicasModal: React.FC<ScaleReplicasModalProps> = ({
  isOpen,
  onClose,
  onScale,
  itemName,
  resourceType,
  namespace,
  currentReplicas,
  mutationsDisabled = false,
}) => {
  const [replicas, setReplicas] = useState<number>(currentReplicas);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setReplicas(currentReplicas);
      setTimeout(() => cancelBtnRef.current?.focus(), 50);
    }
  }, [isOpen, currentReplicas]);

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

  const typeLabel = resourceType === "deployment" ? "Deployment" : "StatefulSet";
  const presets = [0, 1, 2, 3, 5, 10];

  const handleConfirm = () => {
    onScale(replicas);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-800 flex items-center justify-center text-cyan-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Scale {typeLabel}
              </h2>
              <div className="flex items-center space-x-1.5 mt-0.5 text-xs text-slate-400">
                <span className="font-mono text-slate-300 truncate max-w-[200px]" title={itemName}>
                  {itemName}
                </span>
                <span>•</span>
                <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                  {namespace}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs text-slate-300">
          {/* Replica Count Adjuster */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-4 flex flex-col items-center justify-center space-y-3">
            <div className="flex items-center space-x-4 text-sm">
              <div className="flex items-center flex-col">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                  Current
                </span>
                <span className="font-mono text-lg font-bold text-slate-300">
                  {currentReplicas}
                </span>
              </div>

              <ArrowRight className="w-4 h-4 text-slate-600" />

              <div className="flex flex-col items-center">
                <span className="text-[10px] text-cyan-400 uppercase tracking-wider font-semibold">
                  Desired
                </span>
                <div className="flex items-center space-x-2 mt-0.5">
                  <button
                    type="button"
                    disabled={replicas <= 0}
                    onClick={() => setReplicas((prev) => Math.max(0, prev - 1))}
                    className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 font-bold flex items-center justify-center transition-colors"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={replicas}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setReplicas(isNaN(val) ? 0 : Math.max(0, Math.min(100, val)));
                    }}
                    className="w-14 text-center font-mono text-lg font-bold bg-slate-900 border border-slate-700 rounded py-0.5 text-cyan-300 focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    disabled={replicas >= 100}
                    onClick={() => setReplicas((prev) => Math.min(100, prev + 1))}
                    className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 font-bold flex items-center justify-center transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center space-x-1.5 pt-2 border-t border-slate-800/80 w-full justify-center">
              <span className="text-[11px] text-slate-500 mr-1">Presets:</span>
              {presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReplicas(preset)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium transition-colors ${
                    replicas === preset
                      ? "bg-cyan-900/60 text-cyan-300 border border-cyan-700"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Scale to zero warning */}
          {replicas === 0 && (
            <div className="flex items-start space-x-2.5 p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-300">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
              <div>
                <span className="font-semibold block text-[11px]">Warning: Scaling to 0</span>
                <span className="text-[11px] text-amber-300/90 leading-relaxed">
                  Scaling to 0 replicas will terminate all active pods for this workload.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-end space-x-2.5">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors text-xs font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={replicas === currentReplicas}
            onClick={handleConfirm}
            className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:hover:bg-cyan-600 text-white font-medium text-xs transition-colors shadow-sm shadow-cyan-950/40"
          >
            Scale to {replicas} {replicas === 1 ? "Replica" : "Replicas"}
          </button>
        </div>
      </div>
    </div>
  );
};
