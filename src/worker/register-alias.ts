/**
 * Registers `@/*` → `dist/` so compiled worker code can resolve `@/lib/...` requires.
 * Must be imported before any other local imports in `worker.ts`.
 */

import path from "path";

import { addAliases } from "module-alias";

// Compiled to dist/worker/, so `dist/` is one level up.
addAliases({
  "@": path.resolve(__dirname, ".."),
});
