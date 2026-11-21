# Clippr

One place for the bits your team keeps sharing. Paste code, configs, notes and diagrams, share them with a link, and keep them in groups.

## Features

**Pastes**
- Syntax highlighting for 30 languages, applied on save, plus rendered Markdown
- **Diagram pastes**: draw boxes, arrows and text with a built-in [Excalidraw](https://excalidraw.com) canvas, edit them later, and export as PNG or SVG. Switch a new paste between text and drawing with the icon in the editor's corner
- A code editor with optional Vim keybindings (Settings)
- Who can see a paste: **public**, **group** (members only) or **private** (you and the people you share it with)
- Link previews: shared links show the code or the drawing as an image in Slack, chat apps and social sites

**Finding and sharing**
- Full-text search across pastes by title, code or diagram label
- Trending: the most viewed public pastes this week
- Send a paste straight to another user; it shows up in their **Shared** inbox with a notification
- Save the pastes you keep coming back to
- Profile pages at `/<handle>`
- Command palette with <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd>

**Mux**
- A tmux-style workspace (`/mux`): split the screen into panes and view or edit several pastes, including diagrams, side by side
- Your layout is kept per browser, and saving warns you if the paste was changed somewhere else

**Groups**
- Public or private groups with owner, admin and member roles
- Invite links, and join requests for private groups

**Everywhere**
- Light and dark themes
- Works on phones: a bottom navigation bar with a More menu, and a touch-friendly drawing toolbar
- A collapsible sidebar on desktop

## Stack

- **Backend**: [Hono](https://hono.dev) on Bun (local and Docker) or Node (Vercel), libSQL / SQLite with FTS5 search, JWT auth, [Shiki](https://shiki.style) highlighting, OG images rendered with resvg
- **Frontend**: React + Vite + TypeScript, TanStack Query, CodeMirror, Excalidraw (loaded only when a diagram is shown)
- **Hosting**: Vercel (frontend and the API as one serverless function) with a [Turso](https://turso.tech) database

## Project layout

```text
backend/     Hono API (src/app.ts), routes, migrations, OG image rendering
frontend/    React app (src/pages, src/components)
api/         Vercel function entry, wraps backend/src/app.ts
e2e/         Playwright end-to-end tests
```

## Getting started

### Prerequisites

- [Bun](https://bun.sh) 1.0 or newer

### Install

```bash
bun install
```

### Configure

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Set a strong `JWT_SECRET` in `backend/.env`. Locally the backend uses a SQLite file (`DB_PATH`); set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to use Turso instead.

### Run

Start the API and the frontend in two terminals:

```bash
bun run dev:backend    # API on http://localhost:3001 (runs migrations first)
bun run dev:frontend   # app on http://localhost:5173, proxies /api to the backend
```

## Testing

```bash
cd backend && bun test              # backend unit and API tests (uses a temporary database)
cd frontend && bun test src/lib     # frontend unit tests
bun run test:e2e                    # Playwright end-to-end tests (needs both dev servers running)
```

Backend route changes come with tests; see [CLAUDE.md](CLAUDE.md) for the conventions used in this repo.

## Deploy

Everything runs on **Vercel** with a **Turso** database:

1. Create the database: `turso db create <name>`, then `turso db tokens create <name>`.
2. Import the repo into Vercel with the **repository root** as the project root (not `frontend/`). `vercel.json` sets the install and build commands, the output folder and the API rewrites.
3. Set the environment variables on Vercel: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `JWT_SECRET`, `FRONTEND_URL` (your production URL) and `NODE_ENV=production`. Leave `VITE_API_URL` unset, since the API is served from the same origin at `/api`.
4. Deploy. Migrations run during the build (`bun run migrate`).

Give preview deployments their own Turso database: migrations run on every build, so a branch should never migrate the production database.

### Self-hosting with Docker

```bash
docker compose up -d --build
```

This runs the backend with a local SQLite file. Set `DB_PATH=/data/pastebin.db` in `.env` so the database lives on the mounted volume and survives rebuilds.
