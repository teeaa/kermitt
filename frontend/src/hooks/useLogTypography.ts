import { useState, useEffect, useCallback } from "react";

export interface LogFontOption {
  id: string;
  name: string;
  fontFamily: string;
}

export const LOG_FONT_FAMILIES: LogFontOption[] = [
  {
    id: "default",
    name: "Default Mono",
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  {
    id: "jetbrains-mono",
    name: "JetBrains Mono",
    fontFamily: "'JetBrains Mono', monospace",
  },
  {
    id: "fira-code",
    name: "Fira Code",
    fontFamily: "'Fira Code', monospace",
  },
  {
    id: "sf-mono",
    name: "SF Mono",
    fontFamily: "'SF Mono', Monaco, monospace",
  },
  {
    id: "menlo",
    name: "Menlo",
    fontFamily: "Menlo, Monaco, monospace",
  },
  {
    id: "courier-new",
    name: "Courier New",
    fontFamily: "'Courier New', Courier, monospace",
  },
];

export const STORAGE_KEY_FONT_FAMILY = "kermitt_log_font_family";
export const STORAGE_KEY_FONT_SIZE = "kermitt_log_font_size";

export const DEFAULT_LOG_FONT_ID = "default";
export const DEFAULT_LOG_FONT_SIZE = 12;
export const MIN_LOG_FONT_SIZE = 11;
export const MAX_LOG_FONT_SIZE = 16;

export function applyLogTypographyToDocument(fontFamily: string, fontSize: number): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--log-font-family", fontFamily);
  document.documentElement.style.setProperty("--log-font-size", `${fontSize}px`);
}

export interface UseLogTypographyReturn {
  fontId: string;
  setFontId: (id: string) => void;
  fontFamily: string;
  fontSize: number;
  setFontSize: (size: number) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  resetTypography: () => void;
  availableFonts: LogFontOption[];
}

export function useLogTypography(): UseLogTypographyReturn {
  const [fontId, setFontIdState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_FONT_FAMILY);
      if (saved && LOG_FONT_FAMILIES.some((f) => f.id === saved)) {
        return saved;
      }
    } catch {}
    return DEFAULT_LOG_FONT_ID;
  });

  const [fontSize, setFontSizeState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_FONT_SIZE);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= MIN_LOG_FONT_SIZE && parsed <= MAX_LOG_FONT_SIZE) {
          return parsed;
        }
      }
    } catch {}
    return DEFAULT_LOG_FONT_SIZE;
  });

  const currentFont =
    LOG_FONT_FAMILIES.find((f) => f.id === fontId) || LOG_FONT_FAMILIES[0];

  // Synchronize CSS custom properties whenever fontId or fontSize change
  useEffect(() => {
    applyLogTypographyToDocument(currentFont.fontFamily, fontSize);
  }, [currentFont.fontFamily, fontSize]);

  const setFontId = useCallback((id: string) => {
    setFontIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY_FONT_FAMILY, id);
    } catch {}
  }, []);

  const setFontSize = useCallback((size: number) => {
    const clamped = Math.min(MAX_LOG_FONT_SIZE, Math.max(MIN_LOG_FONT_SIZE, Math.round(size)));
    setFontSizeState(clamped);
    try {
      localStorage.setItem(STORAGE_KEY_FONT_SIZE, String(clamped));
    } catch {}
  }, []);

  const increaseFontSize = useCallback(() => {
    setFontSizeState((prev) => {
      const next = Math.min(MAX_LOG_FONT_SIZE, prev + 1);
      try {
        localStorage.setItem(STORAGE_KEY_FONT_SIZE, String(next));
      } catch {}
      return next;
    });
  }, []);

  const decreaseFontSize = useCallback(() => {
    setFontSizeState((prev) => {
      const next = Math.max(MIN_LOG_FONT_SIZE, prev - 1);
      try {
        localStorage.setItem(STORAGE_KEY_FONT_SIZE, String(next));
      } catch {}
      return next;
    });
  }, []);

  const resetTypography = useCallback(() => {
    setFontIdState(DEFAULT_LOG_FONT_ID);
    setFontSizeState(DEFAULT_LOG_FONT_SIZE);
    try {
      localStorage.setItem(STORAGE_KEY_FONT_FAMILY, DEFAULT_LOG_FONT_ID);
      localStorage.setItem(STORAGE_KEY_FONT_SIZE, String(DEFAULT_LOG_FONT_SIZE));
    } catch {}
  }, []);

  return {
    fontId,
    setFontId,
    fontFamily: currentFont.fontFamily,
    fontSize,
    setFontSize,
    increaseFontSize,
    decreaseFontSize,
    resetTypography,
    availableFonts: LOG_FONT_FAMILIES,
  };
}
