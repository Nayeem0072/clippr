// Vercel Function entry (Node.js runtime). Every /api/* request is rewritten here
// by vercel.json; Hono routes on the original URL path.
import { app } from "../backend/src/app.js";

export default app;
