import { test, expect, uid } from "../fixtures";
import type { Page } from "@playwright/test";

async function newUser(auth: any, prefix: string) {
  const id = uid();
  const token: string = await auth.createAndLogin({
    handle: `${prefix}-${id}`.slice(0, 32),
    email: `${prefix}-${id}@example.com`,
    password: "password123",
    displayName: `${prefix} tester`,
  });
  return { token };
}

const canvas = (page: Page) => page.getByTestId("diagram-canvas");

/** Draws a rectangle with the toolbar, then a text label, on the visible (editable) canvas. */
async function drawBoxWithLabel(page: Page, label: string, offset = 0) {
  const c = canvas(page);
  await expect(c.locator(".excalidraw")).toBeVisible();
  const box = (await c.boundingBox())!;
  // Right of centre: picking a tool opens Excalidraw's style panel on the left.
  const x = box.x + box.width / 2 - 40 + offset;
  const y = box.y + 120 + offset / 2;

  await c.getByTitle(/^Rectangle/).click();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 160, y + 90, { steps: 6 });
  await page.mouse.up();

  await c.getByTitle(/^Text/).click();
  await page.mouse.click(x + 20, y + 130);
  await page.keyboard.type(label);
  await page.keyboard.press("Escape");
}

async function getDoc(page: Page, token: string, slug: string) {
  const res = await page.request.get(`http://localhost:5173/api/documents/${slug}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (await res.json()).doc;
}

const slugFromUrl = (page: Page) => new URL(page.url()).pathname.split("/").pop()!;

test.describe("Diagram pastes", () => {
  test("switch modes from the corner icon without losing the text draft", async ({ page, auth }) => {
    await newUser(auth, "dgm");
    await page.goto("/new");

    // "diagram" isn't a language.
    const langOptions = await page.getByLabel("Language").locator("option").allTextContents();
    expect(langOptions.map((o) => o.toLowerCase())).not.toContain("diagram");

    await page.locator("textarea.pp-input, .cm-content").first().click();
    await page.keyboard.type("my text draft");

    await page.getByRole("button", { name: "Switch to diagram" }).click();
    await expect(canvas(page).locator(".excalidraw")).toBeVisible();
    await expect(page.getByLabel("Language")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save Paste" })).toBeDisabled();
    // Excalidraw's hamburger menu is hidden.
    await expect(canvas(page).getByTestId("main-menu-trigger")).toBeHidden();

    await page.getByRole("button", { name: "Switch to text" }).click();
    await expect(canvas(page)).toHaveCount(0);
    await expect(page.getByText("my text draft")).toBeVisible();
  });

  test("draw, save, view, export, search and edit a diagram", async ({ page, auth }) => {
    const me = await newUser(auth, "dgm2");
    const label = `heron${uid()}`;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/new");

    await page.getByRole("button", { name: "Switch to diagram" }).click();
    await page.getByPlaceholder("Untitled diagram").fill("My flow");
    await drawBoxWithLabel(page, label);
    await page.getByRole("button", { name: "Save Paste" }).click();

    await expect(page).toHaveURL(/\/docs\/[A-Za-z0-9_-]+$/);
    const slug = slugFromUrl(page);
    await expect(canvas(page).locator(".excalidraw")).toBeVisible();
    await expect(page.getByText("My flow.excalidraw")).toBeVisible();
    await expect(canvas(page).getByTestId("main-menu-trigger")).toBeHidden();
    await expect(page.getByRole("button", { name: "Copy", exact: true })).toHaveCount(0);

    const doc = await getDoc(page, me.token, slug);
    expect(doc.language).toBe("diagram");
    const scene = JSON.parse(doc.content);
    expect(scene.type).toBe("excalidraw");
    expect(scene.elements.some((e: any) => e.type === "rectangle")).toBe(true);
    expect(scene.elements.some((e: any) => e.type === "text" && e.text === label)).toBe(true);

    // Export downloads an image.
    const [png] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export PNG" }).click(),
    ]);
    expect(png.suggestedFilename()).toBe("My-flow.png");
    const [svg] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export SVG" }).click(),
    ]);
    expect(svg.suggestedFilename()).toBe("My-flow.svg");

    // Search finds it by its label, not its JSON.
    const search = await page.request.get(`http://localhost:5173/api/search?q=${label}`, {
      headers: { Authorization: `Bearer ${me.token}` },
    });
    const results = (await search.json()).results;
    expect(results.map((r: any) => r.slug)).toContain(slug);

    // Link preview renders.
    const og = await page.request.get(`http://localhost:5173/api/og/image/${slug}.png`);
    expect(og.status()).toBe(200);

    // Edit: add another shape and save.
    await page.getByRole("link", { name: /Edit/ }).click();
    await expect(page).toHaveURL(/\/edit$/);
    await expect(page.getByRole("button", { name: "Switch to diagram" })).toHaveCount(0);
    await drawBoxWithLabel(page, "second", 220);
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page).toHaveURL(new RegExp(`/docs/${slug}$`));
    const edited = JSON.parse((await getDoc(page, me.token, slug)).content);
    expect(edited.elements.filter((e: any) => e.type === "rectangle" && !e.isDeleted)).toHaveLength(2);
  });

  test("diagrams open and save in the Mux panel", async ({ page, auth, paste }) => {
    const me = await newUser(auth, "dgmmux");
    const empty = JSON.stringify({ type: "excalidraw", version: 2, source: "test", elements: [], appState: {}, files: {} });
    // An empty scene is allowed via the API (the UI requires a drawing before saving).
    const slug = await paste.createViaApi(me.token, { title: "Mux diagram", content: empty, language: "diagram" });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/mux");
    await page.getByRole("button", { name: "+ Add paste" }).click();
    await page.getByLabel("Paste link or slug").fill(slug);
    await page.getByRole("button", { name: "Add", exact: true }).click();

    const pane = page.locator(`[data-testid="mux-pane"][data-slug="${slug}"]`);
    await expect(pane.getByTestId("diagram-canvas").locator(".excalidraw")).toBeVisible();
    await pane.getByRole("button", { name: "Edit" }).click();
    await drawBoxWithLabel(page, "from mux");
    await expect(pane.getByLabel("Unsaved changes")).toBeVisible();
    await pane.getByRole("button", { name: "Save", exact: true }).click();
    await expect(pane.getByRole("button", { name: "Edit" })).toBeVisible();

    const scene = JSON.parse((await getDoc(page, me.token, slug)).content);
    expect(scene.elements.some((e: any) => e.type === "text" && e.text === "from mux")).toBe(true);
  });

  test("narrow Mux pane: no empty bottom bar in view mode", async ({ page, auth, paste }) => {
    const me = await newUser(auth, "dgmbar");
    const scene = JSON.stringify({
      type: "excalidraw", version: 2, source: "test", files: {}, appState: {},
      elements: [{ id: "r", type: "rectangle", x: 0, y: 0, width: 120, height: 60, version: 1, versionNonce: 1, seed: 1 }],
    });
    const slug = await paste.createViaApi(me.token, { title: "Narrow", content: scene, language: "diagram" });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/mux");
    await page.getByRole("button", { name: "+ Add paste" }).click();
    await page.getByLabel("Paste link or slug").fill(slug);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const pane = page.locator(`[data-testid="mux-pane"][data-slug="${slug}"]`);
    await pane.getByRole("button", { name: "Split right" }).click();

    // Half of the canvas is under Excalidraw's 730px breakpoint: compact layout.
    const excalidraw = pane.locator(".excalidraw");
    await expect(excalidraw).toHaveClass(/excalidraw--mobile/);
    await expect(pane.locator(".App-bottom-bar")).toBeHidden();

    // While editing, the bar is back (it holds undo/redo).
    await pane.getByRole("button", { name: "Edit" }).click();
    await expect(pane.locator(".App-bottom-bar")).toBeVisible();
    await expect(pane.getByRole("button", { name: /undo/i })).toBeVisible();
  });

  test("mobile: the diagram editor fits the screen", async ({ page, auth }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await newUser(auth, "dgmmob");
    await page.goto("/new");
    await page.getByRole("button", { name: "Switch to diagram" }).click();
    await expect(canvas(page).locator(".excalidraw")).toBeVisible();
    const box = (await canvas(page).boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(375);
    expect(box.height).toBeGreaterThan(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});
