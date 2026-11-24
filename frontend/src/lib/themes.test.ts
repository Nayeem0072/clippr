import { describe, it, expect } from "bun:test";
import { THEMES, resolveTheme, themeMode } from "./themes";

describe("themes", () => {
  it("has 8 palettes with unique ids, 4 dark and 4 light", () => {
    expect(THEMES).toHaveLength(8);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(8);
    expect(THEMES.filter((t) => t.mode === "dark")).toHaveLength(4);
    expect(THEMES.filter((t) => t.mode === "light")).toHaveLength(4);
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
