import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Excalidraw, getSceneVersion, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { useTheme } from "../../hooks/useTheme";
import type { DiagramCanvasHandle, DiagramCanvasProps } from "./index";

// The only module that imports Excalidraw statically; it's loaded lazily (see ./index.tsx).

function parseScene(value: string | null) {
  if (!value) return { elements: [], appState: {} };
  try {
    const s = JSON.parse(value);
    return { elements: Array.isArray(s?.elements) ? s.elements : [], appState: s?.appState ?? {} };
  } catch {
    return { elements: [], appState: {} };
  }
}

const UI_OPTIONS = {
  canvasActions: {
    loadScene: false,
    saveToActiveFile: false,
    export: false as const,
    saveAsImage: false,
    toggleTheme: false,
  },
  // Images would be stored inline in the paste; the server rejects them.
  tools: { image: false },
};

const TOOLS_HIDDEN_KEY = "clippr-diagram-tools-hidden";

function readToolsHidden() {
  try {
    return localStorage.getItem(TOOLS_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function ToolsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

const DiagramCanvas = forwardRef<DiagramCanvasHandle, DiagramCanvasProps>(function DiagramCanvas(
  { value, editable, onChange, height = "100%" },
  ref
) {
  const { theme } = useTheme();
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  // The scene is only read on mount; callers remount (key) to show a different saved version.
  const initial = useMemo(() => parseScene(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const lastVersion = useRef(getSceneVersion(initial.elements));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const wrapRef = useRef<HTMLDivElement>(null);
  // Editing on wide canvases: the shape toolbar can be collapsed (remembered per browser).
  const [toolsHidden, setToolsHidden] = useState(readToolsHidden);
  const toggleTools = () =>
    setToolsHidden((hidden) => {
      try {
        localStorage.setItem(TOOLS_HIDDEN_KEY, hidden ? "0" : "1");
      } catch {
        /* storage unavailable: just don't remember it */
      }
      return !hidden;
    });

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // View mode: keep the whole drawing in view, e.g. on a phone or a narrow Mux pane.
  useEffect(() => {
    if (editable || !wrapRef.current) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const fit = () => {
      clearTimeout(t);
      // Excalidraw measures its own container on resize; fit after it has.
      t = setTimeout(() => {
        const api = apiRef.current;
        const els = api?.getSceneElements();
        // Zooms out only as far as needed to show everything; small drawings stay at 100%.
        if (api && els && els.length) api.scrollToContent(els, { fitToContent: true, viewportZoomFactor: 0.9, animate: false });
      }, 120);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(wrapRef.current);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [editable]);

  const serialize = () => {
    const api = apiRef.current;
    if (!api) return value ?? "";
    return serializeAsJSON(api.getSceneElements(), api.getAppState(), {}, "database");
  };

  useImperativeHandle(ref, () => ({
    getJSON: serialize,
    isEmpty: () => (apiRef.current?.getSceneElements().length ?? 0) === 0,
  }));

  return (
    <div
      ref={wrapRef}
      className={`diagram-canvas${editable ? "" : " diagram-canvas--view"}${editable && toolsHidden ? " diagram-canvas--tools-hidden" : ""}`}
      style={{ height }}
      data-testid="diagram-canvas"
    >
      <Excalidraw
        excalidrawAPI={(api) => (apiRef.current = api)}
        initialData={{ elements: initial.elements, appState: { ...initial.appState, viewModeEnabled: !editable }, scrollToContent: true }}
        viewModeEnabled={!editable}
        theme={theme}
        UIOptions={UI_OPTIONS}
        renderTopRightUI={(isMobile) =>
          // Phones use Excalidraw's compact layout, where the toolbar sits elsewhere.
          editable && !isMobile ? (
            <button
              type="button"
              className={`diagram-tools-toggle${toolsHidden ? "" : " active"}`}
              onClick={toggleTools}
              aria-pressed={!toolsHidden}
              aria-label={toolsHidden ? "Show toolbar" : "Hide toolbar"}
              title={toolsHidden ? "Show toolbar" : "Hide toolbar"}
            >
              <ToolsIcon />
            </button>
          ) : null
        }
        onChange={(elements) => {
          if (!editable || !onChangeRef.current) return;
          // Scrolling, zooming and selection don't change the scene version.
          const version = getSceneVersion(elements);
          if (version === lastVersion.current) return;
          lastVersion.current = version;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            const api = apiRef.current;
            if (!api) return;
            const live = api.getSceneElements();
            onChangeRef.current?.(serializeAsJSON(live, api.getAppState(), {}, "database"), live.length === 0);
          }, 300);
        }}
      />
    </div>
  );
});

export default DiagramCanvas;
