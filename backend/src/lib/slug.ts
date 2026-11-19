import { customAlphabet } from "nanoid";
import { db } from "../db/client.js";

// URL-safe alphabet without look-alike chars
const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const nanoid = customAlphabet(alphabet, 8);

const checkSlug = db.query<{ id: number }, [string]>(
  "SELECT id FROM documents WHERE slug = ? LIMIT 1"
);

export async function generateSlug(): Promise<string> {
  for (let attempts = 0; attempts <= 10; attempts++) {
    const slug = nanoid();
    if ((await checkSlug.get(slug)) === null) return slug;
  }
  throw new Error("Failed to generate unique slug after 10 attempts");
}
