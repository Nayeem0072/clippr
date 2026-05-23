export const config = {
  matcher: ["/docs/:slug+", "/join/:code+"],
};

const BOT_RE =
  /bot|crawler|spider|slackbot|discordbot|facebookexternalhit|twitterbot|telegrambot|whatsapp|linkedinbot|applebot|googlebot|bingbot/i;

export default async function middleware(req: Request): Promise<Response | undefined> {
  const ua = req.headers.get("user-agent") ?? "";
  if (!BOT_RE.test(ua)) return undefined;

  const url = new URL(req.url);
  const apiUrl = (process.env.VITE_API_URL ?? "").replace(/\/$/, "");
  if (!apiUrl) return undefined;

  let metaPath: string | null = null;
  const docsMatch = url.pathname.match(/^\/docs\/([^/]+)$/);
  const joinMatch = url.pathname.match(/^\/join\/([^/]+)$/);
  if (docsMatch) metaPath = `/og/meta/${docsMatch[1]}`;
  else if (joinMatch) metaPath = `/og/meta/invite/${joinMatch[1]}`;
  if (!metaPath) return undefined;

  try {
    const resp = await fetch(`${apiUrl}${metaPath}`);
    const html = await resp.text();
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch {
    return undefined;
  }
}
