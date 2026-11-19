import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { verifyJWT } from "../lib/jwt.js";
import { db } from "../db/client.js";
import type { AuthUser } from "../types/index.js";

const getUser = db.query<AuthUser, [number]>(
  "SELECT id, handle, email, display_name, bio, avatar_url, created_at FROM users WHERE id = ?"
);

// Sets c.var.user if authenticated, but does not block unauthenticated requests
export const optionalAuth = createMiddleware<{ Variables: { user: AuthUser | null } }>(
  async (c, next) => {
    c.set("user", null);
    const authHeader = c.req.header("Authorization");
    const token = (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null) ?? getCookie(c, "token");
    if (token) {
      try {
        const payload = await verifyJWT(token);
        const user = await getUser.get(Number(payload.sub));
        if (user) c.set("user", user);
      } catch {
        // ignore invalid tokens
      }
    }
    await next();
  }
);
