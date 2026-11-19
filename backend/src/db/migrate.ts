import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { db as defaultDb, type Db } from "./client.js";

const migrationsDir = fileURLToPath(new URL("./migrations", import.meta.url));

export async function runMigrations(db: Db = defaultDb, log = true): Promise<string[]> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  const applied = new Set(
    (await db.query<{ name: string }, []>("SELECT name FROM _migrations ORDER BY name").all()).map((r) => r.name)
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    if (log) console.log(`[migrate] Applying ${file}`);
    await db.exec(sql);
    await db.query("INSERT INTO _migrations (name) VALUES (?)").run(file);
    newlyApplied.push(file);
  }

  if (log) console.log("[migrate] Done");
  return newlyApplied;
}

// CLI entry: `bun run migrate`
if (import.meta.main) {
  await runMigrations();
  defaultDb.close();
}
