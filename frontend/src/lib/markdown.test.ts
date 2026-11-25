import { describe, it, expect } from "bun:test";
import { isMarkdownDoc, wrapTables } from "./markdown";

describe("markdown", () => {
  it("recognises markdown pastes only", () => {
    expect(isMarkdownDoc("markdown")).toBe(true);
    expect(isMarkdownDoc("plaintext")).toBe(false);
    expect(isMarkdownDoc(null)).toBe(false);
  });
  it("wraps every table in a scroll box", () => {
    const out = wrapTables("<table><tr><td>a</td></tr></table><p>x</p><table></table>");
    expect(out).toBe(
      '<div class="md-table-wrap" tabindex="0"><table><tr><td>a</td></tr></table></div><p>x</p>' +
        '<div class="md-table-wrap" tabindex="0"><table></table></div>',
    );
  });
  it("leaves html without tables alone", () => {
    expect(wrapTables("<h1>Hi</h1>")).toBe("<h1>Hi</h1>");
  });
});
