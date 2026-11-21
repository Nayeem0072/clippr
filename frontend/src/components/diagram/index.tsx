import { forwardRef, lazy, Suspense } from "react";
import { Spinner } from "../ui/Spinner";

// Diagram pastes: language "diagram", content = an Excalidraw scene as JSON.
// Excalidraw is large, so it's only downloaded when a diagram is shown or drawn.

export const DIAGRAM_LANGUAGE = "diagram";

export const isDiagramDoc = (language: string | null | undefined) => language === DIAGRAM_LANGUAGE;

export const EMPTY_SCENE = JSON.stringify({
  type: "excalidraw",
  version: 2,
  source: "clippr",
  elements: [],
  appState: {},
  files: {},
});

/** True when a serialized scene has nothing drawn in it (or can't be read). */
export function isDiagramEmpty(json: string | null | undefined): boolean {
  if (!json) return true;
  try {
    const els = JSON.parse(json)?.elements;
    return !Array.isArray(els) || els.every((e: { isDeleted?: boolean }) => e?.isDeleted);
  } catch {
    return true;
  }
}

export interface DiagramCanvasProps {
  /** Serialized scene to start from. Read on mount only: give the canvas a `key` to load another. */
  value: string | null;
  editable: boolean;
  /** Debounced; fires only when the drawing itself changes (not on scroll/zoom). */
  onChange?: (json: string, isEmpty: boolean) => void;
  height?: string | number;
}

export interface DiagramCanvasHandle {
  /** The live scene, including strokes from the last few hundred ms that onChange hasn't sent yet. */
  getJSON: () => string;
  isEmpty: () => boolean;
}

const DiagramCanvasImpl = lazy(() => import("./DiagramCanvas"));

export const LazyDiagramCanvas = forwardRef<DiagramCanvasHandle, DiagramCanvasProps>(function LazyDiagramCanvas(props, ref) {
  return (
    <Suspense
      fallback={
        <div style={{ height: props.height ?? "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Spinner />
        </div>
      }
    >
      <DiagramCanvasImpl ref={ref} {...props} />
    </Suspense>
  );
});
