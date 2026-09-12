/**
 * Utilities for log level detection, JSON extraction, and semantic syntax highlighting.
 */

export type LogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG" | "DEFAULT";

export interface LogLevelStyles {
  textClass: string;
  bgClass: string;
  borderClass: string;
  badgeClass: string;
}

/**
 * Detects log level across both plaintext tokens and structured JSON / logfmt fields.
 *
 * Rules:
 * - ERROR / FATAL / PANIC:
 *   Matches \b(ERROR|FATAL|PANIC)\b, \[(ERROR|FATAL|PANIC)\], or "level"\s*:\s*"(error|fatal|panic|err)"
 *   Style: text-rose-400, bg-rose-500/10
 * - WARN / WARNING:
 *   Matches \b(WARN|WARNING)\b, \[(WARN|WARNING)\], or "level"\s*:\s*"(warn|warning)"
 *   Style: text-amber-400, bg-amber-500/10
 * - INFO:
 *   Matches \b(INFO)\b, \[(INFO)\], or "level"\s*:\s*"info"
 *   Style: text-slate-200
 * - DEBUG / TRACE:
 *   Matches \b(DEBUG|TRACE)\b, \[(DEBUG|TRACE)\], or "level"\s*:\s*"(debug|trace)"
 *   Style: text-slate-500
 */
export function parseLogLevel(raw: string): LogLevel {
  if (!raw) return "DEFAULT";

  // 1. Structured JSON field matching: "level": "warn", "severity": "ERROR", etc.
  const jsonLevelMatch = raw.match(/"(?:level|lvl|severity)"\s*:\s*"([^"]+)"/i);
  if (jsonLevelMatch) {
    const lvl = jsonLevelMatch[1].toLowerCase();
    if (/^(error|fatal|panic|err)$/.test(lvl)) return "ERROR";
    if (/^(warn|warning)$/.test(lvl)) return "WARN";
    if (/^(info)$/.test(lvl)) return "INFO";
    if (/^(debug|trace)$/.test(lvl)) return "DEBUG";
  }

  // 2. Logfmt field matching: level=error, level=warn, level="info"
  const logfmtLevelMatch = raw.match(/\b(?:level|lvl)=["']?([A-Za-z]+)["']?/i);
  if (logfmtLevelMatch) {
    const lvl = logfmtLevelMatch[1].toLowerCase();
    if (/^(error|fatal|panic|err)$/.test(lvl)) return "ERROR";
    if (/^(warn|warning)$/.test(lvl)) return "WARN";
    if (/^(info)$/.test(lvl)) return "INFO";
    if (/^(debug|trace)$/.test(lvl)) return "DEBUG";
  }

  // 3. Bracketed prefix matching: [ERROR], [WARN], [INFO], [DEBUG]
  if (/\[(ERROR|FATAL|PANIC)\]/i.test(raw)) return "ERROR";
  if (/\[(WARN|WARNING)\]/i.test(raw)) return "WARN";
  if (/\[INFO\]/i.test(raw)) return "INFO";
  if (/\[(DEBUG|TRACE)\]/i.test(raw)) return "DEBUG";

  // 4. Token boundary matching (strict uppercase word tokens to avoid false positives)
  if (/\b(ERROR|FATAL|PANIC)\b/.test(raw)) return "ERROR";
  if (/\b(WARN|WARNING)\b/.test(raw)) return "WARN";
  if (/\bINFO\b/.test(raw)) return "INFO";
  if (/\b(DEBUG|TRACE)\b/.test(raw)) return "DEBUG";

  return "DEFAULT";
}

/**
 * Returns Tailwind style classes for each log level.
 */
export function getLogLevelStyles(level: LogLevel): LogLevelStyles {
  switch (level) {
    case "ERROR":
      return {
        textClass: "text-rose-400",
        bgClass: "bg-rose-500/10",
        borderClass: "border-rose-500",
        badgeClass: "bg-rose-950/60 text-rose-300 border-rose-800",
      };
    case "WARN":
      return {
        textClass: "text-amber-400",
        bgClass: "bg-amber-500/10",
        borderClass: "border-amber-500",
        badgeClass: "bg-amber-950/60 text-amber-300 border-amber-800",
      };
    case "INFO":
      return {
        textClass: "text-slate-200",
        bgClass: "",
        borderClass: "border-slate-600",
        badgeClass: "bg-slate-800 text-slate-300 border-slate-700",
      };
    case "DEBUG":
      return {
        textClass: "text-slate-500",
        bgClass: "",
        borderClass: "border-slate-800",
        badgeClass: "bg-slate-900 text-slate-500 border-slate-800",
      };
    default:
      return {
        textClass: "text-slate-300",
        bgClass: "",
        borderClass: "border-transparent",
        badgeClass: "bg-slate-800 text-slate-400 border-slate-700",
      };
  }
}

export interface ExtractedJsonPayload {
  prefix: string;
  jsonStr: string;
  suffix: string;
  parsed: any;
}

/**
 * Scans a string for balanced braces starting from firstBraceIndex,
 * taking string literals and escape characters into account.
 */
function findBalancedBraceEnd(str: string, firstBraceIndex: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = firstBraceIndex; i < str.length; i++) {
    const char = str[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === "\\") {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
    } else {
      if (char === '"') {
        inString = true;
      } else if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
    }
  }

  return -1;
}

/**
 * Detects if a line contains a valid JSON payload (either pure JSON or mixed with prefix/suffix).
 * Returns extracted segments and parsed object, or null if no valid JSON exists.
 */
export function extractJsonPayload(raw: string): ExtractedJsonPayload | null {
  if (!raw || typeof raw !== "string") return null;

  const trimmed = raw.trim();

  // Fast check: pure JSON object line
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null) {
        const startIdx = raw.indexOf("{");
        const endIdx = raw.lastIndexOf("}");
        return {
          prefix: raw.slice(0, startIdx),
          jsonStr: trimmed,
          suffix: raw.slice(endIdx + 1),
          parsed,
        };
      }
    } catch {
      // Fall through to substring scan
    }
  }

  // Mixed line check: find opening brace
  const firstBrace = raw.indexOf("{");
  if (firstBrace === -1) return null;

  const lastBrace = raw.lastIndexOf("}");
  if (lastBrace <= firstBrace) return null;

  // Try entire substring between first and last brace first
  const fullCandidate = raw.slice(firstBrace, lastBrace + 1);
  try {
    const parsed = JSON.parse(fullCandidate);
    if (typeof parsed === "object" && parsed !== null) {
      return {
        prefix: raw.slice(0, firstBrace),
        jsonStr: fullCandidate,
        suffix: raw.slice(lastBrace + 1),
        parsed,
      };
    }
  } catch {
    // If full substring between outer braces fails, find first balanced brace block
  }

  // Balanced brace scanner
  const balancedEnd = findBalancedBraceEnd(raw, firstBrace);
  if (balancedEnd !== -1 && balancedEnd > firstBrace) {
    const balancedCandidate = raw.slice(firstBrace, balancedEnd + 1);
    try {
      const parsed = JSON.parse(balancedCandidate);
      if (typeof parsed === "object" && parsed !== null) {
        return {
          prefix: raw.slice(0, firstBrace),
          jsonStr: balancedCandidate,
          suffix: raw.slice(balancedEnd + 1),
          parsed,
        };
      }
    } catch {
      // Fall through to null
    }
  }

  return null;
}

export type JsonTokenType =
  | "key"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "punctuation"
  | "whitespace";

export interface JsonToken {
  type: JsonTokenType;
  value: string;
}

const JSON_TOKENIZER_REGEX =
  /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?)|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[{}[\],:]|\s+|[^\s"{}[\]:,]+/g;

/**
 * Tokenizes a JSON string into semantic tokens for syntax highlighting.
 */
export function tokenizeJson(jsonStr: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let match: RegExpExecArray | null;

  JSON_TOKENIZER_REGEX.lastIndex = 0;

  while ((match = JSON_TOKENIZER_REGEX.exec(jsonStr)) !== null) {
    const val = match[0];

    if (val.startsWith('"')) {
      if (val.endsWith(":")) {
        // Key with trailing colon
        const colonIndex = val.lastIndexOf(":");
        const keyPart = val.slice(0, colonIndex);
        tokens.push({ type: "key", value: keyPart });
        tokens.push({ type: "punctuation", value: ":" });
      } else {
        // Quoted string value
        tokens.push({ type: "string", value: val });
      }
    } else if (val === "true" || val === "false") {
      tokens.push({ type: "boolean", value: val });
    } else if (val === "null") {
      tokens.push({ type: "null", value: val });
    } else if (/^-?\d/.test(val)) {
      tokens.push({ type: "number", value: val });
    } else if (/^[{}[\],:]$/.test(val)) {
      tokens.push({ type: "punctuation", value: val });
    } else if (/^\s+$/.test(val)) {
      tokens.push({ type: "whitespace", value: val });
    } else {
      tokens.push({ type: "punctuation", value: val });
    }
  }

  return tokens;
}

/**
 * Pre-normalized log line structure for high-throughput zero-allocation filtering and rendering.
 */
export interface ProcessedLogLine {
  id: string;
  streamId: string;
  namespace: string;
  podName: string;
  containerName: string;
  timestamp?: string;
  line: string;
  raw: string;
  lower: string; // Pre-lowercased string for instant case-insensitive matching
  level: LogLevel; // Pre-computed log level (ERROR, WARN, INFO, DEBUG, DEFAULT)
  isJson: boolean; // Pre-computed boolean indicating presence of JSON payload
  isStderr: boolean;
  color: string;
  isSystemBanner?: boolean;
}

/**
 * Normalizes an incoming log line once at ingestion time, eliminating repeated
 * lowercasing, log level parsing, and JSON checks during subsequent filter and render loops.
 */
export function createProcessedLogLine(params: {
  id?: string;
  streamId: string;
  namespace: string;
  podName: string;
  containerName: string;
  timestamp?: string;
  line: string;
  raw?: string;
  isStderr: boolean;
  color: string;
  isSystemBanner?: boolean;
}): ProcessedLogLine {
  const raw = params.raw ?? params.line;
  const lower = raw.toLowerCase();
  const level = params.isStderr ? "ERROR" : parseLogLevel(raw);
  const trimmed = raw.trim();
  const isJson =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (raw.indexOf("{") !== -1 && raw.lastIndexOf("}") > raw.indexOf("{"));

  return {
    id: params.id || `${params.streamId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    streamId: params.streamId,
    namespace: params.namespace,
    podName: params.podName,
    containerName: params.containerName,
    timestamp: params.timestamp,
    line: params.line,
    raw,
    lower,
    level,
    isJson,
    isStderr: params.isStderr,
    color: params.color,
    isSystemBanner: params.isSystemBanner,
  };
}

