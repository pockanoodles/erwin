// Brings the brand into the site before each build. It lives in this
// repository (../brand), so the page can never show a colour or a mark the
// product doesn't have. The copies are gitignored.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(site, "..");

mkdirSync(join(site, "generated"), { recursive: true });
mkdirSync(join(site, "public", "brand"), { recursive: true });
copyFileSync(join(repo, "brand", "tokens.css"), join(site, "generated", "tokens.css"));
copyFileSync(join(repo, "brand", "favicon.svg"), join(site, "public", "favicon.svg"));
for (const f of ["mark-dark.svg", "mark-light.svg", "mark-mono.svg", "app-icon.svg"]) {
  copyFileSync(join(repo, "brand", f), join(site, "public", "brand", f));
}
// The raster icon the app ships (scripts/brand-assets.mjs makes it).
copyFileSync(join(repo, "public", "icons", "apple-touch-icon.png"), join(site, "public", "apple-touch-icon.png"));
