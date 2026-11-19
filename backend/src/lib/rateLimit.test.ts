/**
 * Tests for src/lib/rateLimit.ts (now async on top of libSQL).
 * Uses the shared test database configured by src/test/setup.ts.
 */
import { describe, it, expect } from "bun:test";
import { checkRateLimit } from "./rateLimit.js";
import { db } from "../db/client.js";

let n = 0;
const freshKey = () => `test:${Date.now()}:${n++}`;

describe("checkRateLimit", () => {
  it("allows requests up to the limit, then blocks", async () => {
    const key = freshKey();
    expect(await checkRateLimit(key, 60, 3)).toBe(false);
    expect(await checkRateLimit(key, 60, 3)).toBe(false);
    expect(await checkRateLimit(key, 60, 3)).toBe(false);
    expect(await checkRateLimit(key, 60, 3)).toBe(true);
    expect(await checkRateLimit(key, 60, 3)).toBe(true);
  });

  it("does not log blocked attempts", async () => {
    const key = freshKey();
    await checkRateLimit(key, 60, 1);
    await checkRateLimit(key, 60, 1);
    await checkRateLimit(key, 60, 1);
    const row = await db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM rate_limit_log WHERE key = ?").get(key);
    expect(row!.n).toBe(1);
  });

  it("tracks keys independently", async () => {
    const a = freshKey();
    const b = freshKey();
    expect(await checkRateLimit(a, 60, 1)).toBe(false);
    expect(await checkRateLimit(a, 60, 1)).toBe(true);
    expect(await checkRateLimit(b, 60, 1)).toBe(false);
  });

  it("purges entries outside the window and allows again", async () => {
    const key = freshKey();
    const old = Math.floor(Date.now() / 1000) - 120;
    await db.query("INSERT INTO rate_limit_log (key, created_at) VALUES (?, ?)").run(key, old);
    await db.query("INSERT INTO rate_limit_log (key, created_at) VALUES (?, ?)").run(key, old);

    expect(await checkRateLimit(key, 60, 1)).toBe(false);
    const row = await db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM rate_limit_log WHERE key = ?").get(key);
    expect(row!.n).toBe(1); // two stale rows purged, one fresh row logged
  });
});
