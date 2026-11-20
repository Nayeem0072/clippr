import { useCallback, useEffect, useState } from "react";
import {
  closePane, findNode, findPaneBySlug, firstPaneId, listPanes, parseStoredTree,
  setPaneSlug, setRatio, splitPane, splitSideToDir, type MuxNode, type SplitDir, type SplitSide,
} from "../lib/muxTree";

// Mux layout (which pastes are open, splits and sizes) lives in this browser only.
// Paste content is never stored here — edits go to the API.

interface State {
  tree: MuxNode;
  focusedId: string;
}

const keyFor = (userId: number | undefined) => `clippr-mux:${userId ?? "anon"}`;

function load(userId: number | undefined): State {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(keyFor(userId));
  } catch {
    // storage unavailable
  }
  const tree = parseStoredTree(raw);
  return { tree, focusedId: firstPaneId(tree) };
}

export function useMuxLayout(userId: number | undefined) {
  const [state, setState] = useState<State>(() => load(userId));

  // Debounced persistence (dragging a divider updates the ratio on every pointer move).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(keyFor(userId), JSON.stringify(state.tree));
      } catch {
        // ignore
      }
    }, 250);
    return () => clearTimeout(t);
  }, [state.tree, userId]);

  const focus = useCallback((paneId: string) => {
    setState((s) => (s.focusedId === paneId ? s : { ...s, focusedId: paneId }));
  }, []);

  const split = useCallback((paneId: string, side: SplitSide) => {
    setState((s) => {
      const { dir, before } = splitSideToDir(side);
      const { tree, newPaneId } = splitPane(s.tree, paneId, dir, null, before);
      return newPaneId ? { tree, focusedId: newPaneId } : s;
    });
  }, []);

  const close = useCallback((paneId: string) => {
    setState((s) => {
      const panes = listPanes(s.tree);
      const idx = panes.findIndex((p) => p.id === paneId);
      const tree = closePane(s.tree, paneId);
      let focusedId = s.focusedId;
      if (focusedId === paneId || !findNode(tree, focusedId)) {
        const remaining = listPanes(tree);
        focusedId = remaining[Math.max(0, Math.min(idx - 1, remaining.length - 1))]?.id ?? firstPaneId(tree);
      }
      return { tree, focusedId };
    });
  }, []);

  const resize = useCallback((splitId: string, ratio: number) => {
    setState((s) => ({ ...s, tree: setRatio(s.tree, splitId, ratio) }));
  }, []);

  /**
   * Open `slug` in the workspace. If it's already open, focus that pane. Otherwise fill
   * `targetPaneId` if it's empty, or split it in `dir`.
   */
  const openSlug = useCallback((slug: string, targetPaneId: string, dir: SplitDir = "row") => {
    setState((s) => {
      const existing = findPaneBySlug(s.tree, slug);
      if (existing) return { ...s, focusedId: existing.id };
      const target = findNode(s.tree, targetPaneId);
      if (target?.type === "pane" && target.slug === null) {
        return { tree: setPaneSlug(s.tree, target.id, slug), focusedId: target.id };
      }
      const { tree, newPaneId } = splitPane(s.tree, target ? targetPaneId : firstPaneId(s.tree), dir, slug);
      return newPaneId ? { tree, focusedId: newPaneId } : s;
    });
  }, []);

  const panes = listPanes(state.tree);
  const focusedId = panes.some((p) => p.id === state.focusedId) ? state.focusedId : panes[0].id;

  return { tree: state.tree, panes, focusedId, focus, split, close, resize, openSlug };
}
