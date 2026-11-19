/**
 * Tests for the libSQL data layer (src/db/client.ts) and migrations (src/db/migrate.ts).
 *
 * Each test gets its own fresh file database (libSQL interactive transactions need a
 * real file; `:memory:` DBs are per-connection).
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb, type Db } from "./client.js";
import { runMigrations } from "./migrate.js";

let dir: string;
let db: Db;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "pp-client-"));
  db = createDb(`file:${join(dir, "t.db")}`);
  await runMigrations(db, false);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

async function addUser(handle: string): Promise<number> {
  const r = await db
    .query("INSERT INTO users (handle, email, password_hash) VALUES (?, ?, 'x')")
    .run(handle, `${handle}@example.com`);
  return r.lastInsertRowid;
}

describe("runMigrations", () => {
  it("contains no PRAGMAs that Turso rejects (only foreign_keys is allowed)", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const dir = new URL("./migrations/", import.meta.url);
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
      const pragmas = readFileSync(new URL(f, dir), "utf8").match(/^\s*PRAGMA\s+(\w+)/gim) ?? [];
      for (const p of pragmas) expect(`${f}: ${p.trim()}`).toMatch(/PRAGMA\s+foreign_keys$/i);
    }
  });

  it("applies every migration once and is idempotent", async () => {
    const applied = await db.query<{ name: string }>("SELECT name FROM _migrations ORDER BY name").all();
    expect(applied.map((r) => r.name)).toEqual([
      "001_initial.sql",
      "002_document_sends.sql",
      "003_rename_orgs_to_groups.sql",
      "004_saved_pastes.sql",
      "005_remove_description.sql",
      "006_view_tracking.sql",
    ]);
    expect(await runMigrations(db, false)).toEqual([]);
  });

  it("creates the core tables, FTS5 table and sync triggers", async () => {
    const names = (
      await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type IN ('table','trigger')").all()
    ).map((r) => r.name);
    for (const t of ["users", "documents", "groups", "group_members", "document_sends", "saved_pastes", "document_views", "documents_fts"]) {
      expect(names).toContain(t);
    }
    expect(names.filter((n) => n.startsWith("docs_fts_")).length).toBe(3);
  });

  it("keeps FTS5 search (porter stemming) in sync with documents", async () => {
    const owner = await addUser("alice");
    await db
      .query("INSERT INTO documents (slug, title, content, owner_id) VALUES (?, ?, ?, ?)")
      .run("abc12345", "Animals", "the quick brown foxes jumped", owner);

    const match = () =>
      db.query<{ slug: string }, [string]>("SELECT slug FROM documents_fts WHERE documents_fts MATCH ?").all("fox");
    expect(await match()).toEqual([{ slug: "abc12345" }]);

    await db.query("UPDATE documents SET content = 'nothing here' WHERE slug = ?").run("abc12345");
    expect(await match()).toEqual([]);
  });

  it("enforces foreign keys (ON DELETE CASCADE) on local files", async () => {
    const owner = await addUser("bob");
    const doc = await db
      .query("INSERT INTO documents (slug, content, owner_id) VALUES ('s1', 'x', ?)")
      .run(owner);
    await db.query("INSERT INTO document_views (doc_id) VALUES (?)").run(doc.lastInsertRowid);
    await db.query("DELETE FROM documents WHERE id = ?").run(doc.lastInsertRowid);
    const views = await db.query<{ n: number }>("SELECT COUNT(*) AS n FROM document_views").get();
    expect(views!.n).toBe(0);
  });
});

describe("query helpers", () => {
  it("get returns a plain object or null; all returns rows in order", async () => {
    await addUser("a1");
    await addUser("a2");
    const one = await db.query<{ handle: string }, [string]>("SELECT handle FROM users WHERE handle = ?").get("a1");
    expect(one).toEqual({ handle: "a1" });
    expect(JSON.parse(JSON.stringify(one))).toEqual({ handle: "a1" });
    expect(await db.query("SELECT handle FROM users WHERE handle = ?").get("missing")).toBeNull();
    const all = await db.query<{ handle: string }>("SELECT handle FROM users ORDER BY handle").all();
    expect(all.map((r) => r.handle)).toEqual(["a1", "a2"]);
  });

  it("run reports changes and a numeric lastInsertRowid", async () => {
    const id = await addUser("c1");
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
    const upd = await db.query("UPDATE users SET bio = 'hi' WHERE handle LIKE 'c%'").run();
    expect(upd.changes).toBe(1);
    const ignored = await db
      .query("INSERT OR IGNORE INTO users (handle, email, password_hash) VALUES ('c1', 'c1@example.com', 'x')")
      .run();
    expect(ignored.changes).toBe(0);
  });

  it("returns integers as JS numbers", async () => {
    const row = await db.query<{ n: number; ts: number }>("SELECT 42 AS n, unixepoch() AS ts").get();
    expect(row!.n).toBe(42);
    expect(typeof row!.ts).toBe("number");
  });
});

describe("transaction", () => {
  it("commits all writes made inside the callback", async () => {
    await db.transaction(async () => {
      await addUser("t1");
      await addUser("t2");
    });
    const n = await db.query<{ n: number }>("SELECT COUNT(*) AS n FROM users").get();
    expect(n!.n).toBe(2);
  });

  it("rolls back every write when the callback throws", async () => {
    await expect(
      db.transaction(async () => {
        await addUser("r1");
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    const n = await db.query<{ n: number }>("SELECT COUNT(*) AS n FROM users").get();
    expect(n!.n).toBe(0);
  });

  it("rolls back when a statement fails (constraint violation)", async () => {
    await addUser("dup");
    await expect(
      db.transaction(async () => {
        await addUser("fresh");
        await addUser("dup"); // UNIQUE(handle) violation
      })
    ).rejects.toThrow();
    const handles = (await db.query<{ handle: string }>("SELECT handle FROM users").all()).map((r) => r.handle);
    expect(handles).toEqual(["dup"]);
  });

  it("reads inside the transaction see its own uncommitted writes", async () => {
    const seen = await db.transaction(async () => {
      await addUser("inside");
      return db.query<{ handle: string }, [string]>("SELECT handle FROM users WHERE handle = ?").get("inside");
    });
    expect(seen).toEqual({ handle: "inside" });
  });

  it("nested transaction calls join the outer transaction", async () => {
    await expect(
      db.transaction(async () => {
        await db.transaction(async () => {
          await addUser("nested");
        });
        throw new Error("outer fails");
      })
    ).rejects.toThrow("outer fails");
    const n = await db.query<{ n: number }>("SELECT COUNT(*) AS n FROM users").get();
    expect(n!.n).toBe(0);
  });

  it("returns the callback's value", async () => {
    expect(await db.transaction(async () => 7)).toBe(7);
  });
});
