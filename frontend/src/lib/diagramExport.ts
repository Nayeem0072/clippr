// Export helpers for diagram pastes. Excalidraw is imported dynamically so it stays out of
// the main bundle.

type Scene = { elements: any[]; appState: Record<string, unknown> };

function parse(json: string): Scene {
  const s = JSON.parse(json);
  return {
    elements: (Array.isArray(s?.elements) ? s.elements : []).filter((e: { isDeleted?: boolean }) => !e?.isDeleted),
    appState: s?.appState ?? {},
  };
}

const MAX_PREVIEW_CHARS = 300_000;

/**
 * What to send when saving a diagram: the scene plus a light-theme SVG snapshot that the
 * server turns into link-preview images. The snapshot is best-effort.
 */
export async function buildDiagramPayload(json: string): Promise<{ content: string; preview_svg?: string }> {
  try {
    const { exportToSvg } = await import("@excalidraw/excalidraw");
    const { elements, appState } = parse(json);
    if (elements.length === 0) return { content: json };
    const svg = await exportToSvg({
      elements,
      appState: { ...appState, exportBackground: true, viewBackgroundColor: "#ffffff", exportWithDarkMode: false },
      files: null,
      exportPadding: 16,
      skipInliningFonts: true,
    });
    // Font-face rules point at font URLs; the server only accepts self-contained SVG.
    const markup = svg.outerHTML.replace(/<style[\s\S]*?<\/style>/gi, "");
    return markup.length <= MAX_PREVIEW_CHARS ? { content: json, preview_svg: markup } : { content: json };
  } catch {
    return { content: json };
  }
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeName(name: string) {
  return (name.trim() || "diagram").replace(/[^\w.-]+/g, "-").slice(0, 80);
}

export async function downloadDiagramPng(json: string, name: string, dark: boolean) {
  const { exportToBlob } = await import("@excalidraw/excalidraw");
  const { elements, appState } = parse(json);
  const blob = await exportToBlob({
    elements,
    appState: { ...appState, exportBackground: true, exportWithDarkMode: dark },
    files: null,
    mimeType: "image/png",
    exportPadding: 24,
    getDimensions: (w: number, h: number) => ({ width: w * 2, height: h * 2, scale: 2 }),
  });
  download(blob, `${safeName(name)}.png`);
}

export async function downloadDiagramSvg(json: string, name: string, dark: boolean) {
  const { exportToSvg } = await import("@excalidraw/excalidraw");
  const { elements, appState } = parse(json);
  const svg = await exportToSvg({
    elements,
    appState: { ...appState, exportBackground: true, exportWithDarkMode: dark },
    files: null,
    exportPadding: 24,
  });
  download(new Blob([svg.outerHTML], { type: "image/svg+xml" }), `${safeName(name)}.svg`);
}
