import { test, expect, uid } from "../fixtures";
import type { Page } from "@playwright/test";

async function login(auth: any, prefix: string) {
  const id = uid();
  await auth.createAndLogin({
    handle: `${prefix}-${id}`.slice(0, 32), email: `${prefix}-${id}@example.com`, password: "password123", displayName: prefix,
  });
}

/** Width of the content column the editor card can use (.app-main minus its padding). */
const columnWidth = (page: Page) =>
  page.locator(".app-main").evaluate((el) => {
    const s = getComputedStyle(el);
    return el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
  });

async function expectSaveReachableAfterScroll(page: Page) {
  const longText = Array.from({ length: 150 }, (_, i) => `line ${i + 1}`).join("\n");
  await page.locator(".cm-content").click();
  await page.keyboard.insertText(longText);
  await page.locator(".app-content").evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(page.getByTestId("newpaste-header")).toHaveClass(/stuck/);

  const save = page.getByRole("button", { name: "Save Paste" });
  await expect(save).toBeInViewport();
  const box = (await save.boundingBox())!;
  expect(box.y).toBeLessThan(80);
  await save.click();
  await expect(page).toHaveURL(/\/docs\//);
}

for (const vp of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 375, height: 740 }]) {
  test.describe(`New paste layout (${vp.name})`, () => {
    test.beforeEach(async ({ page }) => page.setViewportSize({ width: vp.width, height: vp.height }));

    test("the editor card fills the content width in text and diagram mode", async ({ page, auth }) => {
      await login(auth, "npl");
      await page.goto("/new");
      const col = await columnWidth(page);
      const card = page.locator(".pp-card").first();
      expect(Math.abs((await card.boundingBox())!.width - col)).toBeLessThan(2);

      await page.getByRole("button", { name: "Switch to diagram" }).click();
      await expect(page.getByTestId("diagram-canvas").locator(".excalidraw")).toBeVisible();
      expect(Math.abs((await card.boundingBox())!.width - col)).toBeLessThan(2);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
    });

    test("the header with Save stays at the top while scrolling a long paste", async ({ page, auth }) => {
      await login(auth, "nps");
      await page.goto("/new");
      await expect(page.getByTestId("newpaste-header")).not.toHaveClass(/stuck/);
      await expectSaveReachableAfterScroll(page);
    });
  });
}
