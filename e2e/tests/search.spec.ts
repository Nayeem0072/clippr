import { test, expect, uid } from "../fixtures";

test.describe("Search page (search + trending)", () => {
  test("search bar on top, results as you type, trending at the bottom", async ({ page, auth }) => {
    const id = uid();
    const token = await auth.createAndLogin({
      handle: `sr-${id}`.slice(0, 32), email: `sr-${id}@example.com`, password: "password123", displayName: "Searcher",
    });
    const word = `kestrel${id}`;
    await page.request.post("http://localhost:5173/api/documents", {
      headers: { authorization: `Bearer ${token}` },
      data: { title: `Notes ${word}`, content: `remember the ${word}`, language: "plaintext", privacy: "public" },
    });

    await page.goto("/search");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Search");
    const results = page.getByRole("region", { name: "Search results" });
    await expect(results).toContainText("Type at least 2 characters");

    // Results show up while typing, no button needed, and the URL follows.
    await page.getByRole("searchbox", { name: "Search pastes" }).fill(word);
    await expect(results.getByText(`Notes ${word}`)).toBeVisible();
    await expect(results).toContainText("1 result");
    await expect(page).toHaveURL(new RegExp(`q=${word}`));

    // Trending sits below the results.
    const trending = page.getByRole("heading", { name: "Trending this week" });
    await expect(trending).toBeVisible();
    const r = (await results.boundingBox())!;
    expect((await trending.boundingBox())!.y).toBeGreaterThan(r.y + r.height - 1);

    // The top three trending pastes carry 1, 2, 3 badges.
    const ranks = page.locator(".search-trending .trending-rank");
    if ((await page.locator(".search-trending-item").count()) >= 3) {
      await expect(ranks).toHaveText(["1", "2", "3"]);
    }

    // The old Trending page now lands here.
    await page.goto("/trending");
    await expect(page).toHaveURL(/\/search$/);

    // Sidebar has Search, and no separate Trending entry.
    const sidebar = page.locator(".app-sidebar");
    await expect(sidebar.getByRole("link", { name: "Search" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Trending" })).toHaveCount(0);
  });

  test.describe("phone", () => {
    test.use({ viewport: { width: 375, height: 760 } });
    test("fits without sideways scrolling", async ({ page, auth }) => {
      const id = uid();
      await auth.createAndLogin({ handle: `sp-${id}`.slice(0, 32), email: `sp-${id}@example.com`, password: "password123", displayName: "P" });
      await page.goto("/search");
      await expect(page.getByRole("heading", { name: "Trending this week" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
});
