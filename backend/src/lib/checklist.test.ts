import { describe, it, expect } from "bun:test";
import { parseChecklist, serializeChecklist, validateChecklist } from "./checklist.js";

describe("checklist", () => {
  it("parses and serializes task lines", () => {
    const items = parseChecklist("- [ ] a\n- [x] b\n- [X]  c  ");
    expect(items).toEqual([
      { checked: false, text: "a" },
      { checked: true, text: "b" },
      { checked: true, text: "c" },
    ]);
    expect(serializeChecklist(items!)).toBe("- [ ] a\n- [x] b\n- [x] c");
  });
  it("rejects lines that aren't tasks", () => {
    expect(parseChecklist("- [ ] a\nhello")).toBeNull();
    expect(parseChecklist("* [ ] a")).toBeNull();
  });
  it("validates and returns searchable text", () => {
    expect(validateChecklist("- [x] a\r\n- [ ] b")).toEqual({
      ok: true,
      items: [{ checked: true, text: "a" }, { checked: false, text: "b" }],
      content: "- [x] a\n- [ ] b",
      text: "a\nb",
    });
    for (const bad of ["", "   ", "\n\n", "- [ ] ", 42]) expect(validateChecklist(bad).ok).toBe(false);
  });
});
