// Copies Erwin's staged server into the packed app, after packing and before
// signing. It cannot go through extraResources: electron-builder applies the
// repository's .gitignore to those copies, which drops node_modules, and the
// server cannot start without its own (Next's runtime, Prisma's engine).
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  const resources =
    electronPlatformName === "darwin" || electronPlatformName === "mas"
      ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, "Contents", "Resources")
      : path.join(appOutDir, "resources");
  const from = path.join(__dirname, "..", ".stage", "server");
  if (!fs.existsSync(path.join(from, "server.js"))) {
    throw new Error("No staged server: run `npm run build:desktop` at the repository root first");
  }
  fs.cpSync(from, path.join(resources, "server"), { recursive: true, verbatimSymlinks: true });
};
