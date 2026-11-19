# Clippr

A lightweight pastebin for sharing code, configs, and notes. Syntax highlighted. Fast.

## Stack

- **Backend** — Bun + Hono, SQLite (FTS5 full-text search), JWT auth
- **Frontend** — React + Vite, TypeScript
- **Deployment** — Vercel (frontend + API as a serverless function), Turso (libSQL database)

## Features

- Create public or private pastes with syntax highlighting
- Full-text search across public pastes
- User accounts with profile pages
- Organizations with invite-based membership

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0+

### Install

```bash
bun install
```

### Configure

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Edit `backend/.env` and set a strong `JWT_SECRET`.

### Run

```bash
bun run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## Deploy

Everything runs on **Vercel** with a **Turso** database:

1. Create the database: `turso db create pastepad` and `turso db tokens create pastepad`.
2. Import the repo into Vercel with the **repository root** as the project root (not `frontend/`). `vercel.json` sets the install/build commands, output dir and API rewrites.
3. Set env vars on Vercel: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `JWT_SECRET`, `FRONTEND_URL` (your Vercel URL), `NODE_ENV=production`. Leave `VITE_API_URL` unset: the API is same-origin at `/api`.
4. Deploy. Migrations run during the build (`bun run migrate`).

The Docker setup (`docker compose up -d --build`) still works as a self-hosted alternative using a local SQLite file via `DB_PATH`.
