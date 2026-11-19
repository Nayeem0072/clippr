import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

// bcrypt only considers the first 72 bytes of input. Longer passwords are pre-hashed
// with SHA-512 (base64, 88 chars → bcrypt uses the first 72) so the full input counts.
const BCRYPT_MAX_BYTES = 72;

function isLong(plain: string): boolean {
  return Buffer.byteLength(plain, "utf8") > BCRYPT_MAX_BYTES;
}

function normalize(plain: string): string {
  return isLong(plain) ? createHash("sha512").update(plain, "utf8").digest("base64") : plain;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(normalize(plain), 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (await bcrypt.compare(normalize(plain), hash)) return true;

  // Legacy: hashes created by Bun.password for passwords > 72 bytes use Bun's own
  // pre-hash format. Short-password Bun hashes are plain bcrypt and verify above.
  // The legacy long-password case can only be checked when running under Bun.
  const bun = (globalThis as { Bun?: { password: { verify(p: string, h: string): Promise<boolean> } } }).Bun;
  if (isLong(plain) && bun) return bun.password.verify(plain, hash);
  return false;
}
