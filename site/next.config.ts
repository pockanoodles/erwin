import path from "node:path";
import type { NextConfig } from "next";

// The landing page lives at kaitosoeno.com/sigwald, served by its own Worker on
// that route (wrangler.jsonc), so every URL it makes starts with /sigwald.
const nextConfig: NextConfig = {
  output: "export",
  basePath: "/sigwald",
  trailingSlash: true,
  images: { unoptimized: true },
  // The site is its own package inside the app's repo, with its own lockfile.
  // Without this, Next sees both lockfiles and guesses the repo root.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
