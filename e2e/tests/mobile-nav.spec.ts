import { test, expect, uid } from "../fixtures";

// These tests run on the mobile-chrome project (Pixel 5, 393px wide)
// which triggers the ≤768px mobile CSS breakpoint

async function login(auth: any) {
  const id = uid();
  await auth.createAndLogin({
    handle: `u${id}`,
    email: `u${id}@test.pp`,
    password: "testpassword1",
    displayName: "Test User",
  });
}

test.describe("Mobile Nav", () => {
  test("logged in: mobile nav visible, sidebar hidden, 5 nav items present", async ({ auth, page }) => {
    await login(auth);
    await page.goto("/new");
    await page.waitForURL("**/new", { timeout: 10000 });

    await expect(page.locator(".mobile-nav")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".app-sidebar")).not.toBeVisible();

    // New, Explore, Pastes, Shared, More
    const items = page.locator(".mobile-nav .mobile-nav-item");
    await expect(items).toHaveCount(5);
    await expect(items).toHaveText(["New", "Explore", "Pastes", "Shared", "More"]);
  });

  test("logged out: mobile nav not visible", async ({ page }) => {
    if (process.env.SERVERS_DOWN === "true") test.skip(true, "Servers not running");

    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("auth_token"));
    await page.reload();

    // TopNav layout is shown when logged out — MobileNav is not mounted
    await expect(page.locator(".mobile-nav")).not.toBeVisible();
  });

  test("More opens the other pages and closes after navigating", async ({ auth, page }) => {
    await login(auth);
    await page.goto("/new");

    const more = page.getByRole("button", { name: "More" });
    await more.click();
    const sheet = page.getByRole("dialog", { name: "More pages" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("link")).toHaveText(["Trending", "Saved", "Mux", "Groups", "Settings"]);

    await sheet.getByRole("link", { name: "Groups" }).click();
    await page.waitForURL("**/groups");
    await expect(sheet).toBeHidden();

    // A page from the sheet highlights More.
    await expect(page.locator(".mobile-nav-item.active")).toHaveText("More");

    // Escape and the backdrop both close it.
    await more.click();
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await more.click();
    await page.mouse.click(200, 120);
    await expect(sheet).toBeHidden();
  });

  test("active nav item matches current route", async ({ auth, page }) => {
    await login(auth);
    await page.goto("/search");
    await expect(page.locator(".mobile-nav-item.active")).toHaveText("Explore");
  });
});
