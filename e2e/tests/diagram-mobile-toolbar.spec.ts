import { test, expect, uid } from "../fixtures";
import type { Page } from "@playwright/test";

async function openDiagramEditor(page: Page, auth: any) {
  const id = uid();
  await auth.createAndLogin({
    handle: `dmt-${id}`.slice(0, 32), email: `dmt-${id}@example.com`, password: "password123", displayName: "Toolbar",
  });
  await page.goto("/new");
  await page.getByRole("button", { name: "Switch to diagram" }).click();
  // The toolbar starts collapsed.
  await page.getByRole("button", { name: "Show toolbar" }).tap();
  await expect(page.locator(".App-toolbar--mobile")).toBeVisible();
}

const measure = (page: Page) =>
  page.evaluate(() => {
    const canvas = (document.querySelector(".diagram-canvas") as HTMLElement).getBoundingClientRect();
    const bar = document.querySelector(".App-toolbar--mobile") as HTMLElement;
    const box = bar.getBoundingClientRect();
    const buttons = [...bar.querySelectorAll("label, button")].map((b) => b.getBoundingClientRect()).filter((r) => r.width > 0);
    return {
      canvas: { left: canvas.left, right: canvas.right },
      bar: { left: box.left, right: box.right, scrollWidth: bar.scrollWidth, clientWidth: bar.clientWidth, scrollLeft: bar.scrollLeft },
      lastRight: Math.max(...buttons.map((r) => r.right)),
    };
  });

test.describe("Diagram toolbar on phones", () => {
  test.describe("360px phone", () => {
    test.use({ viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true });

    test("the whole toolbar fits inside the canvas", async ({ page, auth }) => {
      await openDiagramEditor(page, auth);
      const m = await measure(page);
      expect(m.bar.left).toBeGreaterThanOrEqual(m.canvas.left - 1);
      expect(m.bar.right).toBeLessThanOrEqual(m.canvas.right + 1);
      expect(m.lastRight).toBeLessThanOrEqual(m.canvas.right + 1);
    });
  });

  test.describe("320px phone", () => {
    test.use({ viewport: { width: 320, height: 760 }, isMobile: true, hasTouch: true });

    test("an overflowing toolbar stays in the canvas and scrolls with a swipe", async ({ page, auth }) => {
      await openDiagramEditor(page, auth);
      const before = await measure(page);
      expect(before.bar.left).toBeGreaterThanOrEqual(before.canvas.left - 1);
      expect(before.bar.right).toBeLessThanOrEqual(before.canvas.right + 1);
      expect(before.bar.scrollWidth).toBeGreaterThan(before.bar.clientWidth);

      // A real touch swipe (right to left) across the tool icons.
      const bar = (await page.locator(".App-toolbar--mobile").boundingBox())!;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Input.synthesizeScrollGesture", {
        x: Math.round(bar.x + bar.width - 30), y: Math.round(bar.y + bar.height / 2),
        xDistance: -200, yDistance: 0, gestureSourceType: "touch", speed: 800,
      });
      await expect.poll(async () => (await measure(page)).bar.scrollLeft).toBeGreaterThan(0);

      // The last tool is now reachable inside the canvas.
      const after = await measure(page);
      expect(after.lastRight).toBeLessThanOrEqual(after.canvas.right + 1);
    });
  });
});
