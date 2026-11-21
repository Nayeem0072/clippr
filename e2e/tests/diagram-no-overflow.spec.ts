import { test, expect, uid } from "../fixtures";
import type { Page } from "@playwright/test";

// Excalidraw has a full-window position:fixed layer. If any ancestor keeps a transform
// (e.g. a finished page animation), that layer is positioned against the page instead
// and overflows it, letting the page scroll right and down.

const EMPTY = JSON.stringify({ type: "excalidraw", version: 2, source: "test", elements: [], appState: {}, files: {} });

async function expectNoStrayScroll(page: Page, { vertical = true } = {}) {
  await page.locator(".SVGLayer").first().waitFor({ state: "attached" });
  await page.waitForTimeout(600); // let the page-enter animation finish
  const m = await page.evaluate(() => {
    const sc = document.querySelector(".app-content") as HTMLElement;
    return { sw: sc.scrollWidth, cw: sc.clientWidth, sh: sc.scrollHeight, ch: sc.clientHeight };
  });
  expect(m.sw).toBeLessThanOrEqual(m.cw);
  // Mux fits the window exactly; the editor page is allowed to be taller than it.
  if (vertical) expect(m.sh).toBeLessThanOrEqual(m.ch);
}

test.describe("Diagram canvas doesn't add page scrolling", () => {
  test.use({ viewport: { width: 1400, height: 820 } });

  test("Mux pane and the new paste editor", async ({ page, auth, paste }) => {
    const id = uid();
    const token = await auth.createAndLogin({
      handle: `dno-${id}`.slice(0, 32), email: `dno-${id}@example.com`, password: "password123", displayName: "dno",
    });
    const slug = await paste.createViaApi(token, { title: "Flow", language: "diagram", content: EMPTY });

    await page.goto("/mux");
    await page.getByRole("button", { name: "+ Add paste" }).click();
    await page.getByLabel("Paste link or slug").fill(slug);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expectNoStrayScroll(page);

    await page.goto("/new");
    await page.getByRole("button", { name: "Switch to diagram" }).click();
    await expectNoStrayScroll(page, { vertical: false });
  });
});
