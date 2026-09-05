import { createContext, useContext, useState, useEffect } from "react";

/**
 * Centralised light / dark theme state.
 *
 * Reads from and writes to localStorage under `indulge-theme`.
 * The same key is used by the FOUC-prevention script in index.html so the
 * two are always in agreement.
 *
 * On first visit (no stored preference) the system prefers-color-scheme is
 * respected.  After that the stored preference wins on every reload.
 */

const STORAGE_KEY = "indulge-theme";

const ThemeContext = createContext({
  dark: false,
  toggle: () => {},
  setTheme: (_theme) => {},
});

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "dark")  return true;
      if (stored === "light") return false;
      // No saved preference — respect the OS.
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    } catch {
      return false;
    }
  });

  // Keep the DOM class and localStorage in sync.
  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
    } catch {
      /* storage blocked — silently ignore */
    }
  }, [dark]);

  const toggle  = () => setDark((d) => !d);
  const setTheme = (theme) => setDark(theme === "dark");

  return (
    <ThemeContext.Provider value={{ dark, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Drop-in hook — usable from any component inside ThemeProvider. */
export function useTheme() {
  return useContext(ThemeContext);
}
