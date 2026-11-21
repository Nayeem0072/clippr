// Copies Excalidraw's fonts into public/ so diagrams never load fonts from a CDN at runtime.
// main.tsx points window.EXCALIDRAW_ASSET_PATH at /excalidraw/. Output is gitignored.
import { cpSync, existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// The package only exports its entry point (dist/prod/index.js); fonts sit next to it.
const src = join(dirname(require.resolve("@excalidraw/excalidraw")), "fonts");
const dest = join(here, "..", "public", "excalidraw", "fonts");

if (!existsSync(src)) {
  console.error(`[excalidraw-assets] fonts not found at ${src}`);
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log("[excalidraw-assets] copied fonts to public/excalidraw/fonts");
