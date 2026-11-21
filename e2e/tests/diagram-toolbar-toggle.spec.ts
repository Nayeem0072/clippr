import { test, expect, uid } from "../fixtures";
import type { Page } from "@playwright/test";

async function openDiagramEditor(page: Page, auth: any, prefix: string) {
  const id = uid();
  await auth.createAndLogin({
    handle: `${prefix}-${id}`.slice(0, 32),
    email: `${prefix}-${id}@example.com`,
    password: "password123",
    displayName: `${prefix} tester`,
  });
  await page.goto("/new");
  await page.getByRole("button", { name: "Switch to diagram" }).click();
  const c = page.getByTestId("diagram-canvas");
  await expect(c.locator(".excalidraw")).toBeVisible();
  return c;
}

test.describe("Diagram toolbar toggle (desktop)", () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test("collapsed by default; Library is an icon below the toggle; choice is remembered", async ({ page, auth }) => {
    const c = await openDiagramEditor(page, auth, "dtt");
    const toolbar = c.locator(".App-toolbar");
    const show = c.getByRole("button", { name: "Show toolbar" });
    const library = c.locator(".default-sidebar-trigger");

    await expect(show).toBeVisible();
    await expect(show).toHaveAttribute("aria-pressed", "false");
    await expect(toolbar).toBeHidden();

    // Library: icon only, stacked under the toggle.
    await expect(library.locator(".sidebar-trigger__label")).toBeHidden();
    const t = (await show.boundingBox())!;
    const l = (await library.boundingBox())!;
    expect(l.y).toBeGreaterThanOrEqual(t.y + t.height);
    expect(Math.abs(l.x + l.width - (t.x + t.width))).toBeLessThan(2);

    await show.click();
    await expect(toolbar).toBeVisible();

    // Opened stays opened across reloads.
    await page.reload();
    await page.getByRole("button", { name: "Switch to diagram" }).click();
    await expect(c.locator(".App-toolbar")).toBeVisible();
    await c.getByRole("button", { name: "Hide toolbar" }).click();
    await expect(c.locator(".App-toolbar")).toBeHidden();
  });
});

test.describe("Diagram toolbar toggle (phone)", () => {
  test.use({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });

  test("toggle heads the side tool group, which sits inside the canvas", async ({ page, auth }) => {
    const c = await openDiagramEditor(page, auth, "dtm");
    const group = c.locator(".mobile-misc-tools-container");
    const toolbar = c.locator(".App-toolbar--mobile");
    const show = group.getByRole("button", { name: "Show toolbar" });

    // Collapsed: just the toggle and Library.
    await expect(show).toBeVisible();
    await expect(toolbar).toBeHidden();
    await expect(c.locator(".default-sidebar-trigger")).toBeVisible();
    await expect(group.getByTitle(/hand/i)).toBeHidden();

    // Toggle is first, above Library.
    const t = (await show.boundingBox())!;
    const l = (await c.locator(".default-sidebar-trigger").boundingBox())!;
    expect(l.y).toBeGreaterThanOrEqual(t.y + t.height - 1);

    // A gap between the group and the canvas edge.
    const g = (await group.boundingBox())!;
    const cb = (await c.boundingBox())!;
    expect(cb.x + cb.width - (g.x + g.width)).toBeGreaterThanOrEqual(4);

    await show.tap();
    await expect(toolbar).toBeVisible();
    await expect(group.getByTitle(/hand/i)).toBeVisible();
    await expect(group.getByRole("button", { name: "Hide toolbar" })).toBeVisible();
  });
});
