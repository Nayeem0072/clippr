import { test, expect, uid } from "../fixtures";
import type { Page } from "@playwright/test";

// Markdown is its own paste type: a mode icon in the editor's top-right, with Write / Preview tabs.
const MD = "# Release notes\n\nSome **bold** text.\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```js\nconst a = 1;\n```";
const SHOTS = process.env.SHOT_DIR;

async function login(auth: any, prefix: string) {
  const id = uid();
  return auth.createAndLogin({
    handle: `${prefix}-${id}`.slice(0, 32),
    email: `${prefix}-${id}@example.com`,
    password: "password123",
    displayName: `${prefix} tester`,
  }) as Promise<string>;
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.waitForTimeout(500); // let page fade-ins and tab transitions settle
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function typeMarkdown(page: Page, text: string) {
  await page.locator(".md-editor .cm-content").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText(text);
}

for (const vp of [
  { name: "desktop", width: 1280, height: 860 },
  { name: "mobile", width: 375, height: 760 },
]) {
  test.describe(`Markdown pastes (${vp.name})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("create with preview, view, and edit", async ({ page, auth }) => {
      await login(auth, "md");
      await page.goto("/new");

      await page.getByRole("button", { name: "Switch to Markdown" }).click();
      await expect(page.getByRole("button", { name: "Switch to Markdown" })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("combobox", { name: "Language" })).toHaveCount(0);
      await expect(page.getByRole("tab", { name: "Write" })).toHaveAttribute("aria-selected", "true");

      // Empty preview
      await page.getByRole("tab", { name: "Preview" }).click();
      await expect(page.getByText("Nothing to preview")).toBeVisible();
      await page.getByRole("tab", { name: "Write" }).click();

      await typeMarkdown(page, MD);
      await page.getByPlaceholder("Untitled document").fill("Notes");
      await shot(page, `${vp.name}-1-write`);

      await page.getByRole("tab", { name: "Preview" }).click();
      const preview = page.locator(".md-editor .md-body");
      await expect(preview.getByRole("heading", { name: "Release notes" })).toBeVisible();
      await expect(preview.locator("strong")).toHaveText("bold");
      await expect(preview.locator(".md-table-wrap table")).toBeVisible();
      await shot(page, `${vp.name}-2-preview`);

      // Back to Write keeps the text
      await page.getByRole("tab", { name: "Write" }).click();
      await expect(page.locator(".md-editor .cm-content")).toContainText("Release notes");

      // No horizontal page scroll
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);

      await page.getByRole("button", { name: "Save Paste" }).click();
      await page.waitForURL(/\/docs\//);
      const slug = page.url().split("/docs/")[1];
      await expect(page.locator(".md-body").getByRole("heading", { name: "Release notes" })).toBeVisible();
      await expect(page.getByText("Notes.md")).toBeVisible();
      await shot(page, `${vp.name}-3-view`);

      // Edit opens in Markdown mode with Preview
      await page.goto(`/docs/${slug}/edit`);
      await expect(page.getByText("Edit Markdown")).toBeVisible();
      await expect(page.getByRole("combobox", { name: "Language" })).toHaveCount(0);
      await typeMarkdown(page, "\n\nAdded line.");
      await page.getByRole("tab", { name: "Preview" }).click();
      await expect(page.locator(".md-editor .md-body")).toContainText("Added line.");
      await shot(page, `${vp.name}-4-edit-preview`);
      await page.getByRole("button", { name: "Save Changes" }).click();
      await page.waitForURL(new RegExp(`/docs/${slug}$`));
      await expect(page.locator(".md-body").locator("p").last()).toHaveText("Added line.");
      await shot(page, `${vp.name}-5-view-edited`);
    });
  });
}

test("light theme preview", async ({ page, auth }) => {
  await login(auth, "mdl");
  await page.evaluate(() => localStorage.setItem("clippr-theme", "light"));
  await page.goto("/new");
  await page.getByRole("button", { name: "Switch to Markdown" }).click();
  await typeMarkdown(page, MD);
  await page.getByRole("tab", { name: "Preview" }).click();
  const bg = await page.locator(".md-editor .md-body").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe("rgb(255, 255, 255)");
  await shot(page, "light-preview");
});

test("old 'markdown' default language opens /new in Markdown mode", async ({ page, auth }) => {
  await login(auth, "mdd");
  await page.evaluate(() => localStorage.setItem("paste_default_language", "markdown"));
  await page.goto("/new");
  await expect(page.getByRole("button", { name: "Switch to Markdown" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Switch to text" }).click();
  await expect(page.getByRole("combobox", { name: "Language" })).toHaveValue("plaintext");
});
