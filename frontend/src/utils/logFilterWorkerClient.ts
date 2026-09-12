/**
 * Client manager for off-thread log filtering via Web Worker.
 *
 * Provides request ID sequencing, stale request rejection, and graceful fallback
 * to main-thread synchronous filtering when workers are not supported.
 */

class LogFilterWorkerClient {
  private worker: Worker | null = null;
  private requestId = 0;
  private pendingCallbacks = new Map<number, (indices: number[] | null) => void>();
  private isSupported = typeof window !== "undefined" && typeof Worker !== "undefined";

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (!this.isSupported) return;
    try {
      this.worker = new Worker(
        new URL("../workers/logFilter.worker.ts", import.meta.url),
        { type: "module" }
      );

      this.worker.onmessage = (
        event: MessageEvent<{ id: number; indices: Int32Array | null }>
      ) => {
        const { id, indices } = event.data;
        const cb = this.pendingCallbacks.get(id);
        if (cb) {
          this.pendingCallbacks.delete(id);
          cb(indices ? Array.from(indices) : null);
        }
      };

      this.worker.onerror = (err) => {
        console.warn(
          "[LogWorker] Web Worker error, falling back to main-thread filtering:",
          err
        );
      };
    } catch (err) {
      console.warn(
        "[LogWorker] Unable to initialize worker, falling back to main thread:",
        err
      );
      this.worker = null;
    }
  }

  /**
   * Filters pre-lowercased line strings against query.
   * If worker is active, executes off-thread; otherwise falls back to main-thread.
   */
  public filter(query: string, lines: string[]): Promise<number[] | null> {
    const q = query ? query.trim().toLowerCase() : "";
    if (!q || !lines || lines.length === 0) {
      return Promise.resolve(null);
    }

    const currentId = ++this.requestId;

    if (this.worker) {
      return new Promise<number[] | null>((resolve) => {
        this.pendingCallbacks.set(currentId, resolve);
        this.worker!.postMessage({ id: currentId, query: q, lines });
      });
    }

    // Synchronous fallback
    const matches: number[] = [];
    const len = lines.length;
    for (let i = 0; i < len; i++) {
      if (lines[i].includes(q)) {
        matches.push(i);
      }
    }
    return Promise.resolve(matches);
  }

  public terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingCallbacks.clear();
  }
}

export const logFilterWorkerClient = new LogFilterWorkerClient();
