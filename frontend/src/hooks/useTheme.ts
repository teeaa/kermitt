import { useState, useEffect, useCallback } from "react";

export type ThemeMode = "dark" | "light" | "system";

export type ThemePreset =
  | "kermitt"
  | "catppuccin"
  | "tokyo-night"
  | "nord"
  | "dracula";

export interface ThemeOption {
  id: ThemePreset;
  name: string;
  description: string;
  previewBg: string;
  previewAccent: string;
  previewCard: string;
  accentName: string;
}

export const THEME_PRESETS: ThemeOption[] = [
  {
    id: "kermitt",
    name: "Kermitt Slate / Emerald",
    description: "Default high-contrast deep slate with vibrant emerald and cyan accents",
    previewBg: "#080c14",
    previewAccent: "#10b981",
    previewCard: "#0f172a",
    accentName: "Emerald & Cyan",
  },
  {
    id: "catppuccin",
    name: "Catppuccin Mocha",
    description: "Soothing pastel palette with deep blue-violet undertones",
    previewBg: "#11111b",
    previewAccent: "#89b4fa",
    previewCard: "#181825",
    accentName: "Sapphire & Lavender",
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    description: "Vibrant neon-infused cyberpunk dark palette from downtown Tokyo",
    previewBg: "#16161e",
    previewAccent: "#7aa2f7",
    previewCard: "#1a1b26",
    accentName: "Neon Blue & Cyan",
  },
  {
    id: "nord",
    name: "Nord",
    description: "Arctic, north-bluish clean aesthetic inspired by polar frost",
    previewBg: "#242933",
    previewAccent: "#88c0d0",
    previewCard: "#2e3440",
    accentName: "Frost & Polar Night",
  },
  {
    id: "dracula",
    name: "Dracula",
    description: "Classic gothic dark theme with electric purple, pink, and green highlights",
    previewBg: "#1e1f29",
    previewAccent: "#bd93f9",
    previewCard: "#282a36",
    accentName: "Purple & Neon Green",
  },
];

const STORAGE_KEY_MODE = "kermitt_theme_mode";
const STORAGE_KEY_PRESET = "kermitt_theme_preset";

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_MODE) as ThemeMode;
      if (stored === "dark" || stored === "light" || stored === "system") {
        return stored;
      }
    } catch {}
    return "dark";
  });

  const [preset, setPreset] = useState<ThemePreset>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PRESET);
      if (stored === "slate") return "kermitt";
      if (stored === "tokyonight") return "tokyo-night";
      if (THEME_PRESETS.some((t) => t.id === stored)) {
        return stored as ThemePreset;
      }
    } catch {}
    return "kermitt";
  });

  // Apply data-theme and data-mode attributes to document root element
  const applyTheme = useCallback((targetMode: ThemeMode, targetPreset: ThemePreset) => {
    const root = document.documentElement;

    let isDark = true;
    if (targetMode === "light") {
      isDark = false;
    } else if (targetMode === "system") {
      isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }

    const effectiveTheme = isDark ? targetPreset : "light";

    root.setAttribute("data-mode", isDark ? "dark" : "light");
    root.setAttribute("data-theme", effectiveTheme);

    if (isDark) {
      root.classList.add("dark");
      root.classList.remove("light");
    } else {
      root.classList.add("light");
      root.classList.remove("dark");
    }
  }, []);

  // Sync when mode or preset changes
  useEffect(() => {
    applyTheme(mode, preset);
    try {
      localStorage.setItem(STORAGE_KEY_MODE, mode);
      localStorage.setItem(STORAGE_KEY_PRESET, preset);
    } catch {}
  }, [mode, preset, applyTheme]);

  // Listen for OS system theme change if mode === 'system'
  useEffect(() => {
    if (mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system", preset);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [mode, preset, applyTheme]);

  return {
    mode,
    setMode,
    preset,
    setPreset,
    presets: THEME_PRESETS,
  };
}
