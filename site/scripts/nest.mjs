// next export writes out/index.html for a page whose URL is /erwin/. The
// Worker serves files at their path inside the assets directory, so the
// export moves under dist/erwin/ and the URLs and the files line up.
import { cpSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
rmSync(join(site, "dist"), { recursive: true, force: true });
cpSync(join(site, "out"), join(site, "dist", "erwin"), { recursive: true });
