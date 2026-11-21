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

const hintOpacity = (page: Page) =>
  page.locator(".diagram-canvas .HintViewer").evaluate((el) => Number(getComputedStyle(el).opacity));

for (const [name, use] of [
  ["desktop", { viewport: { width: 1280, height: 860 } }],
  ["phone", { viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true }],
] as const) {
  test.describe(`Diagram tool hint (${name})`, () => {
    test.use(use);

    test("shows briefly after picking a tool, then fades", async ({ page, auth }) => {
      const c = await openDiagramEditor(page, auth, `dh${name[0]}`);
      await c.getByRole("button", { name: "Show toolbar" }).click();

      await c.locator('label:has([data-testid="toolbar-freedraw"])').click();
      const hint = c.locator(".HintViewer");
      await expect(hint).toContainText(/click and drag/i);
      expect(await hintOpacity(page)).toBeGreaterThan(0.5);

      // Gone after a few seconds, even though the pen is still selected.
      await expect.poll(() => hintOpacity(page), { timeout: 6000 }).toBe(0);
      await expect(c).toHaveClass(/diagram-canvas--hint-hidden/);

      // Picking a tool again shows its hint again (the rectangle tool has no hint of its own).
      await c.locator('label:has([data-testid="toolbar-rectangle"])').click();
      await c.locator('label:has([data-testid="toolbar-freedraw"])').click();
      await expect(hint).toContainText(/click and drag/i);
      await expect.poll(() => hintOpacity(page), { timeout: 2000 }).toBeGreaterThan(0.5);
    });
  });
}
