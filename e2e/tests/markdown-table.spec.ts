import { test, expect, uid } from "../fixtures";

const MD = `# Threat model

| Stage | What attacker has | What limits them | Notes |
| --- | --- | --- | --- |
| Login | Valid credentials → \`authenticated_as\` = victim | Auth hardening (§5) | Rate limited per IP and per account |
| Sending | Same rights as the real user | Throttles, recipient caps (§2) | Alerts on unusual volume |
| Fallout | Bounces / complaints at SES | Auto-suspend, suppression, alarms (§6) | Reviewed weekly |
`;

test.describe("Markdown tables on phones", () => {
  test.use({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });

  test("a wide table scrolls sideways in its own box; the page doesn't", async ({ page, auth }) => {
    const id = uid();
    const token = await auth.createAndLogin({
      handle: `mt-${id}`.slice(0, 32), email: `mt-${id}@example.com`, password: "password123", displayName: "MT",
    });
    const res = await page.request.post("http://localhost:5173/api/documents", {
      headers: { authorization: `Bearer ${token}` },
      data: { title: "Threats", content: MD, language: "markdown", privacy: "public" },
    });
    const { slug } = await res.json();
    await page.goto(`/docs/${slug}`);

    const wrap = page.locator(".md-body .md-table-wrap");
    await expect(wrap).toHaveCount(1);
    await expect(wrap.locator("th").last()).toHaveText("Notes");

    // The table is wider than the screen, and its box can scroll to reveal the rest.
    const { scrollWidth, clientWidth } = await wrap.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);
    await wrap.evaluate((el) => (el.scrollLeft = el.scrollWidth));
    expect(await wrap.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    const last = (await wrap.locator("th").last().boundingBox())!;
    expect(last.x + last.width).toBeLessThanOrEqual(375);

    // Cells keep a readable width instead of a word per line.
    const cell = (await wrap.locator("td").nth(2).boundingBox())!;
    expect(cell.width).toBeGreaterThan(110);

    // The page itself still doesn't scroll sideways.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
