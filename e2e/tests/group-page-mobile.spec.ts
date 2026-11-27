import { test, expect, uid } from "../fixtures";

test("group page header fits a 375px screen (no sideways scroll)", async ({ page, auth }) => {
  const id = uid();
  const token = await auth.createAndLogin({
    handle: `gmob-${id}`, email: `gmob-${id}@example.com`, password: "password123", displayName: "g",
  });
  const slug = `long-group-${id}`;
  const res = await page.request.post("http://localhost:5173/api/groups", {
    headers: { Authorization: `Bearer ${token}` },
    data: { slug, name: "A Rather Long Group Name", visibility: "private" },
  });
  expect(res.status()).toBe(201);

  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/groups/${slug}`);
  const settings = page.getByRole("button", { name: "Settings" });
  await expect(settings).toBeVisible();

  const box = (await settings.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: process.env.SHOT ?? "test-results/group-mobile.png" });
});
