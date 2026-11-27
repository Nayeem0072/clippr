import { apiFetch } from "./client";

export interface Collection {
  id: number;
  name: string;
  owner_id: number;
  /** null = a personal collection. */
  group_id: number | null;
  group_slug: string | null;
  group_name: string | null;
  doc_count: number;
  /** The viewer may rename / delete it (creator, or a group owner/admin). */
  can_manage: boolean;
  created_at: number;
  updated_at: number;
}

export interface CollectionDoc {
  slug: string;
  title: string;
  language: string;
  privacy: string;
  group_id: number | null;
  view_count: number;
  created_at: number;
  updated_at: number;
  owner_id: number;
  owner_handle: string;
  owner_display: string | null;
}

export const collectionsApi = {
  list: (groupId?: number) =>
    apiFetch<{ collections: Collection[] }>(
      groupId !== undefined ? `/api/collections?group_id=${groupId}` : "/api/collections"
    ),

  get: (id: number) =>
    apiFetch<{ collection: Collection; documents: CollectionDoc[] }>(`/api/collections/${id}`),

  create: (name: string, groupId?: number | null) =>
    apiFetch<{ collection: Collection }>("/api/collections", {
      method: "POST",
      body: JSON.stringify({ name, group_id: groupId ?? null }),
    }),

  rename: (id: number, name: string) =>
    apiFetch<{ collection: Collection }>(`/api/collections/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  remove: (id: number) => apiFetch<{ ok: true }>(`/api/collections/${id}`, { method: "DELETE" }),
};

/**
 * Collections a paste with these settings may go in: the user's personal ones, plus the
 * selected group's when it's a group paste. Mirrors canFileInCollection on the server.
 */
export function collectionsFor(all: Collection[], privacy: string, groupId: number | null): Collection[] {
  return all.filter((c) => c.group_id === null || (privacy === "group" && c.group_id === groupId));
}
