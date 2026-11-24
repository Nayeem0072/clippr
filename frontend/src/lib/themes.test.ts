import { describe, it, expect } from "bun:test";
import { THEMES, resolveTheme, themeMode } from "./themes";

describe("themes", () => {
  it("has 12 palettes with unique ids, 6 dark and 6 light", () => {
    expect(THEMES).toHaveLength(12);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(12);
    expect(THEMES.filter((t) => t.mode === "dark")).toHaveLength(6);
    expect(THEMES.filter((t) => t.mode === "light")).toHaveLength(6);
  });
  it("resolves stored values, including the old light/dark ones", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("forest")).toBe("forest");
    expect(resolveTheme("nope")).toBe("dark");
    expect(resolveTheme(null)).toBe("dark");
    expect(themeMode("sand")).toBe("light");
    expect(themeMode("plum")).toBe("dark");
  });
});
