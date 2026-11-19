import { Hono } from "hono";
import { cors } from "./middleware/cors.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import docRoutes from "./routes/documents.js";
import groupRoutes from "./routes/groups.js";
import searchRoutes from "./routes/search.js";
import sendsRoutes from "./routes/sends.js";
import savedRoutes from "./routes/saved.js";
import trendingRoutes from "./routes/trending.js";
import { ogRoutes } from "./routes/og.js";

// The Hono app, shared by the Bun server (src/index.ts) and the Vercel function (api/).
// Migrations are NOT run here: `bun run start` runs them for Docker, and the Vercel
// build command runs them before deploying.
export const app = new Hono();

app.use("*", cors);
app.onError(errorHandler);

app.route("/api/auth", authRoutes);
app.route("/api/users", userRoutes);
app.route("/api/documents", docRoutes);
app.route("/api/groups", groupRoutes);
app.route("/api/search", searchRoutes);
app.route("/api/sends", sendsRoutes);
app.route("/api/saved", savedRoutes);
app.route("/api/trending", trendingRoutes);
app.route("/api/og", ogRoutes);

app.get("/health", (c) => c.json({ ok: true, ts: Date.now() }));
app.get("/api/health", (c) => c.json({ ok: true, ts: Date.now() }));
