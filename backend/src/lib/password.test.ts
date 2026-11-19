/**
 * Tests for src/lib/password.ts (bcryptjs, replacing Bun.password so the API can run
 * on Vercel's Node.js runtime).
 */
import { describe, it, expect } from "bun:test";
import { hashPassword, verifyPassword } from "./password.js";

describe("hashPassword / verifyPassword", () => {
  it("round-trips a normal password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("password123");
    expect(await verifyPassword("password124", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("produces a different salt each time", async () => {
    const [a, b] = await Promise.all([hashPassword("same"), hashPassword("same")]);
    expect(a).not.toBe(b);
  });

  it("verifies hashes created by Bun.password (existing users keep working)", async () => {
    const legacy = await Bun.password.hash("legacy-password", { algorithm: "bcrypt", cost: 4 });
    expect(await verifyPassword("legacy-password", legacy)).toBe(true);
    expect(await verifyPassword("legacy-passwordX", legacy)).toBe(false);
  });

  it("uses the whole input for passwords longer than bcrypt's 72-byte limit", async () => {
    const base = "x".repeat(80);
    const hash = await hashPassword(base + "A");
    expect(await verifyPassword(base + "A", hash)).toBe(true);
    // Differs only after byte 72 — plain bcrypt would wrongly accept this
    expect(await verifyPassword(base + "B", hash)).toBe(false);
  });

  it("handles multi-byte characters around the 72-byte boundary", async () => {
    const pw = "é".repeat(40); // 80 bytes in UTF-8, 40 chars
    const hash = await hashPassword(pw);
    expect(await verifyPassword(pw, hash)).toBe(true);
    expect(await verifyPassword("é".repeat(39) + "e", hash)).toBe(false);
  });
});
