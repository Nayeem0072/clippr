/**
 * Collections: personal + group folders of pastes (routes/collections.ts, plus the
 * collection parts of routes/documents.ts). Drives the real app against the test DB.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { app } from "../app.js";
import { db } from "../db/client.js";

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
  return { status: res.status, data: data as Json };
}

const uid = Math.random().toString(36).slice(2, 8);
type U = { token: string; user: Json };

async function signup(name: string): Promise<U> {
  const handle = `${name}-${uid}`;
  const r = await call("POST", "/api/auth/signup", { email: `${handle}@example.com`, password: "password123", handle });
  expect(r.status).toBe(201);
  return { token: r.data.token, user: r.data.user };
}

async function paste(u: U, extra: Json = {}) {
  const r = await call("POST", "/api/documents", { title: "p", content: "hello", ...extra }, u.token);
  expect(r.status).toBe(201);
  return r.data.slug as string;
}

async function newCollection(u: U, name: string, group_id?: number) {
  const r = await call("POST", "/api/collections", { name, group_id }, u.token);
  expect(r.status).toBe(201);
  return r.data.collection as Json;
}

const getDoc = async (slug: string, u?: U) => (await call("GET", `/api/documents/${slug}`, undefined, u?.token)).data.doc;
const move = (slug: string, collection_id: number | null, u: U) =>
  call("PUT", `/api/documents/${slug}/collection`, { collection_id }, u.token);

let alice: U, bob: U, carol: U, dave: U;
let groupId: number;
const groupSlug = `team-${uid}`;

beforeAll(async () => {
  [alice, bob, carol, dave] = await Promise.all(["calice", "cbob", "ccarol", "cdave"].map(signup));
  // alice owns the group; bob and carol are members (carol becomes admin); dave is outside.
  const g = await call("POST", "/api/groups", { slug: groupSlug, name: "Team" }, alice.token);
  expect(g.status).toBe(201);
  groupId = g.data.group.id;
  const inv = await call("POST", `/api/groups/${groupSlug}/invites`, {}, alice.token);
  for (const u of [bob, carol]) {
    expect((await call("POST", `/api/groups/join/${inv.data.code}`, {}, u.token)).status).toBeLessThan(300);
  }
  const role = await call("PATCH", `/api/groups/${groupSlug}/members/${carol.user.id}`, { role: "admin" }, alice.token);
  expect(role.status).toBe(200);
});

describe("personal collections", () => {
  it("starts empty", async () => {
    const r = await call("GET", "/api/collections", undefined, dave.token);
    expect(r.status).toBe(200);
    expect(r.data.collections).toEqual([]);
  });

  it("requires auth and a valid name", async () => {
    expect((await call("GET", "/api/collections")).status).toBe(401);
    expect((await call("POST", "/api/collections", { name: "  " }, alice.token)).status).toBe(400);
    expect((await call("POST", "/api/collections", { name: "x".repeat(61) }, alice.token)).status).toBe(400);
  });

  it("creates, lists, renames and shows counts", async () => {
    const col = await newCollection(alice, "  Snippets  ");
    expect(col.name).toBe("Snippets");
    expect(col.group_id).toBeNull();
    expect(col.can_manage).toBe(true);
    expect(col.doc_count).toBe(0);

    const r = await call("PATCH", `/api/collections/${col.id}`, { name: "Utils" }, alice.token);
    expect(r.status).toBe(200);
    expect(r.data.collection.name).toBe("Utils");

    const list = await call("GET", "/api/collections", undefined, alice.token);
    expect(list.data.collections.some((c: Json) => c.id === col.id && c.name === "Utils")).toBe(true);
  });

  it("is invisible to everyone else", async () => {
    const col = await newCollection(alice, "Private stuff");
    const list = await call("GET", "/api/collections", undefined, bob.token);
    expect(list.data.collections.some((c: Json) => c.id === col.id)).toBe(false);
    expect((await call("GET", `/api/collections/${col.id}`, undefined, bob.token)).status).toBe(404);
    expect((await call("PATCH", `/api/collections/${col.id}`, { name: "hax" }, bob.token)).status).toBe(404);
    expect((await call("DELETE", `/api/collections/${col.id}`, undefined, bob.token)).status).toBe(404);

    const bobSlug = await paste(bob);
    expect((await move(bobSlug, col.id, bob)).status).toBe(404);
    expect((await call("POST", "/api/documents", { content: "x", collection_id: col.id }, bob.token)).status).toBe(403);
  });

  it("files a paste at creation and lists it", async () => {
    const col = await newCollection(alice, "Created into");
    const r = await call("POST", "/api/documents", { content: "x", privacy: "private", collection_id: col.id }, alice.token);
    expect(r.status).toBe(201);
    expect(r.data.collection_id).toBe(col.id);

    const doc = await getDoc(r.data.slug, alice);
    expect(doc.collection).toEqual({ id: col.id, name: "Created into", group_id: null });

    const got = await call("GET", `/api/collections/${col.id}`, undefined, alice.token);
    expect(got.status).toBe(200);
    expect(got.data.collection.doc_count).toBe(1);
    expect(got.data.documents.map((d: Json) => d.slug)).toEqual([r.data.slug]);
  });

  it("404s for a missing collection on create", async () => {
    expect((await call("POST", "/api/documents", { content: "x", collection_id: 999999 }, alice.token)).status).toBe(404);
  });
});

describe("moving pastes", () => {
  it("moves, re-moves and removes, without touching updated_at", async () => {
    const a = await newCollection(alice, "A");
    const b = await newCollection(alice, "B");
    const slug = await paste(alice);
    const before = (await getDoc(slug, alice)).updated_at;

    expect((await move(slug, a.id, alice)).data.collection_id).toBe(a.id);
    const r = await move(slug, b.id, alice);
    expect(r.status).toBe(200);
    expect(r.data.collection.name).toBe("B");
    expect((await call("GET", `/api/collections/${a.id}`, undefined, alice.token)).data.documents).toEqual([]);

    expect((await move(slug, null, alice)).data.collection_id).toBeNull();
    const doc = await getDoc(slug, alice);
    expect(doc.collection).toBeNull();
    expect(doc.updated_at).toBe(before);
  });

  it("is owner only and validates the body", async () => {
    const slug = await paste(alice);
    const bobCol = await newCollection(bob, "Bob's");
    expect((await move(slug, bobCol.id, bob)).status).toBe(403);
    expect((await call("PUT", `/api/documents/${slug}/collection`, {}, alice.token)).status).toBe(400);
    expect((await move("nope-nope", null, alice)).status).toBe(404);
  });

  it("hides a personal collection from other viewers of a public paste", async () => {
    const col = await newCollection(alice, "Hidden name");
    const slug = await paste(alice, { collection_id: col.id });
    const doc = await getDoc(slug, bob);
    expect(doc.collection).toBeNull();
    expect(doc.collection_id).toBeNull();
  });
});

describe("group collections", () => {
  let groupCol: Json;

  it("any member can create one; outsiders can't", async () => {
    groupCol = await newCollection(bob, "Shared configs", groupId);
    expect(groupCol.group_id).toBe(groupId);
    expect(groupCol.group_slug).toBe(groupSlug);
    expect(groupCol.can_manage).toBe(true);
    expect((await call("POST", "/api/collections", { name: "x", group_id: groupId }, dave.token)).status).toBe(403);
  });

  it("is listed for members (and filterable by group) but not outsiders", async () => {
    const forAlice = await call("GET", `/api/collections?group_id=${groupId}`, undefined, alice.token);
    expect(forAlice.data.collections.map((c: Json) => c.id)).toContain(groupCol.id);
    expect(forAlice.data.collections.every((c: Json) => c.group_id === groupId)).toBe(true);

    const forDave = await call("GET", "/api/collections", undefined, dave.token);
    expect(forDave.data.collections.some((c: Json) => c.id === groupCol.id)).toBe(false);
    expect((await call("GET", `/api/collections/${groupCol.id}`, undefined, dave.token)).status).toBe(404);
  });

  it("takes members' own group pastes for that group only", async () => {
    const groupPaste = await paste(alice, { privacy: "group", group_id: groupId });
    expect((await move(groupPaste, groupCol.id, alice)).status).toBe(200);

    const publicPaste = await paste(alice);
    expect((await move(publicPaste, groupCol.id, alice)).status).toBe(400);
    expect((await call("POST", "/api/documents", { content: "x", collection_id: groupCol.id }, alice.token)).status).toBe(400);

    const created = await call(
      "POST", "/api/documents",
      { content: "x", privacy: "group", group_id: groupId, collection_id: groupCol.id }, carol.token
    );
    expect(created.status).toBe(201);

    // Members see every paste in it, and the paste shows its collection to them.
    const got = await call("GET", `/api/collections/${groupCol.id}`, undefined, bob.token);
    expect(got.data.documents.map((d: Json) => d.slug).sort()).toEqual([groupPaste, created.data.slug].sort());
    expect((await getDoc(groupPaste, bob)).collection.id).toBe(groupCol.id);

    // A member can't file someone else's paste.
    expect((await move(groupPaste, groupCol.id, bob)).status).toBe(403);
  });

  it("only the creator or a group owner/admin can rename or delete", async () => {
    const aliceCol = await newCollection(alice, "Alice's group col", groupId);
    const asBob = await call("GET", `/api/collections?group_id=${groupId}`, undefined, bob.token);
    expect(asBob.data.collections.find((c: Json) => c.id === aliceCol.id).can_manage).toBe(false);

    expect((await call("PATCH", `/api/collections/${aliceCol.id}`, { name: "bob was here" }, bob.token)).status).toBe(403);
    expect((await call("DELETE", `/api/collections/${aliceCol.id}`, undefined, bob.token)).status).toBe(403);
    // carol is an admin, alice the group owner, bob the creator of groupCol.
    expect((await call("PATCH", `/api/collections/${aliceCol.id}`, { name: "by admin" }, carol.token)).status).toBe(200);
    expect((await call("PATCH", `/api/collections/${groupCol.id}`, { name: "by owner" }, alice.token)).status).toBe(200);
    expect((await call("PATCH", `/api/collections/${groupCol.id}`, { name: "by creator" }, bob.token)).status).toBe(200);
  });

  it("leaving the group unfiles the paste when its privacy changes", async () => {
    const slug = await paste(alice, { privacy: "group", group_id: groupId, collection_id: groupCol.id });
    const r = await call("PATCH", `/api/documents/${slug}`, { privacy: "public", group_id: null }, alice.token);
    expect(r.status).toBe(200);
    expect(r.data.doc.collection_id).toBeNull();
  });

  it("a personal collection survives privacy changes", async () => {
    const col = await newCollection(alice, "Keeps");
    const slug = await paste(alice, { collection_id: col.id });
    await call("PATCH", `/api/documents/${slug}`, { privacy: "private" }, alice.token);
    expect((await getDoc(slug, alice)).collection.id).toBe(col.id);
  });

  it("deleting a collection keeps its pastes but unfiles them", async () => {
    const col = await newCollection(carol, "Doomed", groupId);
    const slug = await paste(carol, { privacy: "group", group_id: groupId, collection_id: col.id });
    expect((await call("DELETE", `/api/collections/${col.id}`, undefined, alice.token)).status).toBe(200);
    expect((await call("GET", `/api/collections/${col.id}`, undefined, carol.token)).status).toBe(404);
    const doc = await getDoc(slug, carol);
    expect(doc.collection).toBeNull();
    const row = await db.query<{ collection_id: number | null }, [string]>(
      "SELECT collection_id FROM documents WHERE slug = ?"
    ).get(slug);
    expect(row?.collection_id).toBeNull();
  });
});
