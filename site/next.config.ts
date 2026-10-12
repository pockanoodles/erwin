import type { NextConfig } from "next";

// The landing page lives at kaitosoeno.com/erwin, served by its own Worker on
// that route (wrangler.jsonc), so every URL it makes starts with /erwin.
const nextConfig: NextConfig = {
  output: "export",
  basePath: "/erwin",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
