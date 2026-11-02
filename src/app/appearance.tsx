import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeId = "hybrid" | "bizriva" | "sandala" | "kobolink";
export type Mode = "light" | "dark";

export interface ThemeOption {
  id: ThemeId;
  name: string;
  origin: string;
  description: string;
  recommended?: boolean;
  /** Literal swatch colours for the picker preview only. */
  swatches: string[];
}

export const THEMES: ThemeOption[] = [
  { id: "hybrid", name: "Hybrid", origin: "Bizriva + Sandala", recommended: true,
    description: "Teal Bizriva shell, warm cream chat pane, amber for COD and risk alerts.",
    swatches: ["#F7FBFB", "#1C2D36", "#149090", "#FAF7EE", "#F6D77A"] },
  { id: "bizriva", name: "Bizriva", origin: "Repo 3 · commerce-customer-compass",
    description: "Teal brand, dark slate sidebar, Plus Jakarta Sans, dense and premium.",
    swatches: ["#F7FBFB", "#1C2D36", "#149090"] },
  { id: "sandala", name: "Sandala", origin: "Repo 1 · chat-to-checkout-hub",
    description: "Warm cream, deep green, amber, serif headings, roomy and friendly.",
    swatches: ["#FAF7EE", "#1F6B4A", "#F6D77A"] },
  { id: "kobolink", name: "Kobolink", origin: "Repo 2 · ecommmb",
    description: "Cool white, navy sidebar, blue, Inter Tight. Standard SaaS admin.",
    swatches: ["#F8FAFC", "#1B2233", "#2F5FD8"] },
];

export const DEFAULT_THEME: ThemeId = "hybrid";
const THEME_KEY = "bizriva.theme";
const MODE_KEY = "bizriva.mode";

/**
 * Runs in <head> before first paint so the saved theme applies without a flash.
 * Storage can be unavailable (private mode, blocked site data) — fall back quietly.
 */
export const APPEARANCE_BOOT_SCRIPT = `(function(){var t="${DEFAULT_THEME}",m="light";try{var s=localStorage.getItem("${THEME_KEY}");if(s==="hybrid"||s==="bizriva"||s==="sandala"||s==="kobolink")t=s;var d=localStorage.getItem("${MODE_KEY}");if(d==="dark"||d==="light")m=d;}catch(e){}var r=document.documentElement;r.setAttribute("data-theme",t);r.classList.toggle("dark",m==="dark");})();`;

interface AppearanceCtx {
  theme: ThemeId;
  mode: Mode;
  setTheme: (t: ThemeId) => void;
  setMode: (m: Mode) => void;
}

const Ctx = createContext<AppearanceCtx | null>(null);

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the choice lasts for this visit only */
  }
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);
  const [mode, setModeState] = useState<Mode>("light");

  useEffect(() => {
    const root = document.documentElement;
    const t = root.getAttribute("data-theme");
    if (THEMES.some((x) => x.id === t)) setThemeState(t as ThemeId);
    setModeState(root.classList.contains("dark") ? "dark" : "light");
  }, []);

  const setTheme = useCallback((t: ThemeId) => {
    document.documentElement.setAttribute("data-theme", t);
    save(THEME_KEY, t);
    setThemeState(t);
  }, []);

  const setMode = useCallback((m: Mode) => {
    document.documentElement.classList.toggle("dark", m === "dark");
    save(MODE_KEY, m);
    setModeState(m);
  }, []);

  return <Ctx.Provider value={{ theme, mode, setTheme, setMode }}>{children}</Ctx.Provider>;
}

export function useAppearance() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppearance must be used inside AppearanceProvider");
  return ctx;
}
