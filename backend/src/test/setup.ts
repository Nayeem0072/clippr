// Test preload (see bunfig.toml): point the shared `db` at a fresh, migrated temp
// database so tests never touch the dev pastebin.db or a real Turso instance.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "pp-test-"));
process.env.TURSO_DATABASE_URL = `file:${join(dir, "test.db")}`;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.DB_PATH;

const { runMigrations } = await import("../db/migrate.js");
await runMigrations(undefined, false);
