import { test, expect, uid } from "../fixtures";

test.describe("Diagram toolbar toggle (desktop)", () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test("collapses the shape toolbar; Library is an icon below the toggle", async ({ page, auth }) => {
    const id = uid();
    await auth.createAndLogin({
      handle: `dtt-${id}`.slice(0, 32),
      email: `dtt-${id}@example.com`,
      password: "password123",
      displayName: "dtt tester",
    });
    await page.goto("/new");
    await page.evaluate(() => localStorage.removeItem("clippr-diagram-tools-hidden"));
    await page.getByRole("button", { name: "Switch to diagram" }).click();

    const c = page.getByTestId("diagram-canvas");
    const toolbar = c.locator(".App-toolbar");
    const toggle = c.getByRole("button", { name: "Hide toolbar" });
    const library = c.locator(".default-sidebar-trigger");
    await expect(toolbar).toBeVisible();
    await expect(toggle).toBeVisible();

    // Library: icon only, stacked under the toggle.
    await expect(library.locator(".sidebar-trigger__label")).toBeHidden();
    const t = (await toggle.boundingBox())!;
    const l = (await library.boundingBox())!;
    expect(l.y).toBeGreaterThanOrEqual(t.y + t.height);
    expect(Math.abs(l.x + l.width - (t.x + t.width))).toBeLessThan(2);

    await toggle.click();
    await expect(toolbar).toBeHidden();
    await expect(c.getByRole("button", { name: "Show toolbar" })).toHaveAttribute("aria-pressed", "false");

    // Remembered across reloads.
    await page.reload();
    await page.getByRole("button", { name: "Switch to diagram" }).click();
    await expect(c.getByRole("button", { name: "Show toolbar" })).toBeVisible();
    await expect(c.locator(".App-toolbar")).toBeHidden();

    await c.getByRole("button", { name: "Show toolbar" }).click();
    await expect(c.locator(".App-toolbar")).toBeVisible();
  });

  test("no toggle on phones (compact layout)", async ({ page, auth }) => {
    const id = uid();
    await auth.createAndLogin({
      handle: `dtm-${id}`.slice(0, 32),
      email: `dtm-${id}@example.com`,
      password: "password123",
      displayName: "dtm tester",
    });
    await page.setViewportSize({ width: 375, height: 760 });
    await page.goto("/new");
    await page.getByRole("button", { name: "Switch to diagram" }).click();
    const c = page.getByTestId("diagram-canvas");
    await expect(c.locator(".excalidraw")).toBeVisible();
    await expect(c.locator(".diagram-tools-toggle")).toHaveCount(0);
  });
});
