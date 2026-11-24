import { test, expect, uid } from "../fixtures";

// A Markdown paste sits on the same paste surface as code, a step lighter than the page:
// white on light themes, a slightly lighter shade on dark ones.
const SURFACE: Record<string, string> = {
  light: "rgb(255, 255, 255)",
  sand: "rgb(255, 255, 255)",
  rose: "rgb(255, 255, 255)",
  dark: "rgb(35, 35, 43)",
  midnight: "rgb(21, 29, 49)",
  forest: "rgb(23, 33, 28)",
  plum: "rgb(34, 26, 41)",
  charcoal: "rgb(34, 33, 30)",
  espresso: "rgb(26, 25, 23)",
  lavender: "rgb(255, 255, 255)",
  peach: "rgb(255, 255, 255)",
};

function lum(rgb: string) {
  const [r, g, b] = rgb.match(/\d+/g)!.map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

for (const theme of Object.keys(SURFACE)) {
  test(`markdown paste background is the paste surface (${theme})`, async ({ page, auth, paste }) => {
    const id = uid();
    const token = await auth.createAndLogin({
      handle: `mb-${id}`.slice(0, 32), email: `mb-${id}@example.com`, password: "password123", displayName: "MB",
    });
    const md = await paste.createViaApi(token, { title: "Notes", content: "# Hello\n\nSome text.", language: "markdown" });
    const code = await paste.createViaApi(token, { title: "Code", content: "const a = 1;", language: "javascript" });
    await page.evaluate((t) => localStorage.setItem("clippr-theme", t), theme);

    await page.goto(`/docs/${md}`);
    const mdBg = await page.locator(".md-body").evaluate((el) => getComputedStyle(el).backgroundColor);
    const pageBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(mdBg).toBe(SURFACE[theme]);
    expect(lum(mdBg)).toBeGreaterThan(lum(pageBg)); // lighter than the page

    // Same as a code paste's surface.
    await page.goto(`/docs/${code}`);
    const codeBg = await page.locator(".shiki").first().evaluate((el) => {
      let n: HTMLElement | null = el as HTMLElement;
      while (n && getComputedStyle(n).backgroundColor === "rgba(0, 0, 0, 0)") n = n.parentElement;
      return n ? getComputedStyle(n).backgroundColor : "";
    });
    expect(codeBg).toBe(mdBg);
  });
}
