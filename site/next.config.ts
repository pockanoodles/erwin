import type { NextConfig } from "next";

// The landing page lives at kaitosoeno.com/sigwald, served by its own Worker on
// that route (wrangler.jsonc), so every URL it makes starts with /sigwald.
const nextConfig: NextConfig = {
  output: "export",
  basePath: "/sigwald",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
