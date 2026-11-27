import { db } from "../db/client.js";
import type { Collection, Document } from "../types/index.js";

export const MAX_COLLECTION_NAME = 60;

export function validateCollectionName(name: unknown): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof name !== "string" || !name.trim()) return { ok: false, error: "name is required" };
  const trimmed = name.trim();
  if (trimmed.length > MAX_COLLECTION_NAME) {
    return { ok: false, error: `name must be at most ${MAX_COLLECTION_NAME} characters` };
  }
  return { ok: true, name: trimmed };
}

export async function getCollection(id: unknown): Promise<Collection | null> {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  return (await db.query<Collection, [number]>("SELECT * FROM collections WHERE id = ?").get(n)) ?? null;
}

async function groupRole(groupId: number, userId: number): Promise<string | null> {
  const row = await db
    .query<{ role: string }, [number, number]>("SELECT role FROM group_members WHERE group_id = ? AND user_id = ?")
    .get(groupId, userId);
  return row?.role ?? null;
}

/** Personal collections are the owner's alone; group collections are visible to every member. */
export async function canViewCollection(col: Collection, userId: number | null): Promise<boolean> {
  if (!userId) return false;
  if (col.group_id === null) return col.owner_id === userId;
  return (await groupRole(col.group_id, userId)) !== null;
}

/** Rename / delete: the creator, or (group collections) a group owner or admin. */
export async function canManageCollection(col: Collection, userId: number): Promise<boolean> {
  if (col.group_id === null) return col.owner_id === userId;
  const role = await groupRole(col.group_id, userId);
  if (!role) return false;
  return col.owner_id === userId || role === "owner" || role === "admin";
}

/**
 * Whether `userId` may put `doc` in `col`. Only a paste's owner files it. A personal collection
 * takes any of its owner's pastes; a group collection takes the member's own group pastes for
 * that group.
 */
export async function canFileInCollection(
  col: Collection,
  doc: Pick<Document, "owner_id" | "privacy" | "group_id">,
  userId: number
): Promise<{ ok: true } | { ok: false; status: 400 | 403; error: string }> {
  if (doc.owner_id !== userId) return { ok: false, status: 403, error: "Forbidden" };
  if (col.group_id === null) {
    return col.owner_id === userId ? { ok: true } : { ok: false, status: 403, error: "Forbidden" };
  }
  if ((await groupRole(col.group_id, userId)) === null) return { ok: false, status: 403, error: "Forbidden" };
  if (doc.privacy !== "group" || Number(doc.group_id) !== col.group_id) {
    return { ok: false, status: 400, error: "Only this group's pastes can go in a group collection" };
  }
  return { ok: true };
}

/** Whether a paste with these settings still belongs in `col` (used when privacy/group change). */
export function stillFits(col: Collection, doc: Pick<Document, "privacy" | "group_id">): boolean {
  if (col.group_id === null) return true;
  return doc.privacy === "group" && Number(doc.group_id) === col.group_id;
}
