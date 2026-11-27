import { Hono } from "hono";
import { db } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { optionalAuth } from "../middleware/optionalAuth.js";
import { generateInviteCode, isInviteExpired, isInviteExhausted } from "../lib/inviteCode.js";
import type { Variables, AuthUser, Group, GroupMember } from "../types/index.js";

type Vars = Variables & { user: AuthUser | null };
const app = new Hono<{ Variables: Vars }>();

async function getMemberRole(groupId: number, userId: number): Promise<GroupMember["role"] | null> {
  const row = await db
    .query<{ role: GroupMember["role"] }, [number, number]>(
      "SELECT role FROM group_members WHERE group_id = ? AND user_id = ?"
    )
    .get(groupId, userId);
  return row?.role ?? null;
}

function isAdminOrAbove(role: string | null) {
  return role === "owner" || role === "admin";
}

// ─── Handle invite routes (must come before /:slug to avoid param clash) ───

// PATCH /api/groups/handle-invites/:inviteId — accept or decline (invitee)
app.patch("/handle-invites/:inviteId", requireAuth, (c) => {
  const me = c.var.user!;
  const inviteId = Number(c.req.param("inviteId"));
  const body = c.req.json();
  return body.then(async (b: any) => {
    const { action } = b ?? {};
    if (!["accept", "decline"].includes(action)) return c.json({ error: "action must be accept or decline" }, 400);

    const invite = await db
      .query<{ id: number; group_id: number; status: string }, [number, number]>(
        "SELECT id, group_id, status FROM group_handle_invites WHERE id = ? AND invitee_id = ?"
      )
      .get(inviteId, me.id);
    if (!invite) return c.json({ error: "Invite not found" }, 404);
    if (invite.status !== "pending") return c.json({ error: "Invite is no longer pending" }, 400);

    await db.transaction(async () => {
      const newStatus = action === "accept" ? "accepted" : "declined";
      await db.prepare("UPDATE group_handle_invites SET status = ? WHERE id = ?").run(newStatus, invite.id);
      if (action === "accept") {
        await db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')").run(invite.group_id, me.id);
      }
    });

    return c.json({ ok: true });
  });
});

// PATCH /api/groups/handle-invites/:inviteId/read — mark invite notification as read (invitee)
app.patch("/handle-invites/:inviteId/read", requireAuth, async (c) => {
  const me = c.var.user!;
  const inviteId = Number(c.req.param("inviteId"));
  await db.prepare(
    "UPDATE group_handle_invites SET read_at = unixepoch() WHERE id = ? AND invitee_id = ? AND read_at IS NULL"
  ).run(inviteId, me.id);
  return c.json({ ok: true });
});

// ─── Join-code routes ───

// GET /api/groups/join/:code — preview invite
app.get("/join/:code", optionalAuth, async (c) => {
  const { code } = c.req.param();
  const invite = await db
    .query<
      { id: number; group_id: number; max_uses: number | null; use_count: number; expires_at: number | null },
      [string]
    >(
      "SELECT id, group_id, max_uses, use_count, expires_at FROM group_code_invites WHERE code = ?"
    )
    .get(code);

  if (!invite) return c.json({ error: "Invalid invite code" }, 404);
  if (isInviteExpired(invite.expires_at)) return c.json({ error: "This invite has expired" }, 410);
  if (isInviteExhausted(invite.use_count, invite.max_uses)) return c.json({ error: "This invite has reached its limit" }, 410);

  const group = await db.query<Group, [number]>("SELECT * FROM groups WHERE id = ?").get(invite.group_id);
  return c.json({ group, invite: { expires_at: invite.expires_at, max_uses: invite.max_uses, use_count: invite.use_count } });
});

// POST /api/groups/join/:code — join via invite code
app.post("/join/:code", requireAuth, async (c) => {
  const me = c.var.user!;
  const { code } = c.req.param();

  const invite = await db
    .query<
      { id: number; group_id: number; max_uses: number | null; use_count: number; expires_at: number | null },
      [string]
    >(
      "SELECT id, group_id, max_uses, use_count, expires_at FROM group_code_invites WHERE code = ?"
    )
    .get(code);

  if (!invite) return c.json({ error: "Invalid invite code" }, 404);
  if (isInviteExpired(invite.expires_at)) return c.json({ error: "This invite has expired" }, 410);
  if (isInviteExhausted(invite.use_count, invite.max_uses)) return c.json({ error: "This invite has reached its limit" }, 410);

  const existing = await db
    .query<{ user_id: number }, [number, number]>(
      "SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?"
    )
    .get(invite.group_id, me.id);
  if (existing) {
    const group = await db.query<Group, [number]>("SELECT * FROM groups WHERE id = ?").get(invite.group_id);
    return c.json({ group, already_member: true });
  }

  await db.transaction(async () => {
    await db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')").run(invite.group_id, me.id);
    await db.prepare("UPDATE group_code_invites SET use_count = use_count + 1 WHERE id = ?").run(invite.id);
  });

  const group = await db.query<Group, [number]>("SELECT * FROM groups WHERE id = ?").get(invite.group_id);
  return c.json({ group });
});

// ─── Search ───

// GET /api/groups/search?q=
app.get("/search", optionalAuth, async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 50);

  let groups;
  if (q) {
    const pattern = `%${q}%`;
    groups = await db
      .query<Group, [string, string, number]>(
        "SELECT * FROM groups WHERE visibility = 'public' AND (name LIKE ? OR slug LIKE ?) ORDER BY name LIMIT ?"
      )
      .all(pattern, pattern, limit);
  } else {
    groups = await db
      .query<Group, [number]>(
        "SELECT * FROM groups WHERE visibility = 'public' ORDER BY created_at DESC LIMIT ?"
      )
      .all(limit);
  }
  return c.json({ groups });
});

// ─── CRUD ───

// POST /api/groups
app.post("/", requireAuth, (c) => {
  const me = c.var.user!;
  const body = c.req.json();
  return body.then(async (b: any) => {
    const { slug, name, description, visibility = "public" } = b ?? {};
    if (!slug || !name) return c.json({ error: "slug and name are required" }, 400);
    if (!/^[a-z0-9-]{2,64}$/.test(slug)) return c.json({ error: "Invalid group slug" }, 400);
    if (!["public", "private"].includes(visibility)) return c.json({ error: "Invalid visibility" }, 400);

    const existing = await db.query("SELECT id FROM groups WHERE slug = ?").get(slug);
    if (existing) return c.json({ error: "Group slug already taken" }, 409);

    const result = await db.prepare(
      "INSERT INTO groups (slug, name, description, visibility, owner_id) VALUES (?, ?, ?, ?, ?)"
    ).run(slug, name, description ?? null, visibility, me.id);

    const groupId = result.lastInsertRowid as number;
    await db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')").run(groupId, me.id);

    const group = await db.query<Group, [number]>("SELECT * FROM groups WHERE id = ?").get(groupId);
    return c.json({ group }, 201);
  });
});

// GET /api/groups — list user's groups
app.get("/", requireAuth, async (c) => {
  const me = c.var.user!;
  const groups = await db
    .query<Group & { role: string }, [number]>(
      `SELECT g.*, gm.role FROM groups g
       JOIN group_members gm ON g.id = gm.group_id
       WHERE gm.user_id = ?
       ORDER BY g.name`
    )
    .all(me.id);
  return c.json({ groups });
});

// GET /api/groups/:slug
app.get("/:slug", optionalAuth, async (c) => {
  const { slug } = c.req.param();
  const me = c.var.user;

  const group = await db.query<Group, [string]>("SELECT * FROM groups WHERE slug = ?").get(slug);
  if (!group) return c.json({ error: "Not found" }, 404);

  const role = me ? await getMemberRole(group.id, me.id) : null;
  if (group.visibility === "private" && !role) return c.json({ error: "Not found" }, 404);

  const memberCount = (await db.query<{ cnt: number }, [number]>(
    "SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ?"
  ).get(group.id))!.cnt;

  return c.json({ group, role, member_count: memberCount });
});

// PATCH /api/groups/:slug
app.patch("/:slug", requireAuth, async (c) => {
  const me = c.var.user!;
  const { slug } = c.req.param();

  const group = await db.query<Group, [string]>("SELECT * FROM groups WHERE slug = ?").get(slug);
  if (!group) return c.json({ error: "Not found" }, 404);

  const role = await getMemberRole(group.id, me.id);
  if (!isAdminOrAbove(role)) return c.json({ error: "Forbidden" }, 403);

  const body = c.req.json();
  return body.then(async (b: any) => {
    const { name, description, visibility } = b ?? {};
    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (name !== undefined) { updates.push("name = ?"); values.push(name); }
    if (description !== undefined) { updates.push("description = ?"); values.push(description); }
    if (visibility !== undefined) {
      if (!["public", "private"].includes(visibility)) return c.json({ error: "Invalid visibility" }, 400);
      updates.push("visibility = ?");
      values.push(visibility);
    }
    if (updates.length === 0) return c.json({ error: "Nothing to update" }, 400);
    updates.push("updated_at = unixepoch()");

    await db.prepare(`UPDATE groups SET ${updates.join(", ")} WHERE id = ?`).run(...values, group.id);
    const updated = await db.query<Group, [number]>("SELECT * FROM groups WHERE id = ?").get(group.id);
    return c.json({ group: updated });
  });
});

// DELETE /api/groups/:slug
app.delete("/:slug", requireAuth, async (c) => {
  const me = c.var.user!;
  const { slug } = c.req.param();

  const group = await db.query<Group, [string]>("SELECT * FROM groups WHERE slug = ?").get(slug);
  if (!group) return c.json({ error: "Not found" }, 404);
  if (group.owner_id !== me.id) return c.json({ error: "Forbidden" }, 403);

  await db.prepare("DELETE FROM groups WHERE id = ?").run(group.id);
  return c.json({ ok: true });
});

// GET /api/groups/:slug/documents
app.get("/:slug/documents", optionalAuth, async (c) => {
  const { slug } = c.req.param();
  const me = c.var.user;

  const group = await db.query<Group, [string]>("SELECT * FROM groups WHERE slug = ?").get(slug);
  if (!group) return c.json({ error: "Not found" }, 404);

  const role = me ? await getMemberRole(group.id, me.id) : null;
  if (group.visibility === "private" && !role) return c.json({ error: "Not found" }, 404);

  const limit = Math.min(Number(c.req.query("limit") ?? 30), 100);
  const page = Math.max(Number(c.req.query("page") ?? 1), 1);
  const offset = (page - 1) * limit;

  // Only group pastes belong to a group, and only members may see them.
  if (!role) return c.json({ documents: [] });

  const docs = await db
    .query<
      { slug: string; title: string; language: string; privacy: string; owner_id: number; owner_handle: string; created_at: number },
      [number, number, number]
    >(
      `SELECT d.slug, d.title, d.language, d.privacy, d.owner_id,
              u.handle as owner_handle, d.created_at
       FROM documents d JOIN users u ON d.owner_id = u.id
       WHERE d.group_id = ? AND d.privacy = 'group'
       ORDER BY d.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(group.id, limit, offset);

  return c.json({ documents: docs });
});

// GET /api/groups/:slug/members
app.get("/:slug/members", requireAuth, async (c) => {
  const me = c.var.user!;
  const { slug } = c.req.param();

  const group = await db.query<Group, [string]>("SELECT * FROM groups WHERE slug = ?").get(slug);
  if (!group) return c.json({ error: "Not found" }, 404);

  const role = await getMemberRole(group.id, me.id);
  if (!role) return c.json({ error: "Forbidden" }, 403);

  const members = await db
    .query<
      { id: number; handle: string; display_name: string | null; avatar_url: string | null; role: string; joined_at: number },
      [number]
    >(
      `SELECT u.id, u.handle, u.display_name, u.avatar_url, gm.role, gm.joined_at
       FROM group_members gm JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = ?
       ORDER BY CASE gm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.handle`
    )
    .all(group.id);

  return c.json({ members, my_role: role });
});

// PATCH /api/groups/:slug/members/:userId
app.patch("/:slug/members/:userId", requireAuth, async (c) => {
  const me = c.var.user!;
  const { slug, userId } = c.req.param();

  const group = await db.query<Group, [string]>("SELECT * FROM groups WHERE slug = ?").get(slug);
  if (!group) return c.json({ error: "Not found" }, 404);

  const myRole = await getMemberRole(group.id, me.id);
  if (!isAdminOrAbove(myRole)) return c.json({ error: "Forbidden" }, 403);

  const body = c.req.json();
  return body.then(async (b: any) => {
    const { role } = b ?? {};
    if (!["admin", "member"].includes(role)) return c.json({ error: "role must be admin or member" }, 400);

    const targetRole = await getMemberRole(group.id, Number(userId));
    if (!targetRole) return c.json({ error: "User is not a member" }, 404);
    if (targetRole === "owner") return c.json({ error: "Cannot change owner's role" }, 403);

    await db.prepare("UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?").run(role, group.id, Number(userId));
    return c.json({ ok: true });
  });
});

// DELETE /api/groups/:slug/members/:userId
app.delete("/:slug/members/:userId", requireAuth, async (c) => {
  const me = c.var.user!;
  const { slug, userId } = c.req.param();

  const group = await db.query<Group, [string]>("SELECT * FROM groups WHERE slug = ?").get(slug);
  if (!group) return c.json({ error: "Not found" }, 404);

  const myRole = await getMemberRole(group.id, me.id);
  if (!isAdminOrAbove(myRole)) return c.json({ error: "Forbidden" }, 403);

  const targetRole = await getMemberRole(group.id, Number(userId));
  if (!targetRole) return c.json({ error: "User is not a member" }, 404);
  if (targetRole === "owner") return c.json({ error: "Cannot remove the owner" }, 403);

  await db.prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?").run(group.id, Number(userId));
  return c.json({ ok: true });
});

// POST /api/groups/:slug/leave
app.post("/:slug/leave", requireAuth, async (c) => {
  const me = c.var.user!;
  const { slug } = c.req.param();

  const group = await db.query<Group, [string]>("SELECT * FROM groups WHERE slug = ?").get(slug);
  if (!group) return c.json({ error: "Not found" }, 404);

  const role = await getMemberRole(group.id, me.id);
  if (!role) return c.json({ error: "You are not a member" }, 400);
  if (role === "owner") return c.json({ error: "Transfer ownership before leaving" }, 400);

  await db.prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?").run(group.id, me.id);
  return c.json({ ok: true });
});

// ─── Code-based invites (existing system, kept intact) ───

// POST /api/groups/:slug/invites
app.post("/:slug/invites", requireAuth, async (c) => {
  const me = c.var.user!;
  const { slug } = c.req.param();

  const group = await db.query<Group, [string]>("SELECT * FROM groups WHERE slug = ?").get(slug);
  if (!group) return c.json({ error: "Not found" }, 404);

  const role = await getMemberRole(group.id, me.id);
  if (!isAdminOrAbove(role)) return c.json({ error: "Forbidden" }, 403);

  const body = c.req.json();
  return body.then(async (b: any) => {
    const { max_uses, expires_at } = b ?? {};
    const code = generateInviteCode();

    await db.prepare(
      "INSERT INTO group_code_invites (group_id, code, created_by, max_uses, expires_at) VALUES (?, ?, ?, ?, ?)"
    ).run(group.id, code, me.id, max_uses ?? null, expires_at ?? null);

    return c.json({ code, max_uses: max_uses ?? null, expires_at: expires_at ?? null }, 201);
  });
});

// GET /api/groups/:slug/invites
app.get("/:slug/invites", requireAuth, async (c) => {
  const me = c.var.user!;
  const { slug } = c.req.param();

  const group = await db.query<Group, [string]>("SELECT * FROM groups WHERE slug = ?").get(slug);
  if (!group) return c.json({ error: "Not found" }, 404);

  const role = await getMemberRole(group.id, me.id);
  if (!isAdminOrAbove(role)) return c.json({ error: "Forbidden" }, 403);

  const invites = await db
    .query<
      { id: number; code: string; max_uses: number | null; use_count: number; expires_at: number | null; created_at: number; created_by_handle: string },
      [number]
    >(
      `SELECT i.id, i.code, i.max_uses, i.use_count, i.expires_at, i.created_at, u.handle as created_by_handle
       FROM group_code_invites i JOIN users u ON i.created_by = u.id
       WHERE i.group_id = ?
       ORDER BY i.created_at DESC`
    )
    .all(group.id);

  return c.json({ invites });
});

// DELETE /api/groups/:slug/invites/:code
app.delete("/:slug/invites/:code", requireAuth, async (c) => {
  const me = c.var.user!;
  const { slug, code } = c.req.param();

  const group = await db.query<Group, [string]>("SELECT * FROM groups WHERE slug = ?").get(slug);
  if (!group) return c.json({ error: "Not found" }, 404);

  const role = await getMemberRole(group.id, me.id);
  if (!isAdminOrAbove(role)) return c.json({ error: "Forbidden" }, 403);

  await db.prepare("DELETE FROM group_code_invites WHERE code = ? AND group_id = ?").run(code, group.id);
  return c.json({ ok: true });
});

// ─── Handle-based invites ───

// POST /api/groups/:slug/handle-invites — send invite by handle
app.post("/:slug/handle-invites", requireAuth, async (c) => {
  const me = c.var.user!;
  const { slug } = c.req.param();

  const group = await db.query<Group, [string]>("SELECT * FROM groups WHERE slug = ?").get(slug);
  if (!group) return c.json({ error: "Not found" }, 404);

  const role = await getMemberRole(group.id, me.id);
  if (!isAdminOrAbove(role)) return c.json({ error: "Forbidden" }, 403);

  const body = c.req.json();
  return body.then(async (b: any) => {
    const { handle, message } = b ?? {};
    if (!handle) return c.json({ error: "handle is required" }, 400);

    const invitee = await db
      .query<{ id: number; handle: string }, [string]>("SELECT id, handle FROM users WHERE handle = ?")
      .get(handle);
    if (!invitee) return c.json({ error: "User not found" }, 404);

    if (invitee.id === me.id) return c.json({ error: "Cannot invite yourself" }, 400);

    const alreadyMember = await getMemberRole(group.id, invitee.id);
    if (alreadyMember) return c.json({ error: "User is already a member" }, 400);

    const existing = await db
      .query<{ id: number; status: string }, [number, number]>(
        "SELECT id, status FROM group_handle_invites WHERE group_id = ? AND invitee_id = ?"
      )
      .get(group.id, invitee.id);

    if (existing) {
      if (existing.status === "pending") {
        return c.json({ error: "This user already has a pending invite to this group" }, 409);
      }
      // Previous invite was declined or accepted — reset it so it appears as a new invite
      await db.prepare(
        "UPDATE group_handle_invites SET status='pending', inviter_id=?, message=?, read_at=NULL, created_at=unixepoch() WHERE id=?"
      ).run(me.id, message ?? null, existing.id);
      return c.json({ invite_id: existing.id, invitee_handle: invitee.handle }, 201);
    }

    const result = await db.prepare(
      "INSERT INTO group_handle_invites (group_id, inviter_id, invitee_id, message) VALUES (?, ?, ?, ?)"
    ).run(group.id, me.id, invitee.id, message ?? null);
    return c.json({ invite_id: result.lastInsertRowid, invitee_handle: invitee.handle }, 201);
  });
});

// GET /api/groups/:slug/handle-invites — list pending handle invites
app.get("/:slug/handle-invites", requireAuth, async (c) => {
  const me = c.var.user!;
  const { slug } = c.req.param();

  const group = await db.query<Group, [string]>("SELECT * FROM groups WHERE slug = ?").get(slug);
  if (!group) return c.json({ error: "Not found" }, 404);

  const role = await getMemberRole(group.id, me.id);
  if (!isAdminOrAbove(role)) return c.json({ error: "Forbidden" }, 403);

  const invites = await db
    .query<
      { id: number; message: string | null; created_at: number; invitee_handle: string; invitee_display_name: string | null; inviter_handle: string },
      [number]
    >(
      `SELECT hi.id, hi.message, hi.created_at,
              invitee.handle as invitee_handle, invitee.display_name as invitee_display_name,
              inviter.handle as inviter_handle
       FROM group_handle_invites hi
       JOIN users invitee ON hi.invitee_id = invitee.id
       JOIN users inviter ON hi.inviter_id = inviter.id
       WHERE hi.group_id = ? AND hi.status = 'pending'
       ORDER BY hi.created_at DESC`
    )
    .all(group.id);

  return c.json({ invites });
});

// DELETE /api/groups/:slug/handle-invites/:id — cancel a pending handle invite
app.delete("/:slug/handle-invites/:id", requireAuth, async (c) => {
  const me = c.var.user!;
  const { slug } = c.req.param();
  const inviteId = Number(c.req.param("id"));

  const group = await db.query<Group, [string]>("SELECT * FROM groups WHERE slug = ?").get(slug);
  if (!group) return c.json({ error: "Not found" }, 404);

  const role = await getMemberRole(group.id, me.id);
  if (!isAdminOrAbove(role)) return c.json({ error: "Forbidden" }, 403);

  const invite = await db
    .query<{ id: number }, [number, number]>(
      "SELECT id FROM group_handle_invites WHERE id = ? AND group_id = ? AND status = 'pending'"
    )
    .get(inviteId, group.id);
  if (!invite) return c.json({ error: "Invite not found or already resolved" }, 404);

  await db.prepare("DELETE FROM group_handle_invites WHERE id = ?").run(inviteId);
  return c.json({ ok: true });
});

// ─── Join requests ───

// POST /api/groups/:slug/requests
app.post("/:slug/requests", requireAuth, async (c) => {
  const me = c.var.user!;
  const { slug } = c.req.param();

  const group = await db.query<Group, [string]>("SELECT * FROM groups WHERE slug = ?").get(slug);
  if (!group) return c.json({ error: "Not found" }, 404);

  if (group.visibility === "private") return c.json({ error: "This group is private" }, 403);

  const role = await getMemberRole(group.id, me.id);
  if (role) return c.json({ error: "You are already a member" }, 400);

  const body = c.req.json();
  return body.then(async (b: any) => {
    const { message } = b ?? {};
    try {
      await db.prepare(
        "INSERT INTO group_join_requests (group_id, user_id, message) VALUES (?, ?, ?)"
      ).run(group.id, me.id, message ?? null);
    } catch (e: any) {
      if (e.message?.includes("UNIQUE")) {
        return c.json({ error: "You already have a pending request" }, 409);
      }
      throw e;
    }
    return c.json({ ok: true }, 201);
  });
});

// GET /api/groups/:slug/requests
app.get("/:slug/requests", requireAuth, async (c) => {
  const me = c.var.user!;
  const { slug } = c.req.param();

  const group = await db.query<Group, [string]>("SELECT * FROM groups WHERE slug = ?").get(slug);
  if (!group) return c.json({ error: "Not found" }, 404);

  const role = await getMemberRole(group.id, me.id);
  if (!isAdminOrAbove(role)) return c.json({ error: "Forbidden" }, 403);

  const status = c.req.query("status") ?? "pending";
  const requests = await db
    .query<
      { id: number; message: string | null; status: string; created_at: number; handle: string; display_name: string | null; avatar_url: string | null },
      [number, string]
    >(
      `SELECT r.id, r.message, r.status, r.created_at, u.handle, u.display_name, u.avatar_url
       FROM group_join_requests r JOIN users u ON r.user_id = u.id
       WHERE r.group_id = ? AND r.status = ?
       ORDER BY r.created_at`
    )
    .all(group.id, status);

  return c.json({ requests });
});

// PATCH /api/groups/:slug/requests/:requestId
app.patch("/:slug/requests/:requestId", requireAuth, async (c) => {
  const me = c.var.user!;
  const { slug, requestId } = c.req.param();

  const group = await db.query<Group, [string]>("SELECT * FROM groups WHERE slug = ?").get(slug);
  if (!group) return c.json({ error: "Not found" }, 404);

  const role = await getMemberRole(group.id, me.id);
  if (!isAdminOrAbove(role)) return c.json({ error: "Forbidden" }, 403);

  const body = c.req.json();
  return body.then(async (b: any) => {
    const { action } = b ?? {};
    if (!["approve", "reject"].includes(action)) return c.json({ error: "action must be approve or reject" }, 400);

    const request = await db
      .query<{ id: number; user_id: number; status: string }, [number, number]>(
        "SELECT id, user_id, status FROM group_join_requests WHERE id = ? AND group_id = ?"
      )
      .get(Number(requestId), group.id);
    if (!request) return c.json({ error: "Request not found" }, 404);
    if (request.status !== "pending") return c.json({ error: "Request is no longer pending" }, 400);

    await db.transaction(async () => {
      const newStatus = action === "approve" ? "approved" : "rejected";
      await db.prepare(
        "UPDATE group_join_requests SET status = ?, reviewed_by = ?, updated_at = unixepoch() WHERE id = ?"
      ).run(newStatus, me.id, request.id);

      if (action === "approve") {
        await db.prepare(
          "INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')"
        ).run(group.id, request.user_id);
      }
    });

    return c.json({ ok: true });
  });
});

export default app;
