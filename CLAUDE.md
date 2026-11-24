# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
# Run both backend and frontend concurrently
bun run dev

# Run individually
bun run dev:backend    # Hono API on http://localhost:3001
bun run dev:frontend   # Vite dev server on http://localhost:5173 (proxies /api to :3001)
```

### Frontend
```bash
cd frontend
bun run build    # TypeScript check + Vite build → dist/
bun run preview  # Preview production build locally
```

### Backend
```bash
cd backend
bun run start    # Run migrations then start server
bun run migrate  # Run migrations only
```

### Testing
```bash
cd backend
~/.bun/bin/bun test                        # Run all backend tests
~/.bun/bin/bun test src/routes/sends.test.ts  # Run a specific test file
```

Tests use Bun's built-in test runner (`bun:test`) — no server needed. Test files live alongside the source files they cover (`*.test.ts`). `bunfig.toml` preloads `src/test/setup.ts`, which points the shared `db` at a fresh, migrated temp SQLite file, so tests never touch the dev DB or Turso. `src/app.test.ts` drives the real Hono app via `app.fetch` (integration); the older `routes/*.test.ts` files build their own in-memory `bun:sqlite` schemas to test SQL in isolation.

**Testing policy**: whenever a backend route is added or modified, a corresponding `*.test.ts` file must be written or updated. Tests should cover:
- Happy path for each new behaviour
- Filtering/access-control (wrong user sees nothing)
- Edge cases (empty results, declined/accepted states, etc.)

### Docker (self-hosted alternative)
```bash
docker compose up -d --build   # Rebuild and restart backend (data volume persists)
docker compose logs -f backend # Tail logs
```

> **Important**: When self-hosting with Docker, `.env` must set `DB_PATH=/data/pastebin.db` (not `./pastebin.db`). Using a relative path bypasses the mounted volume and the DB will be lost on every rebuild.

## Workflow

### Feature development
When instructed to add a feature, always:
1. Create a new branch off `main`: `git checkout -b feature/<short-name>`
2. Implement the feature with tests
3. Commit and push the branch
Never implement features directly on `main`.

### Bug fixes
Bug fixes can be committed directly to the current branch (or a `fix/` branch if on `main`).

## Architecture

This is a monorepo with a Bun workspace (`package.json` at root) containing `backend/` and `frontend/`.

### Backend (`backend/src/`)
- **Runtime**: Hono. Runs on Bun locally/Docker (`src/index.ts`) and on Vercel's Node.js runtime in production (`api/index.ts` → `src/app.ts`). Runtime code must stay **Node-compatible**: no `Bun.*` APIs or `bun:*` imports outside tests, and relative imports use explicit `.js` extensions (the packages are `"type": "module"`).
- **Database**: libSQL via `@libsql/client` (`src/db/client.ts`). `TURSO_DATABASE_URL` (+ `TURSO_AUTH_TOKEN`) selects Turso in production; otherwise `DB_PATH` (or the repo-root `pastebin.db`) is used as a local `file:` DB. All queries are **async**: `await db.query<Row, Args>(sql).get/all/run(...)`. Use `await db.transaction(async () => { ... })` for multi-statement writes — queries awaited inside the callback run on the transaction automatically (AsyncLocalStorage).
- **App vs server**: `src/app.ts` builds the Hono app (no side effects, no migrations). `src/index.ts` is the Bun server; `api/index.ts` (repo root) is the Vercel function.
- **Auth**: JWT stored as httpOnly cookie **and** returned in response body as `token`. All API clients send it as `Authorization: Bearer <token>`. Both `requireAuth` and `optionalAuth` middlewares accept either cookie or Bearer header.
- **Migrations**: `src/db/migrations/*.sql`, tracked in `_migrations`. Run by `bun run migrate` — which `bun run dev`, `bun run start` (Docker) and the Vercel build command all call first. They do **not** run at request time.
- **OG images**: `@resvg/resvg-js` with fonts bundled in `backend/assets/fonts/` (`loadSystemFonts: false`) — serverless hosts have no system fonts. `vercel.json` ships them via `includeFiles`.
- **Search**: SQLite FTS5 virtual table (`documents_fts`) with Porter stemmer, kept in sync via triggers
- **Syntax highlighting**: `shiki` runs server-side at paste creation time, result stored as `highlighted_html`
- **Rate limiting**: In-memory via `rate_limit_log` table — no external cache needed

### Frontend (`frontend/src/`)
- **State**: TanStack Query for all server state. Auth state lives in the `["me"]` query key.
- **Auth flow**: Token stored in `localStorage` as `auth_token`. `useAuth` hook skips the `/me` fetch entirely if no token exists (`enabled: !!getToken()`). On 401, token is cleared from localStorage. Logout clears token locally first (never fails).
- **Layout**: `AppShell` renders either `TopNav` layout (logged-out) or `Sidebar` layout (logged-in) based on auth state. Shows a full-page spinner while auth is loading to prevent layout flash.
- **API layer**: All requests go through `apiFetch` in `api/client.ts` which attaches the Bearer token and `ngrok-skip-browser-warning` header automatically.
- **Routing**: `ProtectedRoute` wraps auth-required pages. `/` redirects to `/new` when logged in via `HomeRedirect` component.
- **Reserved handles**: profiles live at `/:handle`, so `backend/src/lib/reservedHandles.ts` blocks handles that would shadow a top-level route. Add new top-level routes there too.
- **Mux panel** (`/mux`, `pages/mux/MuxPage.tsx`): tmux-style split panes of pastes. The layout is a binary split tree (`lib/muxTree.ts`, pure + unit-tested with `bun test`) stored per user in `localStorage` (`clippr-mux:<userId>`); `computeLayout` flattens it to absolute rects so panes never remount when splitting/closing (editors keep drafts). Panes have a minimum size (`MIN_PANE_W`/`MIN_PANE_H` in `muxTree.ts`): split buttons disable and divider drags clamp (`canSplit`, `ratioBounds`) rather than going below it. Owners edit **content only** in a pane; saves send `PATCH /api/documents/:slug` with `expected_updated_at`, which returns **409** if the paste changed elsewhere (pane shows Reload / Overwrite).
- **Diagram pastes**: `language = "diagram"`, `content` = an Excalidraw scene as JSON (`backend/src/lib/diagram.ts` validates it: ≤1 MB, no embedded images). Shiki is skipped (`highlighted_html` is null). Search indexes the `search_text` column, not `content` (label text for diagrams, content for code), so JSON never matches or shows in excerpts; **every write to `documents` must set `search_text`**. `preview_svg` is a browser-made snapshot used only by the OG image (sanitized, never returned by the API). A paste can't switch between diagram and code. Frontend: Excalidraw is only imported by `components/diagram/DiagramCanvas.tsx`, loaded with `React.lazy` (keep it out of the main bundle); its fonts are copied to `public/excalidraw/` by `frontend/scripts/copy-excalidraw-assets.mjs` (run by `dev`/`build`) so nothing loads from a CDN.

- **Checklist pastes**: `language = "checklist"`, `content` = Markdown task lines (`- [ ] item` / `- [x] item`), validated and normalised by `backend/src/lib/checklist.ts` (1–500 items, ≤500 chars each); `search_text` holds the item text only, Shiki is skipped. Items are ticked **without editing** via `POST /api/documents/:slug/check` `{ index, checked, text }`, which changes just that item and returns **409** if the item at `index` no longer has that `text`. Who may tick is `canCheckDoc` (`lib/docAccess.ts`): the owner, plus group members on `group` pastes; GET returns it as `can_check`. Editing stays owner-only. A paste's kind (code / diagram / checklist) can't change after creation. Frontend: `lib/checklist.ts`, `components/checklist/` (`ChecklistEditor` for new/edit/Mux edit, `ChecklistView` for ticking).

- **Colour themes**: `lib/themes.ts` lists the palettes (id, name, dark/light `mode`, picker swatch). `<html>` carries `data-theme="<id>"` (palette) and `data-mode="dark|light"` (its base); `main.tsx` sets both before first render from `localStorage["clippr-theme"]`. In `index.css`, `:root` is Dark, `:root[data-mode="light"]` is the light base, and each other palette overrides colour tokens in `:root[data-theme="<id>"]`. `--color-blue` is the **accent** in every palette (not necessarily blue) — use it (or `--gradient-brand`) instead of hard-coded hex. Code that only cares about light vs dark (Shiki stripping, Excalidraw, CodeEditor, export) reads `mode` from `useTheme()`. The picker is `components/layout/ThemePicker.tsx`.

### Key data model notes
- Documents have three privacy levels: `public`, `group` (group members only), `private` (owner + explicitly shared users)
- Groups have `public`/`private` visibility. Members have roles: `owner`, `admin`, `member`
- Invite flow: `GET /api/groups/join/:code` previews, `POST` joins. Frontend auto-joins on page load if user is already authenticated.

### Mobile
All UI work must be mobile-friendly. Breakpoint is `768px`. On mobile:
- The sidebar is hidden; a fixed bottom nav (`MobileNav` from `Sidebar.tsx`) is shown instead
- `app-main` gets reduced padding and extra bottom padding (84px) for the nav bar
- New components should use `flexWrap`, avoid fixed widths, and test at 375px width

### Deployment
- **Vercel (everything)**: one project with the **repo root** as its root directory. Root `vercel.json` installs with Bun, runs migrations, builds `frontend/` into `frontend/dist`, and rewrites `/api/*` to the single function `api/index.ts`. Bot user-agents on `/docs/:slug` and `/join/:code` are rewritten to the function. **Vercel passes the function the original URL, not the rewrite destination**, so `src/app.ts` has `/docs/:slug` and `/join/:code` routes that forward to the OG meta handlers.
- **Env vars (Vercel)**: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `JWT_SECRET`, `FRONTEND_URL` (production URL — used for OG meta links and CORS), `NODE_ENV=production`. Leave `VITE_API_URL` **unset** so the frontend calls same-origin `/api`.
- **Database**: Turso (libSQL). FTS5 + triggers work unchanged. Databases `clippr` (prod) and `clippr-preview` live in AWS `ap-south-1` (Mumbai); `vercel.json` pins functions to `bom1` (Mumbai) to keep query latency low — change both together if you move regions. Turso rejects connection PRAGMAs (`journal_mode`, `synchronous`, `busy_timeout`) in migrations; only `foreign_keys` is allowed (guarded by a test).
- **Preview deployments**: migrations run during *every* Vercel build. Scope the production `TURSO_*` vars to the **Production** environment only and give **Preview** its own Turso database, so a branch's migration never touches production data before merge.
- **Self-hosted alternative**: Docker — `docker-compose.yml` at repo root, SQLite file in named volume `db_data` (`DB_PATH=/data/pastebin.db`).

### First-time Turso setup (fresh database, no data to import)
1. `turso db create pastepad`, then `turso db tokens create pastepad`.
2. Set the env vars above on Vercel and deploy. The build runs `bun run migrate`, which creates the schema on the empty database.
3. Verify in `turso db shell pastepad`: `SELECT name FROM _migrations;` lists 001–006, and **`PRAGMA foreign_keys;` returns 1**. The schema relies on `ON DELETE CASCADE`, so if it returns 0, fix FK enforcement before going live.
4. Smoke test: signup/login, create a paste, search, OG image, group join.
