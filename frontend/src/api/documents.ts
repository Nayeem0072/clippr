import { apiFetch } from "./client";

export interface Document {
  id: number;
  slug: string;
  title: string;
  content: string;
  language: string;
  highlighted_html: string | null;
  privacy: "public" | "group" | "private";
  group_id: number | null;
  owner_id: number;
  created_at: number;
  updated_at: number;
  /** Checklist pastes: the viewer may tick items (owner, or group member on a group paste). */
  can_check?: boolean;
}

export interface DocSummary {
  slug: string;
  title: string;
  language: string;
  privacy: string;
  created_at: number;
  updated_at?: number;
}

export interface ShareTarget {
  id: number;
  handle: string;
  display_name: string | null;
}

export const docsApi = {
  create: (data: {
    title?: string;
    content: string;
    language?: string;
    privacy?: string;
    group_id?: number;
    /** Diagram pastes only: SVG snapshot used for link-preview images. */
    preview_svg?: string;
  }) =>
    apiFetch<{ slug: string; title: string; language: string; privacy: string; created_at: number }>(
      "/api/documents",
      { method: "POST", body: JSON.stringify(data) }
    ),

  get: (slug: string) =>
    apiFetch<{ doc: Document & { owner: { handle: string; display_name: string | null } } }>(
      `/api/documents/${slug}`
    ),

  update: (
    slug: string,
    data: Partial<Pick<Document, "title" | "content" | "language" | "privacy" | "group_id">> & {
      /** Reject with 409 if the paste changed since this updated_at was loaded. */
      expected_updated_at?: number;
      /** Diagram pastes only: SVG snapshot used for link-preview images. */
      preview_svg?: string;
    }
  ) =>
    apiFetch<{ doc: Document }>(`/api/documents/${slug}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  /** Tick or untick one checklist item. 409 if that item changed elsewhere. */
  check: (slug: string, data: { index: number; checked: boolean; text: string }) =>
    apiFetch<{ doc: Document }>(`/api/documents/${slug}/check`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  delete: (slug: string) =>
    apiFetch<{ ok: true }>(`/api/documents/${slug}`, { method: "DELETE" }),

  list: (page = 1, limit = 20) =>
    apiFetch<{ docs: DocSummary[]; page: number; limit: number; total: number; has_more: boolean }>(
      `/api/documents?page=${page}&limit=${limit}`
    ),

  getShares: (slug: string) =>
    apiFetch<{ shares: (ShareTarget & { shared_at: number })[] }>(`/api/documents/${slug}/shares`),

  addShare: (slug: string, handle_or_email: string) =>
    apiFetch<{ shared_with: ShareTarget }>(`/api/documents/${slug}/shares`, {
      method: "POST",
      body: JSON.stringify({ handle_or_email }),
    }),

  removeShare: (slug: string, userId: number) =>
    apiFetch<{ ok: true }>(`/api/documents/${slug}/shares/${userId}`, { method: "DELETE" }),
};
