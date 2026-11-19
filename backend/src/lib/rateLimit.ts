import { db } from "../db/client.js";

const insertLog = db.prepare<unknown, [string]>("INSERT INTO rate_limit_log (key) VALUES (?)");
const countLog = db.query<{ cnt: number }, [string, number]>(
  "SELECT COUNT(*) as cnt FROM rate_limit_log WHERE key = ? AND created_at > ?"
);
const purgeLog = db.prepare<unknown, [string, number]>(
  "DELETE FROM rate_limit_log WHERE key = ? AND created_at <= ?"
);

/**
 * Returns true if the request should be blocked (limit exceeded).
 * windowSec: sliding window in seconds
 * maxHits: max allowed hits in the window
 */
export async function checkRateLimit(key: string, windowSec: number, maxHits: number): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSec;

  // Lazy purge old entries
  await purgeLog.run(key, windowStart);

  const { cnt } = (await countLog.get(key, windowStart))!;
  if (cnt >= maxHits) return true; // blocked

  await insertLog.run(key);
  return false;
}
