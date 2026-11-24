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
}

export const THEMES: ThemeInfo[] = [
  { id: "dark", name: "Dark", mode: "dark", swatch: { bg: "#1C1C22", card: "#2E2E38", accent: "#00C4FF" } },
  { id: "midnight", name: "Midnight", mode: "dark", swatch: { bg: "#0F1626", card: "#1C2742", accent: "#5AB0FF" } },
  { id: "forest", name: "Forest", mode: "dark", swatch: { bg: "#121A16", card: "#202E27", accent: "#4ADE9E" } },
  { id: "plum", name: "Plum", mode: "dark", swatch: { bg: "#1B1420", card: "#2F2438", accent: "#F472B6" } },
  { id: "charcoal", name: "Charcoal", mode: "dark", swatch: { bg: "#1C1B19", card: "#282623", accent: "#6B95F5" } },
  { id: "espresso", name: "Espresso", mode: "dark", swatch: { bg: "#141311", card: "#201E1B", accent: "#5C8BF2" } },
  { id: "light", name: "Light", mode: "light", swatch: { bg: "#F9F8F6", card: "#FFFFFF", accent: "#007BA8" } },
  { id: "sand", name: "Sand", mode: "light", swatch: { bg: "#FAF6EF", card: "#FFFDF9", accent: "#0F7F78" } },
  { id: "mint", name: "Mint", mode: "light", swatch: { bg: "#F4FAF6", card: "#FFFFFF", accent: "#0B7A55" } },
  { id: "rose", name: "Rose", mode: "light", swatch: { bg: "#FBF6F7", card: "#FFFFFF", accent: "#C92A63" } },
  { id: "lavender", name: "Lavender", mode: "light", swatch: { bg: "#F6F5FB", card: "#FFFFFF", accent: "#5B47D6" } },
  { id: "peach", name: "Peach", mode: "light", swatch: { bg: "#FBF6F2", card: "#FFFFFF", accent: "#B04A0C" } },
];

export const DEFAULT_THEME = "dark";
export const THEME_STORAGE_KEY = "clippr-theme";

/** A stored value as a known theme id; anything unknown falls back to Dark. */
export function resolveTheme(stored: string | null | undefined): string {
  return THEMES.some((t) => t.id === stored) ? (stored as string) : DEFAULT_THEME;
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
