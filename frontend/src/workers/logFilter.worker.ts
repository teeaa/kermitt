/**
 * Web Worker for high-performance off-thread log filtering.
 *
 * Scans arrays of pre-lowercased strings against search terms,
 * returning matching row indices as a zero-copy transferable Int32Array.
 */

export interface LogFilterRequest {
  id: number;
  query: string;
  lines: string[]; // Array of pre-lowercased line strings
}

export interface LogFilterResponse {
  id: number;
  indices: Int32Array | null;
}

self.onmessage = (event: MessageEvent<LogFilterRequest>) => {
  const { id, query, lines } = event.data;

  const trimmed = query ? query.trim().toLowerCase() : "";
  if (!trimmed || !lines || lines.length === 0) {
    self.postMessage({ id, indices: null });
    return;
  }

  const len = lines.length;
  const matches: number[] = [];

  for (let i = 0; i < len; i++) {
    if (lines[i].includes(trimmed)) {
      matches.push(i);
    }
  }

  const int32 = new Int32Array(matches);
  // Post message with transferable ArrayBuffer for zero-copy memory transfer
  (self as unknown as Worker).postMessage(
    { id, indices: int32 },
    [int32.buffer]
  );
};
