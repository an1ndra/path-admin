import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";

export type ThemeMode = "system" | "light" | "dark";

interface ThemeState {
  mode: ThemeMode;
  colorBlind: boolean;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
  setColorBlind: (on: boolean) => void;
}

const MODE_KEY = "path.admin.theme";
const CB_KEY = "path.admin.colorblind";

const ThemeContext = createContext<ThemeState>(null as unknown as ThemeState);

function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Applies the tokens by attribute: html[data-theme] and html[data-cb]. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      const stored = localStorage.getItem(MODE_KEY);
      return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    } catch {
      return "system";
    }
  });
  const [colorBlind, setColorBlind] = useState(() => {
    try {
      return localStorage.getItem(CB_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [systemDark, setSystemDark] = useState(prefersDark);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolved: "light" | "dark" = mode === "system" ? (systemDark ? "dark" : "light") : mode;

  // Layout effect so a toggle never paints a frame in the old palette.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.cb = colorBlind ? "true" : "false";
    try {
      localStorage.setItem(MODE_KEY, mode);
      localStorage.setItem(CB_KEY, String(colorBlind));
    } catch {
      /* storage can be blocked; the theme still applies for this session */
    }
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", resolved === "dark" ? "#0b0e14" : "#f4f7fb");
  }, [mode, colorBlind, resolved]);

  // Follow a change made in another tab.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === MODE_KEY && event.newValue) {
        setMode(event.newValue === "light" || event.newValue === "dark" ? event.newValue : "system");
      }
      if (event.key === CB_KEY) setColorBlind(event.newValue === "true");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, colorBlind, resolved, setMode, setColorBlind }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeState {
  return useContext(ThemeContext);
}
