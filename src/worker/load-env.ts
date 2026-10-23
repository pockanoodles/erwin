/**
 * Loads `.env` from the project cwd before the Prisma client initializes.
 * `node dist/...` does not load env files automatically (unlike `next dev`).
 */

import path from "path";

import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env") });
