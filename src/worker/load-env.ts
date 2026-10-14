/**
 * Loads `.env` from the project cwd before Prisma / Redis clients initialize.
 * `node dist/...` does not load env files automatically (unlike `next dev`).
 */

import path from "path";

import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env") });
