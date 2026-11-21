import { test, expect, uid } from "../fixtures";
import type { Page } from "@playwright/test";

const API = "http://localhost:5173/api";

async function login(auth: any, prefix: string) {
  const id = uid();
  return auth.createAndLogin({
    handle: `${prefix}-${id}`.slice(0, 32),
    email: `${prefix}-${id}@example.com`,
    password: "password123",
    displayName: `${prefix} tester`,
  }) as Promise<string>;
}

async function createChecklist(page: Page, title: string, items: string[]) {
  await page.goto("/new");
  await page.getByRole("button", { name: "Switch to checklist" }).click();
  const editor = page.getByTestId("checklist-editor");
  await editor.getByRole("textbox", { name: "Item 1" }).fill(items[0]);
  for (let i = 1; i < items.length; i++) {
    await page.keyboard.press("Enter");
    await editor.getByRole("textbox", { name: `Item ${i + 1}` }).fill(items[i]);
  }
  await page.getByPlaceholder("Untitled checklist").fill(title);
  await page.getByRole("button", { name: "Save Paste" }).click();
  await page.waitForURL(/\/docs\//);
  return page.url().split("/docs/")[1];
}

async function apiContent(page: Page, slug: string, token: string) {
  const r = await page.request.get(`${API}/documents/${slug}`, { headers: { authorization: `Bearer ${token}` } });
  return (await r.json()).doc.content as string;
}

test.describe("Checklist pastes", () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test("create, tick from view mode, and edit", async ({ page, auth }) => {
    const token = await login(auth, "cl");
    const slug = await createChecklist(page, "Groceries", ["Milk", "Eggs"]);

    const view = page.getByTestId("checklist-view");
    const milk = view.getByRole("checkbox", { name: "Milk" });
    await expect(milk).not.toBeChecked();
    await expect(view.getByRole("checkbox", { name: "Eggs" })).not.toBeChecked();
    await expect(view).toContainText("0 of 2 done");

    // Tick straight from the paste page; no edit mode.
    await milk.check();
    await expect(view).toContainText("1 of 2 done");
    await expect.poll(() => apiContent(page, slug, token)).toBe("- [x] Milk\n- [ ] Eggs");
    await page.reload();
    await expect(page.getByTestId("checklist-view").getByRole("checkbox", { name: "Milk" })).toBeChecked();
    expect(page.url()).not.toContain("/edit");

    // Edit: add an item.
    await page.goto(`/docs/${slug}/edit`);
    const editor = page.getByTestId("checklist-editor");
    await editor.getByRole("textbox", { name: "Item 2" }).click();
    await page.keyboard.press("Enter");
    await editor.getByRole("textbox", { name: "Item 3" }).fill("Bread");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await page.waitForURL(new RegExp(`/docs/${slug}$`));
    await expect(page.getByTestId("checklist-view").getByRole("checkbox")).toHaveCount(3);
    expect(await apiContent(page, slug, token)).toBe("- [x] Milk\n- [ ] Eggs\n- [ ] Bread");
  });

  test("switching between text, checklist and diagram keeps each draft", async ({ page, auth }) => {
    await login(auth, "clm");
    await page.goto("/new");
    await expect(page.getByRole("option", { name: "checklist" })).toHaveCount(0);
    await page.locator(".cm-content").fill("some code");
    await page.getByRole("button", { name: "Switch to checklist" }).click();
    await expect(page.getByRole("button", { name: "Switch to checklist" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("textbox", { name: "Item 1" }).fill("first task");
    await page.getByRole("button", { name: "Switch to diagram" }).click();
    await expect(page.getByTestId("diagram-canvas")).toBeVisible();
    await page.getByRole("button", { name: "Switch to text" }).click();
    await expect(page.locator(".cm-content")).toContainText("some code");
    await page.getByRole("button", { name: "Switch to checklist" }).click();
    await expect(page.getByRole("textbox", { name: "Item 1" })).toHaveValue("first task");
  });

  test("other people see the ticks but can't change a public checklist", async ({ page, auth }) => {
    await login(auth, "clo");
    const slug = await createChecklist(page, "Mine", ["Only me"]);
    await auth.clearAuth();
    await login(auth, "clv");
    await page.goto(`/docs/${slug}`);
    await expect(page.getByTestId("checklist-view").getByRole("checkbox", { name: "Only me" })).toBeDisabled();
  });
});

test.describe("Checklist pastes (phone)", () => {
  test.use({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });

  test("create and tick on a phone without sideways scrolling", async ({ page, auth }) => {
    const token = await login(auth, "clp");
    const slug = await createChecklist(page, "Phone list", ["A rather long to-do item that has to wrap on a small screen", "Short"]);
    const box = page.getByTestId("checklist-view").getByRole("checkbox", { name: "Short" });
    await box.tap();
    await expect(box).toBeChecked();
    await expect.poll(() => apiContent(page, slug, token)).toContain("- [x] Short");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
