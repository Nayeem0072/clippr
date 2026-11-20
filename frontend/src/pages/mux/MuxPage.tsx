import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../hooks/useAuth";
import { useMuxLayout } from "../../hooks/useMuxLayout";
import { MuxPane } from "../../components/mux/MuxPane";
import { PastePicker } from "../../components/mux/PastePicker";
import { Button } from "../../components/ui/Button";
import {
  canSplit, computeLayout, findNode, listPanes, ratioBounds,
  type DividerRect, type MuxNode, type Size, type SplitDir, type SplitSide,
} from "../../lib/muxTree";
import { useToast } from "../../components/ui/Toast";
import type { Document } from "../../api/documents";

const GAP = 4; // px on each side of a divider (PANE_GAP = 2 × GAP)

/** Track the canvas's pixel size so split/resize limits can be enforced in px. */
function useElementSize(ref: React.RefObject<HTMLElement>): Size {
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

const SIDE_DIR: Record<SplitSide, SplitDir> = { left: "row", right: "row", down: "col" };

/**
 * Where a newly added paste should go: the preferred pane if it's empty, else a split of
 * it if there's room, else any empty pane, else the largest pane that can still split.
 */
function placeNewPaste(tree: MuxNode, preferredId: string, canvas: Size): { paneId: string; dir: SplitDir } | null {
  const preferred = findNode(tree, preferredId);
  if (preferred?.type === "pane" && preferred.slug === null) return { paneId: preferredId, dir: "row" };
  for (const dir of ["row", "col"] as const) {
    if (canSplit(tree, preferredId, dir, canvas)) return { paneId: preferredId, dir };
  }
  const panes = listPanes(tree);
  const empty = panes.find((p) => p.slug === null);
  if (empty) return { paneId: empty.id, dir: "row" };
  const rects = computeLayout(tree).panes.sort((a, b) => b.w * b.h - a.w * a.h);
  for (const r of rects) {
    for (const dir of ["row", "col"] as const) {
      if (canSplit(tree, r.id, dir, canvas)) return { paneId: r.id, dir };
    }
  }
  return null;
}

function useIsMobile(): boolean {
  const query = "(max-width: 768px)";
  const [mobile, setMobile] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

const pct = (n: number) => `${(n * 100).toFixed(4)}%`;

function Divider({ d, containerRef, onResize }: {
  d: DividerRect;
  containerRef: React.RefObject<HTMLDivElement>;
  onResize: (splitId: string, ratio: number) => void;
}) {
  const row = d.dir === "row";
  const ratioFromPointer = (e: React.PointerEvent) => {
    const box = containerRef.current!.getBoundingClientRect();
    if (row) {
      const fx = (e.clientX - box.left) / box.width;
      return (fx - d.parent.x) / d.parent.w;
    }
    const fy = (e.clientY - box.top) / box.height;
    return (fy - d.parent.y) / d.parent.h;
  };

  const style: React.CSSProperties = row
    ? { left: `calc(${pct(d.pos)} - ${GAP}px)`, top: pct(d.parent.y), width: GAP * 2, height: pct(d.parent.h) }
    : { top: `calc(${pct(d.pos)} - ${GAP}px)`, left: pct(d.parent.x), height: GAP * 2, width: pct(d.parent.w) };

  return (
    <div
      role="separator"
      aria-orientation={row ? "vertical" : "horizontal"}
      aria-valuemin={10}
      aria-valuemax={90}
      aria-valuenow={Math.round(d.ratio * 100)}
      aria-label="Resize panes"
      tabIndex={0}
      className={`mux-divider ${row ? "row" : "col"}`}
      style={style}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) onResize(d.splitId, ratioFromPointer(e));
      }}
      onDoubleClick={() => onResize(d.splitId, 0.5)}
      onKeyDown={(e) => {
        const back = row ? "ArrowLeft" : "ArrowUp";
        const fwd = row ? "ArrowRight" : "ArrowDown";
        if (e.key === back || e.key === fwd) {
          e.preventDefault();
          onResize(d.splitId, d.ratio + (e.key === fwd ? 0.05 : -0.05));
        }
      }}
    />
  );
}

/** Tab label for mobile: reads the paste title from the cache the pane fills (no extra fetch). */
function TabLabel({ slug }: { slug: string | null }) {
  const { data } = useQuery<{ doc: Document }>({ queryKey: ["doc", slug], enabled: false });
  if (!slug) return <>Empty</>;
  return <>{data?.doc.title || slug}</>;
}

export default function MuxPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { tree, panes, focusedId, focus, split, close, resize, openSlug } = useMuxLayout(user?.id);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvas = useElementSize(containerRef);
  const { toast } = useToast();

  // Splits and divider drags respect the minimum pane size (desktop only — mobile shows tabs).
  const splitAllowed = useCallback(
    (paneId: string): Record<SplitSide, boolean> => {
      const row = canSplit(tree, paneId, "row", canvas);
      return { left: row, right: row, down: canSplit(tree, paneId, "col", canvas) };
    },
    [tree, canvas]
  );
  const trySplit = (paneId: string, side: SplitSide) => {
    if (canSplit(tree, paneId, SIDE_DIR[side], canvas)) split(paneId, side);
  };
  const boundedResize = useCallback(
    (splitId: string, ratio: number) => {
      const b = ratioBounds(tree, splitId, canvas);
      if (!b) return; // no ratio keeps both sides above the minimum; leave it as is
      resize(splitId, Math.min(b[1], Math.max(b[0], ratio)));
    },
    [tree, canvas, resize]
  );

  // Picker targets a pane: fill it if empty, otherwise split it.
  const [pickerFor, setPickerFor] = useState<{ paneId: string; dir: SplitDir } | null>(null);

  // Track unsaved panes for the beforeunload guard.
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());
  const onDirtyChange = useCallback((paneId: string, isDirty: boolean) => {
    setDirty((prev) => {
      if (prev.has(paneId) === isDirty) return prev;
      const next = new Set(prev);
      if (isDirty) next.add(paneId);
      else next.delete(paneId);
      return next;
    });
  }, []);
  useEffect(() => {
    if (dirty.size === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty.size]);

  useEffect(() => {
    document.title = "Mux — clippr";
    return () => { document.title = "Clippr"; };
  }, []);

  const layout = useMemo(() => computeLayout(tree), [tree]);
  const openSlugs = useMemo(() => new Set(panes.map((p) => p.slug).filter((s): s is string => !!s)), [panes]);
  const filled = openSlugs.size;
  const focusedSplits = splitAllowed(focusedId);
  const tooSmall = "Pane is too small to split";

  return (
    <div className="mux-root">
      <div className="mux-toolbar">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--color-ink)", margin: 0 }}>Mux</h1>
          <span style={{ fontSize: 12, color: "var(--color-ink-3)" }}>
            {panes.length} {panes.length === 1 ? "pane" : "panes"} · {filled} open
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span className="mux-desktop-only" style={{ display: "contents" }}>
            {(["left", "right", "down"] as const).map((side) => (
              <Button
                key={side}
                size="sm"
                variant="ghost"
                onClick={() => trySplit(focusedId, side)}
                disabled={!focusedSplits[side]}
                title={focusedSplits[side] ? undefined : tooSmall}
              >
                Split {side}
              </Button>
            ))}
          </span>
          <Button size="sm" onClick={() => setPickerFor({ paneId: focusedId, dir: "row" })}>+ Add paste</Button>
        </div>
      </div>

      {isMobile && panes.length > 1 && (
        <div className="mux-tabs" role="tablist" aria-label="Panes">
          {panes.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === focusedId}
              className={`mux-tab ${p.id === focusedId ? "active" : ""}`}
              onClick={() => focus(p.id)}
            >
              {dirty.has(p.id) && <span className="mux-dirty-dot" />}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{i + 1}. <TabLabel slug={p.slug} /></span>
            </button>
          ))}
        </div>
      )}

      <div className="mux-canvas" ref={containerRef}>
        {layout.panes.map((p) => {
          const style: React.CSSProperties = isMobile
            ? { inset: 0, display: p.id === focusedId ? "flex" : "none" }
            : {
                left: `calc(${pct(p.x)} + ${p.x > 0 ? GAP : 0}px)`,
                top: `calc(${pct(p.y)} + ${p.y > 0 ? GAP : 0}px)`,
                width: `calc(${pct(p.w)} - ${(p.x > 0 ? GAP : 0) + (p.x + p.w < 0.9999 ? GAP : 0)}px)`,
                height: `calc(${pct(p.h)} - ${(p.y > 0 ? GAP : 0) + (p.y + p.h < 0.9999 ? GAP : 0)}px)`,
              };
          return (
            <div key={p.id} className="mux-slot" style={style}>
              <MuxPane
                paneId={p.id}
                slug={p.slug}
                focused={p.id === focusedId}
                onFocus={() => focus(p.id)}
                onSplit={(side) => trySplit(p.id, side)}
                canSplit={splitAllowed(p.id)}
                onClose={() => close(p.id)}
                onAddHere={() => setPickerFor({ paneId: p.id, dir: "row" })}
                onDirtyChange={onDirtyChange}
              />
            </div>
          );
        })}
        {!isMobile && layout.dividers.map((d) => (
          <Divider key={d.splitId} d={d} containerRef={containerRef} onResize={boundedResize} />
        ))}
      </div>

      <PastePicker
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        openSlugs={openSlugs}
        onPick={(slug) => {
          if (!pickerFor) return;
          // Already open, or on mobile (tabs, no size limits): add/focus directly.
          if (openSlugs.has(slug) || isMobile) {
            openSlug(slug, pickerFor.paneId, "row");
            return;
          }
          const spot = placeNewPaste(tree, pickerFor.paneId, canvas);
          if (!spot) {
            toast("No room for another pane — close one or widen the window", "error");
            return;
          }
          openSlug(slug, spot.paneId, spot.dir);
        }}
      />
    </div>
  );
}
