import { useCallback, useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY, resolveTheme, setThemeAttributes, themeMode, type ThemeMode } from "../lib/themes";

export type { ThemeMode };

// `data-theme` (the palette) and `data-mode` (its dark/light base) on <html> are the single
// source of truth; main.tsx sets them before first render. Every useTheme() subscribes to
// them, so picking a theme in one place re-renders all others (e.g. DocViewer) immediately.

const readTheme = () => resolveTheme(document.documentElement.getAttribute("data-theme"));

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-mode"] });

  // Keep other tabs in sync when the theme is changed elsewhere.
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) applyTheme(resolveTheme(e.newValue), false);
  };
  window.addEventListener("storage", onStorage);

  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onStorage);
  };
}

export function applyTheme(id: string, persist = true): void {
  setThemeAttributes(resolveTheme(id));
  if (!persist) return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, resolveTheme(id));
  } catch {
    // ignore
  }
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dark");
  const setTheme = useCallback((id: string) => applyTheme(id), []);
  // `mode` is what code highlighting, diagrams and the editor follow.
  return { theme, mode: themeMode(theme) as ThemeMode, setTheme };
}
