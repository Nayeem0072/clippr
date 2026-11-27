import { Hono } from "hono";
import { db } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import {
  canManageCollection,
  canViewCollection,
  getCollection,
  validateCollectionName,
} from "../lib/collections.js";
import type { Variables } from "../types/index.js";

const app = new Hono<{ Variables: Variables }>();

type CollectionRow = {
  id: number;
  name: string;
  owner_id: number;
  group_id: number | null;
  group_slug: string | null;
  group_name: string | null;
  my_role: string | null;
  doc_count: number;
  created_at: number;
  updated_at: number;
};

// Every collection the user can see: their personal ones and those of groups they're in.
const LIST_SQL = `
  SELECT c.id, c.name, c.owner_id, c.group_id, c.created_at, c.updated_at,
         g.slug AS group_slug, g.name AS group_name, gm.role AS my_role,
         (SELECT COUNT(*) FROM documents d WHERE d.collection_id = c.id) AS doc_count
  FROM collections c
  LEFT JOIN groups g         ON g.id = c.group_id
  LEFT JOIN group_members gm ON gm.group_id = c.group_id AND gm.user_id = ?
  WHERE ((c.group_id IS NULL AND c.owner_id = ?) OR (c.group_id IS NOT NULL AND gm.user_id IS NOT NULL))`;

function present(row: CollectionRow, userId: number) {
  const { my_role, ...rest } = row;
  const can_manage =
    row.group_id === null ? row.owner_id === userId : row.owner_id === userId || my_role === "owner" || my_role === "admin";
  return { ...rest, can_manage };
}

async function loadRow(id: number, userId: number) {
  const row = await db.query<CollectionRow, [number, number, number]>(`${LIST_SQL} AND c.id = ?`).get(userId, userId, id);
  return row ? present(row, userId) : null;
}

// GET /api/collections[?group_id=] — personal collections first, then group ones, by name.
app.get("/", requireAuth, async (c) => {
  const me = c.var.user;
  const groupParam = c.req.query("group_id");
  const groupId = groupParam !== undefined ? Number(groupParam) : null;
  if (groupParam !== undefined && !Number.isInteger(groupId)) return c.json({ error: "Invalid group_id" }, 400);

  const rows = await db
    .query<CollectionRow, [number, number, number | null, number | null]>(
      `${LIST_SQL} AND (? IS NULL OR c.group_id = ?)
       ORDER BY c.group_id IS NOT NULL, g.name COLLATE NOCASE, c.name COLLATE NOCASE`
    )
    .all(me.id, me.id, groupId, groupId);
  return c.json({ collections: rows.map((r) => present(r, me.id)) });
});

// POST /api/collections { name, group_id? }
app.post("/", requireAuth, async (c) => {
  const me = c.var.user;
  const body = await c.req.json().catch(() => null);
  const check = validateCollectionName(body?.name);
  if (!check.ok) return c.json({ error: check.error }, 400);

  let groupId: number | null = null;
  if (body?.group_id !== undefined && body?.group_id !== null) {
    groupId = Number(body.group_id);
    if (!Number.isInteger(groupId)) return c.json({ error: "Invalid group_id" }, 400);
    const member = await db
      .query<{ user_id: number }, [number, number]>("SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?")
      .get(groupId, me.id);
    if (!member) return c.json({ error: "You are not a member of that group" }, 403);
  }

  const result = await db
    .prepare("INSERT INTO collections (name, owner_id, group_id) VALUES (?, ?, ?)")
    .run(check.name, me.id, groupId);
  const collection = await loadRow(Number(result.lastInsertRowid), me.id);
  return c.json({ collection }, 201);
});

// GET /api/collections/:id — the collection and the pastes in it.
app.get("/:id", requireAuth, async (c) => {
  const me = c.var.user;
  const col = await getCollection(c.req.param("id"));
  // 404 (not 403) so other people's collections don't reveal that they exist.
  if (!col || !(await canViewCollection(col, me.id))) return c.json({ error: "Not found" }, 404);

  const documents = await db
    .query<
      {
        slug: string; title: string; language: string; privacy: string; group_id: number | null;
        view_count: number; created_at: number; updated_at: number; owner_id: number;
        owner_handle: string; owner_display: string | null;
      },
      [number, number, number, number]
    >(
      `SELECT d.slug, d.title, d.language, d.privacy, d.group_id, d.view_count, d.created_at, d.updated_at,
              d.owner_id, u.handle AS owner_handle, u.display_name AS owner_display
       FROM documents d JOIN users u ON u.id = d.owner_id
       WHERE d.collection_id = ?
         AND (
           d.owner_id = ? OR d.privacy = 'public'
           OR (d.privacy = 'group' AND EXISTS (
                 SELECT 1 FROM group_members gm WHERE gm.group_id = d.group_id AND gm.user_id = ?))
           OR (d.privacy = 'private' AND EXISTS (
                 SELECT 1 FROM document_shares ds WHERE ds.doc_id = d.id AND ds.user_id = ?))
         )
       ORDER BY d.updated_at DESC`
    )
    .all(col.id, me.id, me.id, me.id);

  return c.json({ collection: await loadRow(col.id, me.id), documents });
});

// PATCH /api/collections/:id { name }
app.patch("/:id", requireAuth, async (c) => {
  const me = c.var.user;
  const col = await getCollection(c.req.param("id"));
  if (!col || !(await canViewCollection(col, me.id))) return c.json({ error: "Not found" }, 404);
  if (!(await canManageCollection(col, me.id))) return c.json({ error: "Forbidden" }, 403);

  const body = await c.req.json().catch(() => null);
  const check = validateCollectionName(body?.name);
  if (!check.ok) return c.json({ error: check.error }, 400);

  await db.prepare("UPDATE collections SET name = ?, updated_at = unixepoch() WHERE id = ?").run(check.name, col.id);
  return c.json({ collection: await loadRow(col.id, me.id) });
});

// DELETE /api/collections/:id — the pastes stay; they just leave the collection.
app.delete("/:id", requireAuth, async (c) => {
  const me = c.var.user;
  const col = await getCollection(c.req.param("id"));
  if (!col || !(await canViewCollection(col, me.id))) return c.json({ error: "Not found" }, 404);
  if (!(await canManageCollection(col, me.id))) return c.json({ error: "Forbidden" }, 403);

  await db.transaction(async () => {
    await db.prepare("UPDATE documents SET collection_id = NULL WHERE collection_id = ?").run(col.id);
    await db.prepare("DELETE FROM collections WHERE id = ?").run(col.id);
  });
  return c.json({ ok: true });
});

export default app;
