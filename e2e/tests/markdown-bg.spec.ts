import { test, expect, uid } from "../fixtures";

// A Markdown paste sits on the same paste surface as code (white on light themes),
// not on the page background.
for (const theme of ["light", "sand", "rose"]) {
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
    expect(mdBg).toBe("rgb(255, 255, 255)");
    expect(mdBg).not.toBe(pageBg);

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
