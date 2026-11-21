// Diagram pastes: `language = "diagram"`, `content` = an Excalidraw scene serialized as JSON.

export const DIAGRAM_LANGUAGE = "diagram";
export const MAX_DIAGRAM_BYTES = 1_000_000;
export const MAX_DIAGRAM_ELEMENTS = 5_000;
export const MAX_PREVIEW_SVG_BYTES = 300_000;

export function isDiagram(language: string | null | undefined): boolean {
  return language === DIAGRAM_LANGUAGE;
}

interface SceneElement {
  type?: unknown;
  text?: unknown;
  isDeleted?: unknown;
}

/** The words in a diagram's text elements (standalone text and shape/arrow labels). */
export function diagramText(elements: unknown): string {
  if (!Array.isArray(elements)) return "";
  const parts: string[] = [];
  for (const el of elements as SceneElement[]) {
    if (!el || typeof el !== "object" || el.isDeleted === true) continue;
    if (el.type === "text" && typeof el.text === "string" && el.text.trim()) {
      parts.push(el.text.trim());
    }
  }
  return parts.join("\n");
}

export type DiagramResult = { ok: true; text: string } | { ok: false; error: string };

/** Checks that `content` is a usable Excalidraw scene and returns its searchable text. */
export function validateDiagram(content: unknown): DiagramResult {
  if (typeof content !== "string" || !content) return { ok: false, error: "content is required" };
  if (Buffer.byteLength(content, "utf8") > MAX_DIAGRAM_BYTES) {
    return { ok: false, error: "Diagram is too large (max 1 MB)" };
  }
  let scene: unknown;
  try {
    scene = JSON.parse(content);
  } catch {
    return { ok: false, error: "Diagram content must be valid JSON" };
  }
  if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
    return { ok: false, error: "Diagram content must be an Excalidraw scene" };
  }
  const s = scene as { type?: unknown; elements?: unknown; files?: unknown };
  if (s.type !== "excalidraw" || !Array.isArray(s.elements)) {
    return { ok: false, error: "Diagram content must be an Excalidraw scene" };
  }
  if (s.elements.length > MAX_DIAGRAM_ELEMENTS) {
    return { ok: false, error: `Diagram has too many elements (max ${MAX_DIAGRAM_ELEMENTS})` };
  }
  if (s.files !== undefined && s.files !== null) {
    if (typeof s.files !== "object" || Object.keys(s.files as object).length > 0) {
      return { ok: false, error: "Images aren't supported in diagrams" };
    }
  }
  return { ok: true, text: diagramText(s.elements) };
}

/**
 * A browser-made SVG snapshot, used only to draw link-preview images (rendered by resvg,
 * never served to browsers). Anything suspicious is dropped rather than stored.
 */
export function sanitizePreviewSvg(svg: unknown): string | null {
  if (typeof svg !== "string") return null;
  const s = svg.trim();
  if (!s.startsWith("<svg") || !s.endsWith("</svg>")) return null;
  if (Buffer.byteLength(s, "utf8") > MAX_PREVIEW_SVG_BYTES) return null;
  if (/<script|<foreignObject|\son[a-z]+\s*=/i.test(s)) return null;
  // Only inline (data:) or fragment references; nothing that points at a file or the network.
  const refs = s.matchAll(/(?:xlink:)?href\s*=\s*["']([^"']*)["']|url\(\s*["']?([^"')]*)/gi);
  for (const m of refs) {
    const ref = (m[1] ?? m[2] ?? "").trim();
    if (ref && !ref.startsWith("#") && !ref.startsWith("data:")) return null;
  }
  return s;
}
