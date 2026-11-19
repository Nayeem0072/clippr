import { test, expect, uid } from "../fixtures";

// Regression: toggling the theme while viewing a paste must restyle the paste
// immediately. Previously each useTheme() kept its own state, so DocViewer kept
// the dark-mode (light-coloured) text after switching to light mode.

function luminance(rgb: string): number {
  const [r, g, b] = rgb.match(/\d+/g)!.map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test("paste text colour follows theme toggles without a reload", async ({ page, auth, paste }) => {
  const id = uid();
  const token = await auth.createAndLogin({
    handle: `theme-${id}`.slice(0, 32),
    email: `theme-${id}@example.com`,
    password: "password123",
    displayName: "Theme Tester",
  });
  const slug = await paste.createViaApi(token, { title: "Theme check", content: "plain text line", language: "plaintext" });

  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("clippr-theme", "dark"));
  await page.goto(`/docs/${slug}`);

  const text = page.locator(".shiki span", { hasText: "plain text line" }).first();
  await expect(text).toBeVisible();
  const textColour = () => text.evaluate((el) => getComputedStyle(el).color);

  // Dark theme: light text
  expect(luminance(await textColour())).toBeGreaterThan(150);

  const toggle = page.getByTitle(/Switch to (light|dark) theme/).first();
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  // Light theme: dark text, without reloading
  await expect.poll(async () => luminance(await textColour())).toBeLessThan(100);

  await toggle.click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "light");
  await expect.poll(async () => luminance(await textColour())).toBeGreaterThan(150);
});
