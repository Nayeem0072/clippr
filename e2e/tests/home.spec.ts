import { test, expect } from "../fixtures";

async function openLoggedOut(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("auth_token"));
  await page.context().clearCookies();
  await page.goto("/");
}

test.describe("Home page (logged out)", () => {
  test("headline, feature tiles and calls to action", async ({ page }) => {
    await openLoggedOut(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("One place for the bits your team keeps sharing");

    const tiles = page.getByRole("region", { name: "Features" });
    for (const name of [
      "Code that reads well",
      "Diagrams",
      "To-do lists",
      "You decide who sees it",
      "Mux: pastes side by side",
      "Groups and organizations",
      "Links that preview",
    ]) {
      await expect(tiles.getByRole("heading", { name })).toBeVisible();
    }

    // The to-do demo really ticks.
    const todo = tiles.getByRole("checkbox", { name: "Update the deploy runbook" });
    await expect(todo).not.toBeChecked();
    await todo.check();
    await expect(todo).toBeChecked();
    await expect(tiles.getByText("2 of 3 done")).toBeVisible();

    await page.getByRole("link", { name: "Explore pastes" }).click();
    await expect(page).toHaveURL(/\/search/);
    await page.goBack();
    await page.getByRole("link", { name: "Get started free" }).click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test.describe("phone", () => {
    test.use({ viewport: { width: 375, height: 760 } });

    test("stacks to one column without sideways scrolling", async ({ page }) => {
      await openLoggedOut(page);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);

      // Headline above the tiles, tiles one per row.
      const h1 = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
      const code = (await page.getByRole("heading", { name: "Code that reads well" }).boundingBox())!;
      const diagrams = (await page.getByRole("heading", { name: "Diagrams" }).boundingBox())!;
      const privacy = (await page.getByRole("heading", { name: "You decide who sees it" }).boundingBox())!;
      expect(code.y).toBeGreaterThan(h1.y);
      expect(privacy.y).toBeGreaterThan(diagrams.y + diagrams.height);
    });
  });
});
