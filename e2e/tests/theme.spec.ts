import { test, expect, uid } from "../fixtures";
import type { Page } from "@playwright/test";

function luminance(rgb: string): number {
  const [r, g, b] = rgb.match(/\d+/g)!.map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function login(auth: any, prefix: string) {
  const id = uid();
  return auth.createAndLogin({
    handle: `${prefix}-${id}`.slice(0, 32), email: `${prefix}-${id}@example.com`, password: "password123", displayName: "Theme Tester",
  }) as Promise<string>;
}

const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const openMenu = async (page: Page) => {
  await page.getByRole("button", { name: "Colour theme" }).first().click();
  const menu = page.getByRole("menu", { name: "Colour theme" });
  await expect(menu).toBeVisible();
  return menu;
};

test.describe("Colour themes", () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test("the picker lists 8 themes and applies one at once; it's remembered", async ({ page, auth }) => {
    await login(auth, "th");
    await page.evaluate(() => localStorage.removeItem("clippr-theme"));
    await page.goto("/new");

    const menu = await openMenu(page);
    const options = menu.getByRole("menuitemradio");
    await expect(options).toHaveText(["Dark", "Midnight", "Charcoal", "Espresso", "Light", "Sand", "Mint", "Lavender"]);
    await expect(menu.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");

    await menu.getByRole("menuitemradio", { name: "Midnight" }).click();
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "midnight");
    await expect(html).toHaveAttribute("data-mode", "dark");
    expect(await bodyBg(page)).toBe("rgb(15, 22, 38)"); // #0F1626
    // The accent follows: the primary button uses Midnight's blue.
    const save = page.getByRole("button", { name: "Save Paste" });
    // (The button animates its colour, so wait for it to settle.)
    await expect.poll(() => save.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(90, 176, 255)");
    // The menu stays open to try others; Escape closes it.
    await expect(menu.getByRole("menuitemradio", { name: "Midnight" })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "midnight");
    expect(await bodyBg(page)).toBe("rgb(15, 22, 38)");

    // Clicking outside closes it too.
    await openMenu(page);
    await page.mouse.click(700, 600);
    await expect(page.getByRole("menu", { name: "Colour theme" })).toBeHidden();
  });

  test("light-based themes restyle pastes like Light does", async ({ page, auth, paste }) => {
    const token = await login(auth, "thl");
    const slug = await paste.createViaApi(token, { title: "Theme check", content: "plain text line", language: "plaintext" });
    await page.evaluate(() => localStorage.setItem("clippr-theme", "dark"));
    await page.goto(`/docs/${slug}`);
    const text = page.locator(".shiki span", { hasText: "plain text line" }).first();
    await expect(text).toBeVisible();
    const textColour = () => text.evaluate((el) => getComputedStyle(el).color);
    expect(luminance(await textColour())).toBeGreaterThan(150);

    const menu = await openMenu(page);
    await menu.getByRole("menuitemradio", { name: "Sand" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-mode", "light");
    await expect.poll(async () => luminance(await textColour())).toBeLessThan(100);
    expect(await bodyBg(page)).toBe("rgb(250, 246, 239)"); // #FAF6EF

    await menu.getByRole("menuitemradio", { name: "Charcoal" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
    await expect.poll(async () => luminance(await textColour())).toBeGreaterThan(150);
  });

  test("a browser that saved the old 'light' setting still opens in Light", async ({ page, auth }) => {
    await login(auth, "thy");
    await page.evaluate(() => localStorage.setItem("clippr-theme", "light"));
    await page.goto("/new");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("html")).toHaveAttribute("data-mode", "light");
    expect(await bodyBg(page)).toBe("rgb(249, 248, 246)");
  });

  test("a browser that saved a hidden theme opens in the plain theme of its mode", async ({ page, auth }) => {
    await login(auth, "thh");
    for (const [saved, shown] of [["forest", "dark"], ["plum", "dark"], ["rose", "light"], ["peach", "light"]]) {
      await page.evaluate((t) => localStorage.setItem("clippr-theme", t), saved);
      await page.goto("/new");
      await expect(page.locator("html")).toHaveAttribute("data-theme", shown);
      await expect(page.locator("html")).toHaveAttribute("data-mode", shown);
    }
  });

  test("works from the collapsed sidebar without being clipped", async ({ page, auth }) => {
    await login(auth, "thc");
    await page.goto("/new");
    await page.getByRole("button", { name: "Collapse menu" }).click();
    const menu = await openMenu(page);
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
    await menu.getByRole("menuitemradio", { name: "Midnight" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
    await page.getByRole("button", { name: "Expand menu" }).click();
  });

  test("logged-out pages have the picker too", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("auth_token"));
    await page.goto("/");
    const menu = await openMenu(page);
    await menu.getByRole("menuitemradio", { name: "Lavender" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "lavender");
  });
});

test.describe("Colour themes (phone)", () => {
  test.use({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });

  test("the menu opens from the top bar and fits on screen", async ({ page, auth }) => {
    await login(auth, "thp");
    await page.goto("/new");
    const menu = await openMenu(page);
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(box.y + box.height).toBeLessThanOrEqual(760);
    await menu.getByRole("menuitemradio", { name: "Mint" }).tap();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "mint");
  });
});
