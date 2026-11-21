import { Hono } from "hono";
import { db } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { optionalAuth } from "../middleware/optionalAuth.js";
import { generateSlug } from "../lib/slug.js";
import { highlightCode } from "../lib/highlight.js";
import { canViewDoc } from "../lib/docAccess.js";
import { isDiagram, sanitizePreviewSvg, validateDiagram } from "../lib/diagram.js";
import type { Variables, AuthUser, Document } from "../types/index.js";

type Vars = Variables & { user: AuthUser | null };

/** Internal columns never sent to clients (search_text is derived; preview_svg is only for OG images). */
function publicDoc<T extends Document>(doc: T): Omit<T, "search_text" | "preview_svg"> {
  const { search_text: _s, preview_svg: _p, ...rest } = doc;
  return rest;
}
const app = new Hono<{ Variables: Vars }>();

// POST /api/documents
app.post("/", requireAuth, async (c) => {
  const me = c.var.user!;
  const body = await c.req.json();
  const { title, content, language = "plaintext", privacy = "public", group_id, preview_svg } = body ?? {};

  if (!content) return c.json({ error: "content is required" }, 400);
  let searchText: string = content;
  let previewSvg: string | null = null;
  if (isDiagram(language)) {
    const check = validateDiagram(content);
    if (!check.ok) return c.json({ error: check.error }, 400);
    searchText = check.text;
    previewSvg = sanitizePreviewSvg(preview_svg);
  }
  if (!["public", "group", "private"].includes(privacy)) {
    return c.json({ error: "privacy must be public, group, or private" }, 400);
  }

  if (privacy === "group") {
    if (!group_id) return c.json({ error: "group_id required for group privacy" }, 400);
    const member = await db
      .query<{ user_id: number }, [number, number]>(
        "SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?"
      )
      .get(group_id, me.id);
    if (!member) return c.json({ error: "You are not a member of that group" }, 403);
  }

  const slug = await generateSlug();
  // Diagrams are drawn in the browser; there's nothing to syntax-highlight.
  const highlighted_html = isDiagram(language) ? null : await highlightCode(content, language);

  await db.prepare(
    `INSERT INTO documents (slug, title, content, language, highlighted_html, search_text, preview_svg, privacy, group_id, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(slug, title ?? "Untitled", content, language, highlighted_html, searchText, previewSvg, privacy, group_id ?? null, me.id);

  return c.json({ slug, title: title ?? "Untitled", language, privacy, created_at: Math.floor(Date.now() / 1000) }, 201);
});

// GET /api/documents — list own docs
app.get("/", requireAuth, async (c) => {
  const me = c.var.user!;
  const page = Number(c.req.query("page") ?? 1);
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const offset = (page - 1) * limit;

  const docs = await db
    .query<
      { slug: string; title: string; language: string; privacy: string; group_id: number | null; created_at: number; updated_at: number },
      [number, number, number]
    >(
      "SELECT slug, title, language, privacy, group_id, created_at, updated_at FROM documents WHERE owner_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
    )
    .all(me.id, limit, offset);

  const total = (await db.query<{ cnt: number }, [number]>(
    "SELECT COUNT(*) as cnt FROM documents WHERE owner_id = ?"
  ).get(me.id))!.cnt;

  return c.json({ docs, page, limit, total, has_more: offset + docs.length < total });
});

// GET /api/documents/:slug
app.get("/:slug", optionalAuth, async (c) => {
  const { slug } = c.req.param();
  const me = c.var.user;

  const doc = await db.query<Document, [string]>(
    "SELECT * FROM documents WHERE slug = ?"
  ).get(slug);

  if (!doc) return c.json({ error: "Not found" }, 404);

  if (!await canViewDoc(doc, me?.id ?? null)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (doc.privacy === "public") {
    await db.prepare("UPDATE documents SET view_count = view_count + 1 WHERE id = ?").run(doc.id);
    await db.prepare("INSERT INTO document_views (doc_id) VALUES (?)").run(doc.id);
  }

  // Attach owner info
  const owner = await db.query<{ handle: string; display_name: string | null }, [number]>(
    "SELECT handle, display_name FROM users WHERE id = ?"
  ).get(doc.owner_id);

  return c.json({ doc: { ...publicDoc(doc), owner } });
});

// PATCH /api/documents/:slug
app.patch("/:slug", requireAuth, async (c) => {
  const me = c.var.user!;
  const { slug } = c.req.param();

  const doc = await db.query<Document, [string]>("SELECT * FROM documents WHERE slug = ?").get(slug);
  if (!doc) return c.json({ error: "Not found" }, 404);
  if (doc.owner_id !== me.id) return c.json({ error: "Forbidden" }, 403);

  const body = await c.req.json();
  const { title, content, language, privacy, group_id, expected_updated_at, preview_svg } = body ?? {};

  // Optimistic concurrency: long-lived editors (e.g. the Mux panel) send the updated_at
  // they loaded, so an edit made elsewhere in the meantime isn't silently overwritten.
  if (expected_updated_at !== undefined && expected_updated_at !== null) {
    if (typeof expected_updated_at !== "number") {
      return c.json({ error: "expected_updated_at must be a number" }, 400);
    }
    if (expected_updated_at !== doc.updated_at) {
      return c.json({ error: "This paste was changed elsewhere", doc: publicDoc(doc) }, 409);
    }
  }

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (title !== undefined) { updates.push("title = ?"); values.push(title); }
  if (privacy !== undefined) {
    if (!["public", "group", "private"].includes(privacy)) return c.json({ error: "Invalid privacy" }, 400);
    updates.push("privacy = ?");
    values.push(privacy);
  }
  if (group_id !== undefined) { updates.push("group_id = ?"); values.push(group_id); }

  if (content !== undefined || language !== undefined) {
    const newContent = content ?? doc.content;
    const newLang = language ?? doc.language;
    if (isDiagram(newLang) !== isDiagram(doc.language)) {
      return c.json({ error: "A diagram can't be changed into a code paste, or the other way round" }, 400);
    }
    if (content !== undefined && !content) return c.json({ error: "content is required" }, 400);
    let html: string | null;
    let searchText: string = newContent;
    if (isDiagram(newLang)) {
      const check = validateDiagram(newContent);
      if (!check.ok) return c.json({ error: check.error }, 400);
      html = null;
      searchText = check.text;
      if (content !== undefined) {
        updates.push("preview_svg = ?");
        values.push(sanitizePreviewSvg(preview_svg));
      }
    } else {
      html = await highlightCode(newContent, newLang);
    }
    if (content !== undefined) { updates.push("content = ?"); values.push(newContent); }
    if (language !== undefined) { updates.push("language = ?"); values.push(newLang); }
    updates.push("highlighted_html = ?");
    values.push(html);
    updates.push("search_text = ?");
    values.push(searchText);
  }

  if (updates.length === 0) return c.json({ error: "Nothing to update" }, 400);
  updates.push("updated_at = unixepoch()");

  await db.prepare(`UPDATE documents SET ${updates.join(", ")} WHERE slug = ?`).run(...values, slug);

  const updated = await db.query<Document, [string]>("SELECT * FROM documents WHERE slug = ?").get(slug);
  return c.json({ doc: publicDoc(updated!) });
});

// DELETE /api/documents/:slug
app.delete("/:slug", requireAuth, async (c) => {
  const me = c.var.user!;
  const { slug } = c.req.param();

  const doc = await db.query<{ id: number; owner_id: number }, [string]>(
    "SELECT id, owner_id FROM documents WHERE slug = ?"
  ).get(slug);
  if (!doc) return c.json({ error: "Not found" }, 404);
  if (doc.owner_id !== me.id) return c.json({ error: "Forbidden" }, 403);

  await db.prepare("DELETE FROM documents WHERE slug = ?").run(slug);
  return c.json({ ok: true });
});

// POST /api/documents/:slug/shares
app.post("/:slug/shares", requireAuth, async (c) => {
  const me = c.var.user!;
  const { slug } = c.req.param();

  const doc = await db.query<{ id: number; owner_id: number }, [string]>(
    "SELECT id, owner_id FROM documents WHERE slug = ?"
  ).get(slug);
  if (!doc) return c.json({ error: "Not found" }, 404);
  if (doc.owner_id !== me.id) return c.json({ error: "Forbidden" }, 403);

  const body = c.req.raw.body ? c.req.json() : Promise.resolve({});
  return body.then(async (b: any) => {
    const { handle_or_email } = b ?? {};
    if (!handle_or_email) return c.json({ error: "handle_or_email is required" }, 400);

    const target = await db
      .query<{ id: number; handle: string; display_name: string | null }, [string, string]>(
        "SELECT id, handle, display_name FROM users WHERE handle = ? OR email = ? LIMIT 1"
      )
      .get(handle_or_email, handle_or_email);
    if (!target) return c.json({ error: "User not found" }, 404);
    if (target.id === me.id) return c.json({ error: "Cannot share with yourself" }, 400);

    await db.prepare(
      "INSERT OR IGNORE INTO document_shares (doc_id, user_id, shared_by) VALUES (?, ?, ?)"
    ).run(doc.id, target.id, me.id);

    return c.json({ shared_with: target });
  });
});

// GET /api/documents/:slug/shares
app.get("/:slug/shares", requireAuth, async (c) => {
  const me = c.var.user!;
  const { slug } = c.req.param();

  const doc = await db.query<{ id: number; owner_id: number }, [string]>(
    "SELECT id, owner_id FROM documents WHERE slug = ?"
  ).get(slug);
  if (!doc) return c.json({ error: "Not found" }, 404);
  if (doc.owner_id !== me.id) return c.json({ error: "Forbidden" }, 403);

  const shares = await db
    .query<
      { id: number; handle: string; display_name: string | null; shared_at: number },
      [number]
    >(
      `SELECT u.id, u.handle, u.display_name, ds.created_at as shared_at
       FROM document_shares ds JOIN users u ON ds.user_id = u.id
       WHERE ds.doc_id = ?`
    )
    .all(doc.id);

  return c.json({ shares });
});

// DELETE /api/documents/:slug/shares/:userId
app.delete("/:slug/shares/:userId", requireAuth, async (c) => {
  const me = c.var.user!;
  const { slug, userId } = c.req.param();

  const doc = await db.query<{ id: number; owner_id: number }, [string]>(
    "SELECT id, owner_id FROM documents WHERE slug = ?"
  ).get(slug);
  if (!doc) return c.json({ error: "Not found" }, 404);
  if (doc.owner_id !== me.id) return c.json({ error: "Forbidden" }, 403);

  await db.prepare("DELETE FROM document_shares WHERE doc_id = ? AND user_id = ?").run(doc.id, Number(userId));
  return c.json({ ok: true });
});

export default app;
