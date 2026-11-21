import { describe, it, expect } from "bun:test";
import { checklistProgress, isChecklistEmpty, parseChecklist, serializeChecklist } from "./checklist";

describe("checklist", () => {
  it("round-trips task lines", () => {
    const md = "- [ ] a\n- [x] b";
    expect(parseChecklist(md)).toEqual([{ checked: false, text: "a" }, { checked: true, text: "b" }]);
    expect(serializeChecklist(parseChecklist(md))).toBe(md);
  });
  it("is lenient when parsing and drops empty items when serializing", () => {
    expect(parseChecklist("- [X] a\r\n\r\nplain")).toEqual([{ checked: true, text: "a" }, { checked: false, text: "plain" }]);
    expect(serializeChecklist([{ checked: true, text: "  a " }, { checked: false, text: "  " }])).toBe("- [x] a");
  });
  it("counts progress and emptiness", () => {
    expect(checklistProgress(parseChecklist("- [x] a\n- [ ] b\n- [x] c"))).toEqual({ done: 2, total: 3 });
    expect(isChecklistEmpty("")).toBe(true);
    expect(isChecklistEmpty("- [ ] ")).toBe(true);
    expect(isChecklistEmpty("- [ ] x")).toBe(false);
  });
});
