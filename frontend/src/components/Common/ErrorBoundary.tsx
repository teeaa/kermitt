import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertOctagon, RotateCcw, ChevronDown, ChevronRight, Copy, Check } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[CRITICAL-UI-ERROR] Unhandled component error caught by ErrorBoundary:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleCopy = () => {
    const errorText = [
      `Error: ${this.state.error?.message || "Unknown error"}`,
      `Stack: ${this.state.error?.stack || "No stack trace"}`,
      `Component Stack: ${this.state.errorInfo?.componentStack || "No component stack"}`,
    ].join("\n\n");

    navigator.clipboard.writeText(errorText);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  public render() {
    if (this.state.hasError) {
      const { error, errorInfo, showDetails, copied } = this.state;
      const title = this.props.fallbackTitle || "Application Error Encountered";

      return (
        <div className="min-h-[360px] w-full flex items-center justify-center p-6">
          <div className="w-full max-w-2xl bg-surface border border-rose-900/60 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-rose-950/40 border-b border-rose-900/40 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
                  <AlertOctagon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-rose-200">{title}</h2>
                  <p className="text-xs text-rose-400/80">
                    A component encountered an unhandled error and was safely isolated.
                  </p>
                </div>
              </div>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-4">
              {/* Primary Error Message */}
              <div className="p-3.5 rounded-lg bg-rose-950/20 border border-rose-900/40 text-xs font-mono text-rose-300 break-all">
                {error?.message || "An unexpected error occurred during rendering."}
              </div>

              {/* Collapsible Details */}
              <div className="border border-subtle rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => this.setState({ showDetails: !showDetails })}
                  className="w-full px-4 py-2.5 flex items-center justify-between bg-surface-hover hover:bg-surface-active text-xs font-medium text-muted transition-colors cursor-pointer"
                >
                  <span className="flex items-center space-x-2">
                    {showDetails ? (
                      <ChevronDown className="w-4 h-4 text-dim" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-dim" />
                    )}
                    <span>Stack Trace & Diagnostics</span>
                  </span>
                  <span className="text-[10px] text-dim uppercase tracking-wider">
                    {showDetails ? "Hide" : "Show"}
                  </span>
                </button>

                {showDetails && (
                  <div className="p-4 bg-app/80 border-t border-subtle space-y-3">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={this.handleCopy}
                        className="flex items-center space-x-1.5 px-2.5 py-1 text-[11px] rounded bg-surface hover:bg-surface-hover border border-subtle text-muted hover:text-main transition-colors cursor-pointer"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Diagnostic Info</span>
                          </>
                        )}
                      </button>
                    </div>

                    {error?.stack && (
                      <pre className="text-[11px] font-mono text-rose-300/90 whitespace-pre-wrap overflow-x-auto max-h-48 p-3 rounded bg-app border border-rose-950/40">
                        {error.stack}
                      </pre>
                    )}

                    {errorInfo?.componentStack && (
                      <pre className="text-[11px] font-mono text-dim whitespace-pre-wrap overflow-x-auto max-h-40 p-3 rounded bg-app border border-subtle">
                        {errorInfo.componentStack}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="bg-surface-hover px-6 py-3.5 flex items-center justify-between border-t border-subtle">
              <span className="text-xs text-dim">
                Kermitt v0.1.0 • Desktop Client Guard
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={this.handleReset}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-active text-muted hover:text-main border border-subtle transition-colors cursor-pointer"
                >
                  Try Again
                </button>
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reload Application</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
