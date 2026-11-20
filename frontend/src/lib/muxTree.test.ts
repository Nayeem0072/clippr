import { describe, it, expect } from "bun:test";
import {
  emptyPane, splitPane, closePane, setPaneSlug, setRatio, listPanes, findPaneBySlug,
  findNode, parseStoredTree, parseSlugInput, computeLayout, splitSideToDir, MIN_RATIO, MAX_RATIO, type MuxNode,
} from "./muxTree";

function threePanes() {
  const root = emptyPane();
  const s1 = splitPane(root, root.id, "row", "aaa");
  const s2 = splitPane(s1.tree, s1.newPaneId!, "col", "bbb");
  return { tree: s2.tree, first: root.id, second: s1.newPaneId!, third: s2.newPaneId! };
}

describe("splitPane", () => {
  it("puts the new pane after the target in visual order", () => {
    const { tree, first, second, third } = threePanes();
    expect(listPanes(tree).map((p) => p.id)).toEqual([first, second, third]);
    expect(tree.type).toBe("split");
    if (tree.type === "split") {
      expect(tree.dir).toBe("row");
      expect(tree.b.type === "split" && tree.b.dir).toBe("col");
    }
  });

  it("split left puts the new pane before the target", () => {
    const root = { ...emptyPane(), slug: "aaa" };
    const { tree, newPaneId } = splitPane(root, root.id, "row", null, true);
    expect(listPanes(tree).map((p) => p.id)).toEqual([newPaneId, root.id]);
    const { panes } = computeLayout(tree);
    expect(panes[0]).toMatchObject({ id: newPaneId, x: 0, w: 0.5 });
    expect(panes[1]).toMatchObject({ id: root.id, slug: "aaa", x: 0.5 });
  });

  it("maps split sides to tree directions", () => {
    expect(splitSideToDir("left")).toEqual({ dir: "row", before: true });
    expect(splitSideToDir("right")).toEqual({ dir: "row", before: false });
    expect(splitSideToDir("down")).toEqual({ dir: "col", before: false });
  });

  it("is a no-op for an unknown or non-pane id", () => {
    const { tree } = threePanes();
    expect(splitPane(tree, "nope", "row").tree).toBe(tree);
    expect(splitPane(tree, tree.id, "row").newPaneId).toBeNull();
  });
});

describe("closePane", () => {
  it("collapses the parent split into the sibling", () => {
    const { tree, first, second, third } = threePanes();
    const t = closePane(tree, second);
    expect(listPanes(t).map((p) => p.id)).toEqual([first, third]);
    expect(t.type === "split" && t.b.id).toBe(third);
  });

  it("closing the only pane leaves a fresh empty pane", () => {
    const p = { ...emptyPane(), slug: "abc" };
    const t = closePane(p, p.id);
    expect(t.type).toBe("pane");
    expect(t.id).not.toBe(p.id);
    expect(t.type === "pane" && t.slug).toBeNull();
  });

  it("closing down to one pane yields a bare pane root", () => {
    const { tree, first, second, third } = threePanes();
    const t = closePane(closePane(tree, third), second);
    expect(t).toEqual(findNode(tree, first) as MuxNode);
  });
});

describe("slugs and ratios", () => {
  it("sets slugs and finds panes by slug", () => {
    const { tree, first } = threePanes();
    const t = setPaneSlug(tree, first, "zzz");
    expect(findPaneBySlug(t, "zzz")?.id).toBe(first);
    expect(findPaneBySlug(t, "missing")).toBeNull();
  });

  it("clamps ratios", () => {
    const { tree } = threePanes();
    expect((setRatio(tree, tree.id, 5) as any).ratio).toBe(MAX_RATIO);
    expect((setRatio(tree, tree.id, -1) as any).ratio).toBe(MIN_RATIO);
    expect((setRatio(tree, tree.id, NaN) as any).ratio).toBe(0.5);
  });
});

describe("parseStoredTree", () => {
  it("round-trips a valid tree", () => {
    const { tree } = threePanes();
    expect(parseStoredTree(JSON.stringify(tree))).toEqual(tree);
  });

  it("falls back to one empty pane on garbage", () => {
    for (const raw of [null, "", "not json", "42", '{"type":"split"}', '{"type":"pane","id":"x","slug":"../evil"}']) {
      const t = parseStoredTree(raw);
      expect(t.type).toBe("pane");
      expect(t.type === "pane" && t.slug).toBeNull();
    }
  });

  it("rejects duplicate node ids and clears duplicate slugs", () => {
    const dupIds = { type: "split", id: "s", dir: "row", ratio: 0.5, a: { type: "pane", id: "p", slug: null }, b: { type: "pane", id: "p", slug: null } };
    expect(parseStoredTree(JSON.stringify(dupIds)).type).toBe("pane");

    const dupSlugs = { type: "split", id: "s", dir: "row", ratio: 0.5, a: { type: "pane", id: "p1", slug: "abc" }, b: { type: "pane", id: "p2", slug: "abc" } };
    expect(listPanes(parseStoredTree(JSON.stringify(dupSlugs))).map((p) => p.slug)).toEqual(["abc", null]);
  });
});

describe("parseSlugInput", () => {
  it("accepts slugs and /docs/ URLs", () => {
    expect(parseSlugInput("  abc123 ")).toBe("abc123");
    expect(parseSlugInput("https://clippr-paste.vercel.app/docs/ogAUEHd6")).toBe("ogAUEHd6");
    expect(parseSlugInput("/docs/abc?x=1")).toBe("abc");
    expect(parseSlugInput("hello world")).toBeNull();
    expect(parseSlugInput("")).toBeNull();
  });
});

describe("computeLayout", () => {
  it("tiles the container with no gaps or overlap", () => {
    const { tree } = threePanes();
    const { panes, dividers } = computeLayout(tree);
    const area = panes.reduce((s, p) => s + p.w * p.h, 0);
    expect(area).toBeCloseTo(1, 10);
    expect(panes[0]).toMatchObject({ x: 0, y: 0, w: 0.5, h: 1 });
    expect(panes[1]).toMatchObject({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
    expect(panes[2]).toMatchObject({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    expect(dividers.map((d) => [d.dir, d.pos])).toEqual([["col", 0.5], ["row", 0.5]]);
  });

  it("respects ratios", () => {
    const { tree } = threePanes();
    const { panes } = computeLayout(setRatio(tree, tree.id, 0.25));
    expect(panes[0].w).toBeCloseTo(0.25);
    expect(panes[1].x).toBeCloseTo(0.25);
  });
});
