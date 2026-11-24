// Colour themes. Each palette's tokens live in index.css under :root[data-theme="<id>"];
// `mode` says whether it's built on the dark or light base (data-mode on <html>), which is
// what code-highlighting, the diagram canvas and the code editor follow.

export type ThemeMode = "dark" | "light";

export interface ThemeInfo {
  id: string;
  name: string;
  mode: ThemeMode;
  /** Colours for the picker's little preview. Keep in sync with index.css. */
  swatch: { bg: string; card: string; accent: string };
  /**
   * Left out of the picker. Its CSS stays, so unhiding is just removing this flag; a browser
   * that had it saved falls back to the plain theme of the same mode (see resolveTheme).
   */
  hidden?: boolean;
}

export const THEMES: ThemeInfo[] = [
  { id: "dark", name: "Dark", mode: "dark", swatch: { bg: "#1C1C22", card: "#2E2E38", accent: "#00C4FF" } },
  { id: "midnight", name: "Midnight", mode: "dark", swatch: { bg: "#0F1626", card: "#1C2742", accent: "#5AB0FF" } },
  { id: "forest", name: "Forest", mode: "dark", swatch: { bg: "#121A16", card: "#202E27", accent: "#4ADE9E" }, hidden: true },
  { id: "plum", name: "Plum", mode: "dark", swatch: { bg: "#1B1420", card: "#2F2438", accent: "#F472B6" }, hidden: true },
  { id: "charcoal", name: "Charcoal", mode: "dark", swatch: { bg: "#1C1B19", card: "#282623", accent: "#6B95F5" } },
  { id: "espresso", name: "Espresso", mode: "dark", swatch: { bg: "#141311", card: "#201E1B", accent: "#5C8BF2" } },
  { id: "light", name: "Light", mode: "light", swatch: { bg: "#F9F8F6", card: "#FFFFFF", accent: "#007BA8" } },
  { id: "sand", name: "Sand", mode: "light", swatch: { bg: "#FAF6EF", card: "#FFFDF9", accent: "#0F7F78" } },
  { id: "mint", name: "Mint", mode: "light", swatch: { bg: "#F4FAF6", card: "#FFFFFF", accent: "#0B7A55" } },
  { id: "rose", name: "Rose", mode: "light", swatch: { bg: "#FBF6F7", card: "#FFFFFF", accent: "#C92A63" }, hidden: true },
  { id: "lavender", name: "Lavender", mode: "light", swatch: { bg: "#F6F5FB", card: "#FFFFFF", accent: "#5B47D6" } },
  { id: "peach", name: "Peach", mode: "light", swatch: { bg: "#FBF6F2", card: "#FFFFFF", accent: "#B04A0C" }, hidden: true },
];

/** The themes offered in the picker. */
export const PICKER_THEMES: ThemeInfo[] = THEMES.filter((t) => !t.hidden);

export const DEFAULT_THEME = "dark";
export const THEME_STORAGE_KEY = "clippr-theme";

/**
 * A stored value as a theme id the picker offers. A hidden theme falls back to the plain theme
 * of its mode (Dark or Light); anything unknown falls back to Dark.
 */
export function resolveTheme(stored: string | null | undefined): string {
  const t = THEMES.find((x) => x.id === stored);
  if (!t) return DEFAULT_THEME;
  if (t.hidden) return t.mode === "light" ? "light" : DEFAULT_THEME;
  return t.id;
}

export function themeMode(id: string): ThemeMode {
  return THEMES.find((t) => t.id === id)?.mode ?? "dark";
}

/** Sets the palette and its base mode on <html>. */
export function setThemeAttributes(id: string): void {
  const el = document.documentElement;
  el.setAttribute("data-theme", id);
  el.setAttribute("data-mode", themeMode(id));
}
