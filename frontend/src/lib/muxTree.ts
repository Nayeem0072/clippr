// Pure layout model for the Mux panel: a binary tree of splits, like tmux.
// No React here so it can be unit-tested with `bun test`.

export type SplitDir = "row" | "col"; // row = side by side (split right), col = stacked (split down)

export type MuxPaneNode = { type: "pane"; id: string; slug: string | null };
export type MuxSplitNode = { type: "split"; id: string; dir: SplitDir; ratio: number; a: MuxNode; b: MuxNode };
export type MuxNode = MuxPaneNode | MuxSplitNode;

export const MIN_RATIO = 0.1;
export const MAX_RATIO = 0.9;

let counter = 0;
export function newId(prefix = "n"): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyPane(): MuxPaneNode {
  return { type: "pane", id: newId("p"), slug: null };
}

export function clampRatio(r: number): number {
  if (!Number.isFinite(r)) return 0.5;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));
}

/** Replace the node with `id` by `fn(node)`. Returns the same tree object if nothing changed. */
function mapNode(tree: MuxNode, id: string, fn: (n: MuxNode) => MuxNode): MuxNode {
  if (tree.id === id) return fn(tree);
  if (tree.type === "pane") return tree;
  const a = mapNode(tree.a, id, fn);
  const b = mapNode(tree.b, id, fn);
  return a === tree.a && b === tree.b ? tree : { ...tree, a, b };
}

/** Split pane `paneId`; the new pane goes after it (right or below). Returns the new tree and new pane id. */
export function splitPane(
  tree: MuxNode,
  paneId: string,
  dir: SplitDir,
  slug: string | null = null
): { tree: MuxNode; newPaneId: string | null } {
  const target = findNode(tree, paneId);
  if (!target || target.type !== "pane") return { tree, newPaneId: null };
  const fresh: MuxPaneNode = { type: "pane", id: newId("p"), slug };
  const next = mapNode(tree, paneId, (n) => ({ type: "split", id: newId("s"), dir, ratio: 0.5, a: n, b: fresh }));
  return { tree: next, newPaneId: fresh.id };
}

/** Close pane `paneId`; its parent split collapses into the sibling. Closing the only pane leaves an empty one. */
export function closePane(tree: MuxNode, paneId: string): MuxNode {
  if (tree.type === "pane") return tree.id === paneId ? emptyPane() : tree;
  if (tree.a.id === paneId && tree.a.type === "pane") return tree.b;
  if (tree.b.id === paneId && tree.b.type === "pane") return tree.a;
  const a = closePane(tree.a, paneId);
  const b = closePane(tree.b, paneId);
  return a === tree.a && b === tree.b ? tree : { ...tree, a, b };
}

export function setPaneSlug(tree: MuxNode, paneId: string, slug: string | null): MuxNode {
  return mapNode(tree, paneId, (n) => (n.type === "pane" ? { ...n, slug } : n));
}

export function setRatio(tree: MuxNode, splitId: string, ratio: number): MuxNode {
  return mapNode(tree, splitId, (n) => (n.type === "split" ? { ...n, ratio: clampRatio(ratio) } : n));
}

export function findNode(tree: MuxNode, id: string): MuxNode | null {
  if (tree.id === id) return tree;
  if (tree.type === "pane") return null;
  return findNode(tree.a, id) ?? findNode(tree.b, id);
}

/** All panes in visual order (left-to-right, top-to-bottom). */
export function listPanes(tree: MuxNode): MuxPaneNode[] {
  return tree.type === "pane" ? [tree] : [...listPanes(tree.a), ...listPanes(tree.b)];
}

export function findPaneBySlug(tree: MuxNode, slug: string): MuxPaneNode | null {
  return listPanes(tree).find((p) => p.slug === slug) ?? null;
}

export function firstPaneId(tree: MuxNode): string {
  return listPanes(tree)[0].id;
}

const SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/;

function validNode(v: unknown, seen: Set<string>, depth: number): MuxNode | null {
  if (depth > 32 || !v || typeof v !== "object") return null;
  const n = v as Record<string, unknown>;
  if (typeof n.id !== "string" || !n.id || seen.has(n.id)) return null;
  seen.add(n.id);
  if (n.type === "pane") {
    const slug = n.slug === null || n.slug === undefined ? null : n.slug;
    if (slug !== null && (typeof slug !== "string" || !SLUG_RE.test(slug))) return null;
    return { type: "pane", id: n.id, slug };
  }
  if (n.type === "split") {
    if (n.dir !== "row" && n.dir !== "col") return null;
    const a = validNode(n.a, seen, depth + 1);
    const b = validNode(n.b, seen, depth + 1);
    if (!a || !b) return null;
    return { type: "split", id: n.id, dir: n.dir, ratio: clampRatio(Number(n.ratio)), a, b };
  }
  return null;
}

/** Parse a layout restored from storage; anything malformed yields a single empty pane. */
export function parseStoredTree(raw: string | null | undefined): MuxNode {
  if (!raw) return emptyPane();
  try {
    const tree = validNode(JSON.parse(raw), new Set(), 0);
    if (!tree) return emptyPane();
    // Drop duplicate slugs (keep the first) so each paste has at most one editor.
    const seen = new Set<string>();
    let out = tree;
    for (const p of listPanes(tree)) {
      if (!p.slug) continue;
      if (seen.has(p.slug)) out = setPaneSlug(out, p.id, null);
      else seen.add(p.slug);
    }
    return out;
  } catch {
    return emptyPane();
  }
}

/** Extract a paste slug from a raw slug or a URL like https://host/docs/abc123. */
export function parseSlugInput(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/\/docs\/([A-Za-z0-9_-]{1,64})(?:[/?#]|$)/);
  if (m) return m[1];
  return SLUG_RE.test(s) ? s : null;
}

export interface Rect { x: number; y: number; w: number; h: number } // fractions of the container (0..1)
export interface PaneRect extends Rect { id: string; slug: string | null }
export interface DividerRect { splitId: string; dir: SplitDir; ratio: number; parent: Rect; pos: number }

/**
 * Flatten the tree into absolute rectangles. Rendering panes as a flat, id-keyed list
 * (instead of nested flex boxes) means splitting or closing never remounts a pane, so
 * editors keep their drafts, cursor and scroll position.
 */
export function computeLayout(tree: MuxNode): { panes: PaneRect[]; dividers: DividerRect[] } {
  const panes: PaneRect[] = [];
  const dividers: DividerRect[] = [];
  const walk = (n: MuxNode, r: Rect) => {
    if (n.type === "pane") {
      panes.push({ ...r, id: n.id, slug: n.slug });
      return;
    }
    if (n.dir === "row") {
      const wa = r.w * n.ratio;
      walk(n.a, { x: r.x, y: r.y, w: wa, h: r.h });
      walk(n.b, { x: r.x + wa, y: r.y, w: r.w - wa, h: r.h });
      dividers.push({ splitId: n.id, dir: n.dir, ratio: n.ratio, parent: r, pos: r.x + wa });
    } else {
      const ha = r.h * n.ratio;
      walk(n.a, { x: r.x, y: r.y, w: r.w, h: ha });
      walk(n.b, { x: r.x, y: r.y + ha, w: r.w, h: r.h - ha });
      dividers.push({ splitId: n.id, dir: n.dir, ratio: n.ratio, parent: r, pos: r.y + ha });
    }
  };
  walk(tree, { x: 0, y: 0, w: 1, h: 1 });
  return { panes, dividers };
}
