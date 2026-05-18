import { apiFetch, setToken } from "./client";

export interface User {
  id: number;
  handle: string;
  email: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: number;
}

export const authApi = {
  me: () => apiFetch<{ user: User }>("/api/auth/me"),
  login: async (email: string, password: string) => {
    const res = await apiFetch<{ user: User; token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(res.token);
    return res;
  },
  signup: async (data: { email: string; password: string; handle: string; display_name?: string }) => {
    const res = await apiFetch<{ user: User; token: string }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(data),
    });
    setToken(res.token);
    return res;
  },
  logout: async () => {
    setToken(null);
    try {
      await apiFetch<{ ok: true }>("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore — token already cleared locally
    }
    return { ok: true as const };
  },
  checkHandle: (handle: string) =>
    apiFetch<{ available: boolean }>(`/api/auth/check-handle?handle=${encodeURIComponent(handle)}`),
};
