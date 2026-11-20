import { test, expect, uid } from "../fixtures";
import type { Page } from "@playwright/test";

async function newUser(auth: any, prefix: string, login = true) {
  const id = uid();
  const user = {
    handle: `${prefix}-${id}`.slice(0, 32),
    email: `${prefix}-${id}@example.com`,
    password: "password123",
    displayName: `${prefix} tester`,
  };
  const token: string = login ? await auth.createAndLogin(user) : await auth.signupViaApi(user);
  return { ...user, token };
}

async function addViaSlug(page: Page, slug: string) {
  await page.getByRole("button", { name: "+ Add paste" }).click();
  await page.getByLabel("Paste link or slug").fill(slug);
  await page.getByRole("button", { name: "Add", exact: true }).click();
}

const pane = (page: Page, slug: string) => page.locator(`[data-testid="mux-pane"][data-slug="${slug}"]`);

test.describe("Mux panel", () => {
  test("open from menu, add pastes, edit + save, layout persists", async ({ page, auth, paste }) => {
    const me = await newUser(auth, "mux");
    const a = await paste.createViaApi(me.token, { title: "Alpha paste", content: "alpha original" });
    const b = await paste.createViaApi(me.token, { title: "Beta paste", content: "beta original" });

    await page.locator(".app-sidebar").getByRole("link", { name: "Mux" }).click();
    await expect(page).toHaveURL(/\/mux$/);

    // First paste fills the empty pane; second one comes from the "My pastes" list.
    await addViaSlug(page, a);
    await expect(pane(page, a)).toContainText("alpha original");

    await page.getByRole("button", { name: "+ Add paste" }).click();
    await page.getByTestId("mux-picker-list").getByRole("button", { name: /Beta paste/ }).click();
    await expect(pane(page, b)).toContainText("beta original");
    await expect(page.getByTestId("mux-pane")).toHaveCount(2);

    // Adding an already-open paste doesn't duplicate it.
    await addViaSlug(page, a);
    await expect(page.getByTestId("mux-pane")).toHaveCount(2);

    // Edit B and save with the keyboard shortcut.
    await pane(page, b).getByRole("button", { name: "Edit" }).click();
    const editor = pane(page, b).locator(".cm-content");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("beta edited in mux");
    await expect(pane(page, b).getByLabel("Unsaved changes")).toBeVisible();
    await page.keyboard.press("ControlOrMeta+s");
    await expect(pane(page, b).getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(pane(page, b)).toContainText("beta edited in mux");

    const res = await page.request.get(`http://localhost:5173/api/documents/${b}`, {
      headers: { Authorization: `Bearer ${me.token}` },
    });
    expect((await res.json()).doc.content).toBe("beta edited in mux");

    // Layout is restored after a reload.
    await page.reload();
    await expect(pane(page, a)).toContainText("alpha original");
    await expect(pane(page, b)).toContainText("beta edited in mux");

    // Closing a pane collapses the split.
    await pane(page, a).getByRole("button", { name: "Close pane" }).click();
    await expect(page.getByTestId("mux-pane")).toHaveCount(1);
  });

  test("split left opens an empty pane to the left of the focused one", async ({ page, auth, paste }) => {
    const me = await newUser(auth, "muxl");
    const a = await paste.createViaApi(me.token, { title: "Right side", content: "stays right" });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/mux");
    await addViaSlug(page, a);
    await pane(page, a).getByRole("button", { name: "Split left" }).click();

    await expect(page.getByTestId("mux-pane")).toHaveCount(2);
    const empty = page.locator('[data-testid="mux-pane"][data-slug=""]');
    const leftBox = (await empty.boundingBox())!;
    const rightBox = (await pane(page, a).boundingBox())!;
    expect(leftBox.x).toBeLessThan(rightBox.x);
    expect(Math.abs(leftBox.y - rightBox.y)).toBeLessThan(2);

    // At this width a half-width pane can't split sideways again (min pane width),
    // but it can still split down.
    const toolbar = page.locator(".mux-toolbar");
    await expect(toolbar.getByRole("button", { name: "Split left" })).toBeDisabled();
    await toolbar.getByRole("button", { name: "Split down" }).click();
    await expect(page.getByTestId("mux-pane")).toHaveCount(3);
    await expect(pane(page, a)).toContainText("stays right");
  });

  test("other users' pastes are read-only; stale edits get a conflict banner", async ({ page, auth, paste }) => {
    const other = await newUser(auth, "muxo", false);
    const theirs = await paste.createViaApi(other.token, { title: "Theirs", content: "not yours" });
    const me = await newUser(auth, "muxm");
    const mine = await paste.createViaApi(me.token, { title: "Mine", content: "v1" });

    await page.goto("/mux");
    await addViaSlug(page, theirs);
    await expect(pane(page, theirs)).toContainText("not yours");
    await expect(pane(page, theirs)).toContainText("read-only");
    await expect(pane(page, theirs).getByRole("button", { name: "Edit" })).toHaveCount(0);

    await addViaSlug(page, mine);
    await pane(page, mine).getByRole("button", { name: "Edit" }).click();

    // Someone (another tab) saves first. updated_at has 1s resolution, so wait past it.
    await page.waitForTimeout(1100);
    await page.request.patch(`http://localhost:5173/api/documents/${mine}`, {
      headers: { Authorization: `Bearer ${me.token}` },
      data: { content: "edited elsewhere" },
    });

    await pane(page, mine).locator(".cm-content").click();
    await page.keyboard.type(" plus mine");
    await pane(page, mine).getByRole("button", { name: "Save", exact: true }).click();
    await expect(pane(page, mine).getByRole("alert")).toContainText("changed elsewhere");

    await pane(page, mine).getByRole("button", { name: /Reload/ }).click();
    await expect(pane(page, mine)).toContainText("edited elsewhere");
  });

  test("mobile: panes become tabs", async ({ page, auth, paste }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    const me = await newUser(auth, "muxmob");
    const a = await paste.createViaApi(me.token, { title: "Tab A", content: "content a" });
    const b = await paste.createViaApi(me.token, { title: "Tab B", content: "content b" });

    await page.goto("/mux");
    await addViaSlug(page, a);
    await addViaSlug(page, b);

    const tabs = page.getByRole("tablist", { name: "Panes" }).getByRole("tab");
    await expect(tabs).toHaveCount(2);
    await expect(pane(page, b)).toBeVisible();
    await expect(pane(page, a)).toBeHidden();

    await tabs.filter({ hasText: "Tab A" }).click();
    await expect(pane(page, a)).toBeVisible();
    await expect(pane(page, b)).toBeHidden();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});

test.describe("Mux panel: minimum pane size", () => {
  test("splitting stops once panes would get too small; dividers can't crush panes", async ({ page, auth }) => {
    const id = uid();
    await auth.createAndLogin({
      handle: `muxmin-${id}`.slice(0, 32), email: `muxmin-${id}@example.com`, password: "password123", displayName: "Min",
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/mux");

    const splitRight = page.locator(".mux-toolbar").getByRole("button", { name: "Split right" });
    let clicks = 0;
    while (await splitRight.isEnabled() && clicks < 20) {
      await splitRight.click();
      clicks++;
    }
    expect(clicks).toBeGreaterThan(0);
    expect(clicks).toBeLessThan(5);
    await expect(splitRight).toBeDisabled();

    // Every pane is at least the minimum width.
    const widths = await page.getByTestId("mux-pane").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    for (const w of widths) expect(w).toBeGreaterThanOrEqual(255);

    // The focused (narrow) pane's own split-right button is disabled too.
    const focused = page.locator(".mux-pane.focused");
    await expect(focused.getByRole("button", { name: "Split right" })).toBeDisabled();

    // Dragging the first divider far left stops at the minimum width.
    const divider = page.getByRole("separator").first();
    const box = (await divider.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(0, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    const first = await page.getByTestId("mux-pane").first().evaluate((e) => e.getBoundingClientRect().width);
    expect(first).toBeGreaterThanOrEqual(255);
  });
});
