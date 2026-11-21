import { test, expect, uid } from "../fixtures";

async function login(auth: any) {
  const id = uid();
  await auth.createAndLogin({
    handle: `sb-${id}`.slice(0, 32), email: `sb-${id}@example.com`, password: "password123", displayName: "Side Bar",
  });
}

test.describe("Sidebar collapse", () => {
  test("collapses to icons, stays usable, and remembers the choice", async ({ page, auth }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(auth);
    await page.goto("/new");
    const sidebar = page.locator(".app-sidebar");
    await expect(sidebar).toBeVisible();
    expect((await sidebar.boundingBox())!.width).toBeGreaterThan(200);
    await expect(sidebar.getByText("Search", { exact: true })).toBeVisible();

    await sidebar.getByRole("button", { name: "Collapse menu" }).click();
    await expect(sidebar).toHaveClass(/collapsed/);
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeLessThan(70);

    // Labels are hidden, but links keep their names (and tooltips) and still navigate.
    await expect(sidebar.getByText("Search", { exact: true })).toBeHidden();
    const search = sidebar.getByRole("link", { name: "Search" });
    await expect(search).toBeVisible();
    await expect(search).toHaveAttribute("title", "Search");
    await search.click();
    await expect(page).toHaveURL(/\/search$/);

    // Theme toggle, notifications and sign out remain reachable.
    await expect(sidebar.getByTitle(/Switch to (light|dark) theme/)).toBeVisible();
    await expect(sidebar.getByTitle("Sign out")).toBeVisible();

    // No horizontal overflow inside the narrow rail.
    const overflow = await sidebar.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(overflow).toBe(false);

    // Remembered across reloads.
    await page.reload();
    await expect(sidebar).toHaveClass(/collapsed/);

    await sidebar.getByRole("button", { name: "Expand menu" }).click();
    await expect(sidebar).not.toHaveClass(/collapsed/);
    await expect(sidebar.getByText("Search", { exact: true })).toBeVisible();
  });

  test("mobile still uses the bottom nav", async ({ page, auth }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await login(auth);
    await page.goto("/new");
    await expect(page.locator(".app-sidebar")).toBeHidden();
    await expect(page.locator(".mobile-nav")).toBeVisible();
  });
});
