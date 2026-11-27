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

describe("group pastes: only group-privacy pastes belong to a group", () => {
  async function setup(prefix: string) {
    const slug = `${prefix}-${uid}`;
    expect((await call("POST", "/api/groups", { slug, name: "Group", visibility: "public" }, alice.token)).status).toBe(201);
    const g = await call("GET", `/api/groups/${slug}`, undefined, alice.token);
    return { slug, id: g.data.group.id as number };
  }
  const listed = async (slug: string, token?: string) =>
    ((await call("GET", `/api/groups/${slug}/documents`, undefined, token)).data.documents as Json[]).map((d) => d.slug);

  it("making a group paste public detaches it from the group page", async () => {
    const g = await setup("gp-detach");
    const doc = await call("POST", "/api/documents", { content: "x", privacy: "group", group_id: g.id }, alice.token);
    expect(await listed(g.slug, alice.token)).toEqual([doc.data.slug]);

    // The edit page sends no group_id when the paste stops being a group paste.
    expect((await call("PATCH", `/api/documents/${doc.data.slug}`, { privacy: "public" }, alice.token)).status).toBe(200);
    expect(await listed(g.slug, alice.token)).toEqual([]);
    const got = await call("GET", `/api/documents/${doc.data.slug}`, undefined, alice.token);
    expect(got.data.doc.group_id).toBeNull();

    // And back into the group.
    await call("PATCH", `/api/documents/${doc.data.slug}`, { privacy: "group", group_id: g.id }, alice.token);
    expect(await listed(g.slug, alice.token)).toEqual([doc.data.slug]);
  });

  it("a public paste created with a group_id isn't attached to the group", async () => {
    const g = await setup("gp-create");
    const doc = await call("POST", "/api/documents", { content: "x", privacy: "public", group_id: g.id }, alice.token);
    expect(doc.status).toBe(201);
    expect(await listed(g.slug, alice.token)).toEqual([]);
  });

  it("non-members see no pastes on a public group", async () => {
    const g = await setup("gp-outsider");
    await call("POST", "/api/documents", { content: "x", privacy: "group", group_id: g.id }, alice.token);
    expect(await listed(g.slug, bob.token)).toEqual([]);
    expect(await listed(g.slug)).toEqual([]);
  });

  it("can't move a paste into a group you're not in, or into a group without a group_id", async () => {
    const g = await setup("gp-foreign");
    const mine = await call("POST", "/api/documents", { content: "x", privacy: "public" }, bob.token);
    const into = await call("PATCH", `/api/documents/${mine.data.slug}`, { privacy: "group", group_id: g.id }, bob.token);
    expect(into.status).toBe(403);
    const noGroup = await call("PATCH", `/api/documents/${mine.data.slug}`, { privacy: "group" }, bob.token);
    expect(noGroup.status).toBe(400);
    expect(await listed(g.slug, alice.token)).toEqual([]);
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
    expect((await call("GET", `/api/saved/check/${data.slug}`, undefined, bob.token)).data.is_saved).toBe(true);
    const saved = await call("GET", "/api/saved", undefined, bob.token);
    expect(saved.data.pastes.map((p: Json) => p.slug)).toContain(data.slug);
  });

  it("lets the owner save their own pastes, private ones included", async () => {
    const pub = await call("POST", "/api/documents", { content: "mine, public" }, alice.token);
    const priv = await call("POST", "/api/documents", { content: "mine, private", privacy: "private" }, alice.token);

    expect((await call("POST", "/api/saved", { slug: pub.data.slug }, alice.token)).status).toBe(201);
    expect((await call("POST", "/api/saved", { slug: priv.data.slug }, alice.token)).status).toBe(201);
    expect((await call("POST", "/api/saved", { slug: priv.data.slug }, alice.token)).status).toBe(409);
    expect((await call("GET", `/api/saved/check/${priv.data.slug}`, undefined, alice.token)).data.is_saved).toBe(true);

    const mine = await call("GET", "/api/saved", undefined, alice.token);
    const slugs = mine.data.pastes.map((p: Json) => p.slug);
    expect(slugs).toContain(pub.data.slug);
    expect(slugs).toContain(priv.data.slug);

    // Someone else's saved list is unaffected, and they can't save the private one.
    const bobs = await call("GET", "/api/saved", undefined, bob.token);
    expect(bobs.data.pastes.map((p: Json) => p.slug)).not.toContain(priv.data.slug);
    expect((await call("POST", "/api/saved", { slug: priv.data.slug }, bob.token)).status).toBe(403);

    expect((await call("DELETE", `/api/saved/${priv.data.slug}`, undefined, alice.token)).status).toBe(200);
    expect((await call("GET", `/api/saved/check/${priv.data.slug}`, undefined, alice.token)).data.is_saved).toBe(false);
  });

  it("saves a private paste shared with you, and drops it when the share goes away", async () => {
    const priv = await call("POST", "/api/documents", { content: "secret", privacy: "private" }, alice.token);
    expect((await call("POST", "/api/saved", { slug: priv.data.slug }, bob.token)).status).toBe(403);

    const share = await call("POST", `/api/documents/${priv.data.slug}/shares`, { handle_or_email: handle("bob") }, alice.token);
    expect(share.status).toBe(200);
    expect((await call("POST", "/api/saved", { slug: priv.data.slug }, bob.token)).status).toBe(201);
    expect((await call("GET", "/api/saved", undefined, bob.token)).data.pastes.map((p: Json) => p.slug)).toContain(priv.data.slug);

    const unshare = await call("DELETE", `/api/documents/${priv.data.slug}/shares/${bob.user.id}`, undefined, alice.token);
    expect(unshare.status).toBe(200);
    expect((await call("GET", "/api/saved", undefined, bob.token)).data.pastes.map((p: Json) => p.slug)).not.toContain(priv.data.slug);
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

describe("diagram pastes", () => {
  const label = `flamingo${uid}`;
  const scene = (text = label, extra: Json = {}) =>
    JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "test",
      elements: [
        { id: "r1", type: "rectangle", x: 0, y: 0, width: 100, height: 60, strokeColor: "#1e1e1e" },
        { id: "t1", type: "text", x: 10, y: 10, text, containerId: "r1" },
        { id: "t2", type: "text", x: 10, y: 90, text: "deleted words", isDeleted: true },
      ],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
      ...extra,
    });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect width="100" height="60" fill="none" stroke="#1e1e1e"/></svg>';

  async function createDiagram(body: Json = {}) {
    return call("POST", "/api/documents", { title: "Flow", language: "diagram", content: scene(), preview_svg: svg, ...body }, alice.token);
  }

  it("creates a diagram without syntax highlighting and hides internal columns", async () => {
    const r = await createDiagram();
    expect(r.status).toBe(201);
    const got = await call("GET", `/api/documents/${r.data.slug}`);
    expect(got.status).toBe(200);
    expect(got.data.doc.language).toBe("diagram");
    expect(got.data.doc.highlighted_html).toBeNull();
    expect(JSON.parse(got.data.doc.content).elements).toHaveLength(3);
    expect("preview_svg" in got.data.doc).toBe(false);
    expect("search_text" in got.data.doc).toBe(false);
  });

  it("rejects content that isn't a usable Excalidraw scene", async () => {
    const bad = [
      "not json",
      JSON.stringify({ type: "other", elements: [] }),
      JSON.stringify({ type: "excalidraw" }),
      scene(label, { files: { f1: { dataURL: "data:image/png;base64,AAAA" } } }),
      JSON.stringify({ type: "excalidraw", elements: [{ type: "text", text: "x".repeat(1_000_001) }] }),
    ];
    for (const content of bad) {
      const r = await createDiagram({ content });
      expect(r.status).toBe(400);
    }
  });

  it("indexes label text for search, never the JSON", async () => {
    const own = `ibis${uid}`;
    await createDiagram({ content: scene(own) });
    const hit = await call("GET", `/api/search?q=${own}`);
    expect(hit.data.total).toBe(1);
    expect(hit.data.results[0].language).toBe("diagram");
    expect(hit.data.results[0].excerpt).toContain(own);
    expect(hit.data.results[0].excerpt).not.toContain("{");

    const json = await call("GET", `/api/search?q=strokeColor`);
    expect(json.data.results.every((d: Json) => d.language !== "diagram")).toBe(true);
    const deleted = await call("GET", `/api/search?q=deleted%20words`, undefined, alice.token);
    expect(deleted.data.results.every((d: Json) => d.language !== "diagram")).toBe(true);
  });

  it("re-validates on PATCH, refreshes search, and keeps optimistic concurrency", async () => {
    const { data } = await createDiagram();
    const doc = (await call("GET", `/api/documents/${data.slug}`, undefined, alice.token)).data.doc;

    expect((await call("PATCH", `/api/documents/${data.slug}`, { content: "nope" }, alice.token)).status).toBe(400);

    const newLabel = `heron${uid}`;
    const ok = await call(
      "PATCH", `/api/documents/${data.slug}`,
      { content: scene(newLabel), preview_svg: svg, expected_updated_at: doc.updated_at }, alice.token
    );
    expect(ok.status).toBe(200);
    expect(ok.data.doc.highlighted_html).toBeNull();
    expect("preview_svg" in ok.data.doc).toBe(false);
    expect((await call("GET", `/api/search?q=${newLabel}`)).data.total).toBe(1);

    const stale = await call(
      "PATCH", `/api/documents/${data.slug}`,
      { content: scene("late"), expected_updated_at: doc.updated_at - 10 }, alice.token
    );
    expect(stale.status).toBe(409);
    expect("preview_svg" in stale.data.doc).toBe(false);
  });

  it("won't turn a diagram into a code paste or the other way round", async () => {
    const { data: d } = await createDiagram();
    expect((await call("PATCH", `/api/documents/${d.slug}`, { language: "python" }, alice.token)).status).toBe(400);
    const { data: code } = await call("POST", "/api/documents", { content: "print(1)", language: "python" }, alice.token);
    expect((await call("PATCH", `/api/documents/${code.slug}`, { language: "diagram", content: scene() }, alice.token)).status).toBe(400);
    // Title changes on a diagram are still fine.
    expect((await call("PATCH", `/api/documents/${d.slug}`, { title: "Renamed" }, alice.token)).status).toBe(200);
  });

  it("drops unsafe preview SVGs but still saves the diagram", async () => {
    const r = await createDiagram({ preview_svg: '<svg><script>alert(1)</script></svg>' });
    expect(r.status).toBe(201);
    const og = await call("GET", `/api/og/image/${r.data.slug}.png`);
    expect(og.status).toBe(200); // falls back to label text
  });

  it("renders link previews from the snapshot and labels", async () => {
    const { data } = await createDiagram();
    const og = await call("GET", `/api/og/image/${data.slug}.png`);
    expect(og.status).toBe(200);
    expect(og.res.headers.get("content-type")).toBe("image/png");

    const meta = await app.fetch(new Request(`http://test.local/api/og/meta/${data.slug}`));
    const html = await meta.text();
    expect(html).toContain(label);
    expect(html).not.toContain("excalidraw");
  });

  it("still indexes code pastes by their content", async () => {
    const word = `pelican${uid}`;
    await call("POST", "/api/documents", { content: `code with ${word}` }, alice.token);
    const r = await call("GET", `/api/search?q=${word}`);
    expect(r.data.total).toBe(1);
    expect(r.data.results[0].excerpt).toContain(word);
  });
});

describe("checklist pastes", () => {
  const word = `heron${uid}`;
  const list = `- [ ] buy ${word}\n- [x] wash car\n- [ ] call mum`;

  async function createList(body: Json = {}, token = alice.token) {
    return call("POST", "/api/documents", { title: "Todo", language: "checklist", content: list, ...body }, token);
  }

  /** A group alice owns and bob belongs to. */
  async function groupWithBob(prefix: string) {
    const slug = `${prefix}-${uid}`;
    expect((await call("POST", "/api/groups", { slug, name: "Checklist Group" }, alice.token)).status).toBe(201);
    const inv = await call("POST", `/api/groups/${slug}/invites`, {}, alice.token);
    expect((await call("POST", `/api/groups/join/${inv.data.code}`, undefined, bob.token)).status).toBe(200);
    const g = await call("GET", `/api/groups/${slug}`, undefined, alice.token);
    return g.data.group.id as number;
  }

  it("creates a checklist without syntax highlighting; the owner can tick", async () => {
    const r = await createList();
    expect(r.status).toBe(201);
    const got = await call("GET", `/api/documents/${r.data.slug}`, undefined, alice.token);
    expect(got.data.doc.language).toBe("checklist");
    expect(got.data.doc.highlighted_html).toBeNull();
    expect(got.data.doc.content).toBe(list);
    expect(got.data.doc.can_check).toBe(true);
    // Others viewing a public checklist can't.
    expect((await call("GET", `/api/documents/${r.data.slug}`, undefined, bob.token)).data.doc.can_check).toBe(false);
    expect((await call("GET", `/api/documents/${r.data.slug}`)).data.doc.can_check).toBe(false);
  });

  it("rejects content that isn't a checklist", async () => {
    for (const content of ["just text", "- [ ] ok\nnot a task", "- [ ]   ", `- [ ] ${"x".repeat(501)}`]) {
      expect((await createList({ content })).status).toBe(400);
    }
    const many = Array.from({ length: 501 }, (_, i) => `- [ ] item ${i}`).join("\n");
    expect((await createList({ content: many })).status).toBe(400);
  });

  it("normalises line endings and blank lines", async () => {
    const r = await createList({ content: "- [ ] a\r\n\r\n- [X] b\r\n" });
    expect(r.status).toBe(201);
    expect((await call("GET", `/api/documents/${r.data.slug}`)).data.doc.content).toBe("- [ ] a\n- [x] b");
  });

  it("can't change between checklist and code", async () => {
    const { data } = await createList();
    expect((await call("PATCH", `/api/documents/${data.slug}`, { language: "python", content: "x = 1" }, alice.token)).status).toBe(400);
    const code = await call("POST", "/api/documents", { content: "- [ ] looks like a list" }, alice.token);
    expect((await call("PATCH", `/api/documents/${code.data.slug}`, { language: "checklist" }, alice.token)).status).toBe(400);
    const edit = await call("PATCH", `/api/documents/${data.slug}`, { content: "- [ ] only one" }, alice.token);
    expect(edit.status).toBe(200);
    expect(edit.data.doc.content).toBe("- [ ] only one");
  });

  it("indexes item text for search, never the checkbox syntax", async () => {
    const own = `egret${uid}`;
    await createList({ content: `- [x] feed ${own}` });
    const hit = await call("GET", `/api/search?q=${own}`);
    expect(hit.data.total).toBe(1);
    expect(hit.data.results[0].excerpt).not.toContain("[x]");
  });

  it("the owner ticks and unticks one item", async () => {
    const { data } = await createList();
    const tick = await call("POST", `/api/documents/${data.slug}/check`, { index: 0, checked: true, text: `buy ${word}` }, alice.token);
    expect(tick.status).toBe(200);
    expect(tick.data.doc.content).toBe(`- [x] buy ${word}\n- [x] wash car\n- [ ] call mum`);
    const untick = await call("POST", `/api/documents/${data.slug}/check`, { index: 1, checked: false, text: "wash car" }, alice.token);
    expect(untick.data.doc.content).toBe(`- [x] buy ${word}\n- [ ] wash car\n- [ ] call mum`);
  });

  it("group members can tick a group checklist; others can't", async () => {
    const groupId = await groupWithBob("cl");
    const { data } = await createList({ privacy: "group", group_id: groupId });
    expect((await call("GET", `/api/documents/${data.slug}`, undefined, bob.token)).data.doc.can_check).toBe(true);
    const tick = await call("POST", `/api/documents/${data.slug}/check`, { index: 2, checked: true, text: "call mum" }, bob.token);
    expect(tick.status).toBe(200);
    expect(tick.data.doc.content.endsWith("- [x] call mum")).toBe(true);
    // Members can tick but not edit.
    expect((await call("PATCH", `/api/documents/${data.slug}`, { content: "- [ ] mine" }, bob.token)).status).toBe(403);

    const frank = await signup("frank");
    expect((await call("POST", `/api/documents/${data.slug}/check`, { index: 0, checked: true, text: `buy ${word}` }, frank.token)).status).toBe(403);
  });

  it("only the owner can tick a public checklist", async () => {
    const { data } = await createList();
    expect((await call("POST", `/api/documents/${data.slug}/check`, { index: 0, checked: true, text: `buy ${word}` }, bob.token)).status).toBe(403);
    expect((await call("POST", `/api/documents/${data.slug}/check`, { index: 0, checked: true, text: `buy ${word}` })).status).toBe(401);
  });

  it("returns 409 when the item changed elsewhere, and 400 for bad input", async () => {
    const { data } = await createList();
    const stale = await call("POST", `/api/documents/${data.slug}/check`, { index: 0, checked: true, text: "something else" }, alice.token);
    expect(stale.status).toBe(409);
    expect(stale.data.doc.content).toBe(list);
    expect((await call("POST", `/api/documents/${data.slug}/check`, { index: 9, checked: true, text: "x" }, alice.token)).status).toBe(409);
    expect((await call("POST", `/api/documents/${data.slug}/check`, { index: -1, checked: true, text: "x" }, alice.token)).status).toBe(400);
    expect((await call("POST", `/api/documents/${data.slug}/check`, { index: 0, checked: "yes", text: "x" }, alice.token)).status).toBe(400);

    const code = await call("POST", "/api/documents", { content: "x" }, alice.token);
    expect((await call("POST", `/api/documents/${code.data.slug}/check`, { index: 0, checked: true, text: "x" }, alice.token)).status).toBe(400);
    expect((await call("POST", `/api/documents/nope${uid}/check`, { index: 0, checked: true, text: "x" }, alice.token)).status).toBe(404);
  });

  it("renders link previews with the item text", async () => {
    const { data } = await createList();
    const og = await call("GET", `/api/og/image/${data.slug}.png`);
    expect(og.status).toBe(200);
    const html = await (await app.fetch(new Request(`http://test.local/api/og/meta/${data.slug}`))).text();
    expect(html).toContain(`buy ${word}`);
    expect(html).not.toContain("- [ ]");
  });
});
