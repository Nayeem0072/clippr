import { test, expect, uid } from "../fixtures";
import type { Page } from "@playwright/test";

async function login(auth: any, prefix: string): Promise<string> {
  const id = uid();
  return auth.createAndLogin({
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
  await expect(page.getByTestId("editor-header")).toHaveClass(/stuck/);

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

    test("edit page: full-width card, and Save Changes stays at the top on a long paste", async ({ page, auth, paste }) => {
      const token = await login(auth, "npe");
      const long = Array.from({ length: 150 }, (_, i) => `line ${i + 1}`).join("\n");
      const slug = await paste.createViaApi(token, { title: "Long one", content: long });
      await page.goto(`/docs/${slug}/edit`);
      await expect(page.getByRole("heading", { name: "Edit Paste" })).toBeVisible();
      const col = await columnWidth(page);
      expect(Math.abs((await page.locator(".pp-card").first().boundingBox())!.width - col)).toBeLessThan(2);

      await page.locator(".app-content").evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await expect(page.getByTestId("editor-header")).toHaveClass(/stuck/);
      const save = page.getByRole("button", { name: "Save Changes" });
      await expect(save).toBeInViewport();
      await expect(page.getByRole("button", { name: "Cancel" })).toBeInViewport();
      expect((await save.boundingBox())!.y).toBeLessThan(80);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
      await save.click();
      await expect(page).toHaveURL(new RegExp(`/docs/${slug}$`));
    });

    test("edit page: a diagram's canvas fills the content width", async ({ page, auth, paste }) => {
      const token = await login(auth, "npd");
      const scene = JSON.stringify({ type: "excalidraw", version: 2, source: "test", elements: [], appState: {}, files: {} });
      const slug = await paste.createViaApi(token, { title: "Drawing", content: scene, language: "diagram" });
      await page.goto(`/docs/${slug}/edit`);
      await expect(page.getByRole("heading", { name: "Edit Diagram" })).toBeVisible();
      await expect(page.getByTestId("diagram-canvas").locator(".excalidraw")).toBeVisible();
      const col = await columnWidth(page);
      expect(Math.abs((await page.locator(".pp-card").first().boundingBox())!.width - col)).toBeLessThan(2);
    });

    test("the header with Save stays at the top while scrolling a long paste", async ({ page, auth }) => {
      await login(auth, "nps");
      await page.goto("/new");
      await expect(page.getByTestId("editor-header")).not.toHaveClass(/stuck/);
      await expectSaveReachableAfterScroll(page);
    });
  });
}
