import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

// bcrypt only considers the first 72 bytes of input. Longer passwords are pre-hashed
// with SHA-512 (base64, 88 chars → bcrypt uses the first 72) so the full input counts.
const BCRYPT_MAX_BYTES = 72;

function normalize(plain: string): string {
  return Buffer.byteLength(plain, "utf8") > BCRYPT_MAX_BYTES
    ? createHash("sha512").update(plain, "utf8").digest("base64")
    : plain;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(normalize(plain), 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(normalize(plain), hash);
}
