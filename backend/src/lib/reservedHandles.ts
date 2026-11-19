// Handles that would shadow a top-level frontend route (e.g. /mux, /search), since
// profiles live at /:handle. Keep in sync with the routes in frontend/src/App.tsx.
export const RESERVED_HANDLES = new Set([
  "api", "docs", "join", "new", "paste", "login", "signup", "logout", "search", "trending",
  "settings", "groups", "shared", "saved", "mux", "admin", "health", "og",
]);

export function isReservedHandle(handle: string): boolean {
  return RESERVED_HANDLES.has(handle.toLowerCase());
}
