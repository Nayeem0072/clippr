/**
 * Integration tests for the full Hono app (src/app.ts) running on the libSQL data layer.
 *
 * These guard the async conversion of every route: each request goes through the real
 * middleware + handlers against the migrated test DB from src/test/setup.ts — the same
 * code path the Vercel function (api/index.ts) uses.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { app } from "./app.js";

type Json = Record<string, any>;

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await app.fetch(
    new Request(`http://test.local${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? ((await res.json()) as Json) : null;
  return { status: res.status, data: data as Json, res };
}

const uid = Math.random().toString(36).slice(2, 8);
const handle = (n: string) => `${n}-${uid}`;

async function signup(name: string) {
  const r = await call("POST", "/api/auth/signup", {
    email: `${handle(name)}@example.com`,
    password: "password123",
    handle: handle(name),
  });
  expect(r.status).toBe(201);
  return { token: r.data.token as string, user: r.data.user as Json };
}

let alice: { token: string; user: Json };
let bob: { token: string; user: Json };

beforeAll(async () => {
  alice = await signup("alice");
  bob = await signup("bob");
});

describe("health", () => {
  it("responds on /health and /api/health", async () => {
    expect((await call("GET", "/health")).status).toBe(200);
    expect((await call("GET", "/api/health")).status).toBe(200);
  });
});

describe("auth", () => {
  it("rejects duplicate handle/email", async () => {
    const r = await call("POST", "/api/auth/signup", {
      email: `${handle("alice")}@example.com`,
      password: "password123",
      handle: handle("alice"),
    });
    expect(r.status).toBe(409);
  });

  it("logs in with the right password only", async () => {
    const ok = await call("POST", "/api/auth/login", { email: `${handle("alice")}@example.com`, password: "password123" });
    expect(ok.status).toBe(200);
    expect(ok.data.user.handle).toBe(handle("alice"));
    const bad = await call("POST", "/api/auth/login", { email: `${handle("alice")}@example.com`, password: "wrong-pass" });
    expect(bad.status).toBe(401);
  });

  it("/me requires a valid token", async () => {
    expect((await call("GET", "/api/auth/me")).status).toBe(401);
    expect((await call("GET", "/api/auth/me", undefined, "garbage")).status).toBe(401);
    const me = await call("GET", "/api/auth/me", undefined, alice.token);
    expect(me.status).toBe(200);
    expect(me.data.user.id).toBe(alice.user.id);
  });

  it("rejects reserved handles that would shadow app routes", async () => {
    const r = await call("POST", "/api/auth/signup", { email: `mux-${uid}@example.com`, password: "password123", handle: "mux" });
    expect(r.status).toBe(400);
    expect((await call("GET", "/api/auth/check-handle?handle=mux")).data.available).toBe(false);
    expect((await call("GET", "/api/auth/check-handle?handle=settings")).data.available).toBe(false);
  });

  it("check-handle reports availability", async () => {
    expect((await call("GET", `/api/auth/check-handle?handle=${handle("alice")}`)).data.available).toBe(false);
    expect((await call("GET", `/api/auth/check-handle?handle=${handle("nobody")}`)).data.available).toBe(true);
  });
});

describe("documents", () => {
  it("creates, highlights, reads and counts views on a public paste", async () => {
    const created = await call(
      "POST",
      "/api/documents",
      { title: "Hello", content: "const x = 1;", language: "typescript" },
      alice.token
    );
    expect(created.status).toBe(201);
    const slug = created.data.slug;

    const first = await call("GET", `/api/documents/${slug}`);
    expect(first.status).toBe(200);
    expect(first.data.doc.highlighted_html).toContain("<span");
    expect(first.data.doc.owner.handle).toBe(handle("alice"));

    const second = await call("GET", `/api/documents/${slug}`);
    expect(second.data.doc.view_count).toBe(first.data.doc.view_count + 1);
  });

  it("hides private pastes from other users until shared", async () => {
    const { data } = await call("POST", "/api/documents", { content: "secret", privacy: "private" }, alice.token);
    const slug = data.slug;

    expect((await call("GET", `/api/documents/${slug}`)).status).toBe(403);
    expect((await call("GET", `/api/documents/${slug}`, undefined, bob.token)).status).toBe(403);
    expect((await call("GET", `/api/documents/${slug}`, undefined, alice.token)).status).toBe(200);

    const share = await call("POST", `/api/documents/${slug}/shares`, { handle_or_email: handle("bob") }, alice.token);
    expect(share.status).toBe(200);
    expect((await call("GET", `/api/documents/${slug}`, undefined, bob.token)).status).toBe(200);
  });

  it("only the owner can edit or delete", async () => {
    const { data } = await call("POST", "/api/documents", { content: "mine" }, alice.token);
    expect((await call("PATCH", `/api/documents/${data.slug}`, { title: "x" }, bob.token)).status).toBe(403);
    expect((await call("DELETE", `/api/documents/${data.slug}`, undefined, bob.token)).status).toBe(403);

    const upd = await call("PATCH", `/api/documents/${data.slug}`, { title: "Renamed" }, alice.token);
    expect(upd.data.doc.title).toBe("Renamed");
    expect((await call("DELETE", `/api/documents/${data.slug}`, undefined, alice.token)).status).toBe(200);
    expect((await call("GET", `/api/documents/${data.slug}`)).status).toBe(404);
  });

  it("lists the caller's own docs with a total", async () => {
    const r = await call("GET", "/api/documents", undefined, bob.token);
    expect(r.status).toBe(200);
    expect(r.data.total).toBe(0);
    expect(r.data.docs).toEqual([]);
  });
});

describe("documents: concurrent edits (expected_updated_at)", () => {
  it("saves when expected_updated_at matches, and rejects a stale one with 409", async () => {
    const { data } = await call("POST", "/api/documents", { title: "Keep", content: "v1", privacy: "private" }, alice.token);
    const loaded = (await call("GET", `/api/documents/${data.slug}`, undefined, alice.token)).data.doc;

    const ok = await call(
      "PATCH", `/api/documents/${data.slug}`,
      { content: "v2 content", expected_updated_at: loaded.updated_at }, alice.token
    );
    expect(ok.status).toBe(200);
    expect(ok.data.doc.content).toBe("v2 content");
    expect(ok.data.doc.highlighted_html).toContain("v2 content");
    // content-only edit leaves other fields alone
    expect(ok.data.doc.title).toBe("Keep");
    expect(ok.data.doc.privacy).toBe("private");

    const stale = await call(
      "PATCH", `/api/documents/${data.slug}`,
      { content: "v3", expected_updated_at: loaded.updated_at - 100 }, alice.token
    );
    expect(stale.status).toBe(409);
    expect(stale.data.doc.content).toBe("v2 content");
    const after = await call("GET", `/api/documents/${data.slug}`, undefined, alice.token);
    expect(after.data.doc.content).toBe("v2 content");
  });

  it("without expected_updated_at behaves as before (last write wins)", async () => {
    const { data } = await call("POST", "/api/documents", { content: "a" }, alice.token);
    const r = await call("PATCH", `/api/documents/${data.slug}`, { content: "b" }, alice.token);
    expect(r.status).toBe(200);
    expect(r.data.doc.content).toBe("b");
  });

  it("rejects a non-numeric expected_updated_at", async () => {
    const { data } = await call("POST", "/api/documents", { content: "a" }, alice.token);
    const r = await call("PATCH", `/api/documents/${data.slug}`, { content: "b", expected_updated_at: "x" }, alice.token);
    expect(r.status).toBe(400);
  });

  it("non-owners still get 403, even with a matching expected_updated_at", async () => {
    const { data } = await call("POST", "/api/documents", { content: "a" }, alice.token);
    const loaded = (await call("GET", `/api/documents/${data.slug}`)).data.doc;
    const r = await call(
      "PATCH", `/api/documents/${data.slug}`,
      { content: "hijack", expected_updated_at: loaded.updated_at }, bob.token
    );
    expect(r.status).toBe(403);
  });
});

describe("search", () => {
  it("finds public pastes via FTS5 and respects privacy", async () => {
    const word = `zebra${uid}`;
    await call("POST", "/api/documents", { content: `public ${word}s here` }, alice.token);
    await call("POST", "/api/documents", { content: `private ${word}s here`, privacy: "private" }, alice.token);

    const anon = await call("GET", `/api/search?q=${word}`);
    expect(anon.status).toBe(200);
    expect(anon.data.total).toBe(1);

    const owner = await call("GET", `/api/search?q=${word}`, undefined, alice.token);
    expect(owner.data.total).toBe(2);
  });
});

describe("groups (transaction paths)", () => {
  it("joins via invite code atomically (member added + use_count bumped)", async () => {
    const slug = `g-${uid}`;
    expect((await call("POST", "/api/groups", { slug, name: "Group" }, alice.token)).status).toBe(201);

    const inv = await call("POST", `/api/groups/${slug}/invites`, { max_uses: 1 }, alice.token);
    expect(inv.status).toBe(201);

    expect((await call("GET", `/api/groups/${slug}/members`, undefined, bob.token)).status).toBe(403);

    const join = await call("POST", `/api/groups/join/${inv.data.code}`, undefined, bob.token);
    expect(join.status).toBe(200);
    expect(join.data.group.slug).toBe(slug);

    const members = await call("GET", `/api/groups/${slug}/members`, undefined, bob.token);
    expect(members.status).toBe(200);
    expect(members.data.members.map((m: Json) => m.handle).sort()).toEqual([handle("alice"), handle("bob")].sort());

    // Invite is now exhausted
    const carol = await signup("carol");
    expect((await call("POST", `/api/groups/join/${inv.data.code}`, undefined, carol.token)).status).toBe(410);
  });

  it("accepts a handle invite (status update + membership in one transaction)", async () => {
    const slug = `h-${uid}`;
    await call("POST", "/api/groups", { slug, name: "Handle Group" }, alice.token);
    const dave = await signup("dave");

    const sent = await call("POST", `/api/groups/${slug}/handle-invites`, { handle: handle("dave") }, alice.token);
    expect(sent.status).toBe(201);

    const notes = await call("GET", "/api/sends/notifications", undefined, dave.token);
    const invite = notes.data.notifications.find((n: Json) => n.type === "group_invite");
    expect(invite).toBeTruthy();

    const accept = await call("PATCH", `/api/groups/handle-invites/${invite.id}`, { action: "accept" }, dave.token);
    expect(accept.status).toBe(200);
    expect((await call("GET", `/api/groups/${slug}/members`, undefined, dave.token)).status).toBe(200);

    // Can't accept twice
    const again = await call("PATCH", `/api/groups/handle-invites/${invite.id}`, { action: "accept" }, dave.token);
    expect(again.status).toBe(400);
  });

  it("approves a join request (request status + membership in one transaction)", async () => {
    const slug = `r-${uid}`;
    await call("POST", "/api/groups", { slug, name: "Request Group" }, alice.token);
    const erin = await signup("erin");

    expect((await call("POST", `/api/groups/${slug}/requests`, {}, erin.token)).status).toBe(201);
    const list = await call("GET", `/api/groups/${slug}/requests`, undefined, alice.token);
    const req = list.data.requests[0];

    // Non-admin cannot review
    expect((await call("PATCH", `/api/groups/${slug}/requests/${req.id}`, { action: "approve" }, erin.token)).status).toBe(403);

    const ok = await call("PATCH", `/api/groups/${slug}/requests/${req.id}`, { action: "approve" }, alice.token);
    expect(ok.status).toBe(200);
    expect((await call("GET", `/api/groups/${slug}/members`, undefined, erin.token)).status).toBe(200);
  });

  it("member role checks: cannot remove or demote the owner", async () => {
    const slug = `o-${uid}`;
    await call("POST", "/api/groups", { slug, name: "Owner Group" }, alice.token);
    const del = await call("DELETE", `/api/groups/${slug}/members/${alice.user.id}`, undefined, alice.token);
    expect(del.status).toBe(403);
    const missing = await call("DELETE", `/api/groups/${slug}/members/999999`, undefined, alice.token);
    expect(missing.status).toBe(404);
  });
});

describe("sends + saved", () => {
  it("sends a paste, shows it in the inbox, and saves it", async () => {
    const { data } = await call("POST", "/api/documents", { content: "share me" }, alice.token);

    const send = await call("POST", "/api/sends", { doc_slug: data.slug, handle_or_email: handle("bob") }, alice.token);
    expect(send.status).toBe(201);

    const inbox = await call("GET", "/api/sends/inbox", undefined, bob.token);
    expect(inbox.data.sends.some((s: Json) => s.slug === data.slug)).toBe(true);
    expect((await call("GET", "/api/sends/unread-count", undefined, bob.token)).data.count).toBeGreaterThan(0);

    expect((await call("POST", "/api/saved", { slug: data.slug }, bob.token)).status).toBe(201);
    expect((await call("POST", "/api/saved", { slug: data.slug }, bob.token)).status).toBe(409);
    expect((await call("POST", "/api/saved", { slug: data.slug }, alice.token)).status).toBe(400); // own paste
    expect((await call("GET", `/api/saved/check/${data.slug}`, undefined, bob.token)).data.is_saved).toBe(true);
    const saved = await call("GET", "/api/saved", undefined, bob.token);
    expect(saved.data.pastes.map((p: Json) => p.slug)).toContain(data.slug);
  });
});

describe("trending + users", () => {
  it("returns trending public pastes", async () => {
    const r = await call("GET", "/api/trending");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data.results)).toBe(true);
  });

  it("hides email on other users' profiles", async () => {
    const other = await call("GET", `/api/users/${handle("alice")}`, undefined, bob.token);
    expect(other.status).toBe(200);
    expect(other.data.user.email).toBeUndefined();
    const self = await call("GET", `/api/users/${handle("alice")}`, undefined, alice.token);
    expect(self.data.user.email).toBe(`${handle("alice")}@example.com`);
  });
});

describe("og images", () => {
  it("renders a PNG with bundled fonts", async () => {
    const { data } = await call("POST", "/api/documents", { title: "OG", content: "x" }, alice.token);
    const r = await call("GET", `/api/og/image/${data.slug}.png`);
    expect(r.status).toBe(200);
    expect(r.res.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await r.res.arrayBuffer());
    expect([...bytes.slice(1, 4)].map((b) => String.fromCharCode(b)).join("")).toBe("PNG");
  });
});

describe("bot link previews (Vercel passes the original URL after a rewrite)", () => {
  it("serves paste meta on /docs/:slug, matching /api/og/meta/:slug", async () => {
    const { data } = await call("POST", "/api/documents", { title: "Preview me", content: "hello" }, alice.token);
    const viaRewrite = await app.fetch(new Request(`http://test.local/docs/${data.slug}`, { headers: { "user-agent": "Twitterbot/1.0" } }));
    expect(viaRewrite.status).toBe(200);
    const html = await viaRewrite.text();
    expect(html).toContain('property="og:title"');
    expect(html).toContain("Preview me");
    expect(html).toContain(`/api/og/image/${data.slug}`);

    const direct = await app.fetch(new Request(`http://test.local/api/og/meta/${data.slug}`));
    expect(await direct.text()).toBe(html);
  });

  it("serves invite meta on /join/:code", async () => {
    const slug = `p-${uid}`;
    await call("POST", "/api/groups", { slug, name: "Preview Group" }, alice.token);
    const inv = await call("POST", `/api/groups/${slug}/invites`, {}, alice.token);
    const res = await app.fetch(new Request(`http://test.local/join/${inv.data.code}`, { headers: { "user-agent": "Slackbot" } }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Preview Group");
  });

  it("behaves like the direct meta route for an unknown slug", async () => {
    const viaRewrite = await app.fetch(new Request("http://test.local/docs/doesnotexist"));
    const direct = await app.fetch(new Request("http://test.local/api/og/meta/doesnotexist"));
    expect(viaRewrite.status).toBe(direct.status);
  });
});
