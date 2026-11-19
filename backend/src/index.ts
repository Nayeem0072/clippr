// Bun server entry for local dev and Docker. Vercel uses api/[[...route]].ts instead.
import { app } from "./app.js";

const port = Number(process.env.PORT ?? 3001);
console.log(`[server] Listening on http://localhost:${port}`);

export default { port, fetch: app.fetch };
