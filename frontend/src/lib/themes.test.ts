import { describe, it, expect } from "bun:test";
import { PICKER_THEMES, THEMES, resolveTheme, themeMode } from "./themes";

describe("themes", () => {
  it("has 12 palettes with unique ids, 6 dark and 6 light", () => {
    expect(THEMES).toHaveLength(12);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(12);
    expect(THEMES.filter((t) => t.mode === "dark")).toHaveLength(6);
    expect(THEMES.filter((t) => t.mode === "light")).toHaveLength(6);
  });
  it("the picker offers 8, with Forest, Plum, Rose and Peach hidden", () => {
    expect(PICKER_THEMES.map((t) => t.id)).toEqual(["dark", "midnight", "charcoal", "espresso", "light", "sand", "mint", "lavender"]);
  });
  it("resolves stored values, including the old light/dark ones", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("midnight")).toBe("midnight");
    expect(resolveTheme("nope")).toBe("dark");
    expect(resolveTheme(null)).toBe("dark");
    expect(themeMode("sand")).toBe("light");
    expect(themeMode("plum")).toBe("dark");
  });
  it("a saved hidden theme falls back to Dark or Light, matching its mode", () => {
    expect(resolveTheme("forest")).toBe("dark");
    expect(resolveTheme("plum")).toBe("dark");
    expect(resolveTheme("rose")).toBe("light");
    expect(resolveTheme("peach")).toBe("light");
  });
});
