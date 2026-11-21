import { describe, it, expect } from "bun:test";
import { diagramText, sanitizePreviewSvg, validateDiagram } from "./diagram.js";

describe("validateDiagram", () => {
  const ok = (els: unknown[] = []) => JSON.stringify({ type: "excalidraw", elements: els, files: {} });

  it("accepts a scene and returns its label text", () => {
    const r = validateDiagram(ok([{ type: "text", text: "Hello" }, { type: "rectangle" }]));
    expect(r).toEqual({ ok: true, text: "Hello" });
  });
  it("accepts a scene with no files key", () => {
    expect(validateDiagram(JSON.stringify({ type: "excalidraw", elements: [] })).ok).toBe(true);
  });
  it("rejects bad input", () => {
    for (const c of ["", "[]", "null", "{bad", JSON.stringify({ type: "excalidraw", elements: {} })]) {
      expect(validateDiagram(c).ok).toBe(false);
    }
    expect(validateDiagram(123).ok).toBe(false);
  });
  it("rejects images and oversized scenes", () => {
    expect(validateDiagram(JSON.stringify({ type: "excalidraw", elements: [], files: { a: {} } })).ok).toBe(false);
    expect(validateDiagram(ok(Array.from({ length: 5001 }, () => ({ type: "line" })))).ok).toBe(false);
  });
});

describe("diagramText", () => {
  it("joins live text elements and skips deleted ones", () => {
    expect(diagramText([
      { type: "text", text: " A " }, { type: "text", text: "B", isDeleted: true },
      { type: "arrow" }, { type: "text", text: "C" }, null,
    ])).toBe("A\nC");
    expect(diagramText("nope")).toBe("");
  });
});

describe("sanitizePreviewSvg", () => {
  const base = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
  it("keeps plain SVG, data: and fragment refs", () => {
    expect(sanitizePreviewSvg(base)).toBe(base);
    const withRefs = '<svg xmlns="http://www.w3.org/2000/svg"><use href="#a"/><image href="data:image/png;base64,AA"/></svg>';
    expect(sanitizePreviewSvg(withRefs)).toBe(withRefs);
  });
  it("drops scripts, handlers, foreignObject and external refs", () => {
    for (const s of [
      "<svg><script>x</script></svg>",
      '<svg onload="x()"></svg>',
      "<svg><foreignObject/></svg>",
      '<svg><image href="https://evil.test/a.png"/></svg>',
      '<svg><image xlink:href="file:///etc/passwd"/></svg>',
      "<svg><style>@font-face{src:url(https://x.test/f.woff)}</style></svg>",
      "<div>not svg</div>",
      `<svg>${"a".repeat(300_001)}</svg>`,
    ]) {
      expect(sanitizePreviewSvg(s)).toBeNull();
    }
    expect(sanitizePreviewSvg(undefined)).toBeNull();
  });
});
