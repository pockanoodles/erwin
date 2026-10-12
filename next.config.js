/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable all development indicators
  devIndicators: false,

  // `next dev` and `next start` both default to `.next`, so a dev session
  // silently overwrites the production build a running `next start` server is
  // serving — and that server keeps answering from memory, so nothing looks
  // wrong until it restarts weeks later on whatever the last dev run happened
  // to leave behind. Give dev its own directory; the two never touch.
  //
  // The desktop build (`npm run build:desktop`) gets a third directory for the
  // same reason: it must never replace the build a running server is using.
  distDir:
    process.env.ERWIN_DIST_DIR ||
    (process.env.NODE_ENV === "development" ? ".next-dev" : ".next"),

  // Standalone output is only needed for the minimal Docker image. Native
  // `next start` (the daily-driver run path) needs a full build, and using
  // standalone with `next start` is unsupported — so gate it behind a flag.
  output: process.env.ERWIN_STANDALONE === "1" ? "standalone" : undefined,

  // `@/lib/logger` is one facade used from both sides: it decides at runtime
  // whether to write to the database or POST to /api/logs/batch. The bundler
  // cannot see that decision, so its static import of the database half pulled
  // the Prisma client into the browser bundle, where Prisma throws at module
  // scope — every page rendered as "a client-side exception has occurred".
  //
  // Swap the database half for a stub in the client build. Fixing it here
  // rather than by splitting the facade keeps the import unchanged in all 111
  // files that use it, which matters on a fork that ports upstream commits.
  // Matched on the resolved file rather than the import string: `@/…` paths go
  // through Next's own tsconfig-paths resolver, which wins over resolve.alias.
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      const path = require("path");
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /src[\\/]lib[\\/]logger[\\/]server\.ts$/,
          path.resolve(__dirname, "src/lib/logger/server.browser.ts")
        )
      );
    }
    return config;
  },

  // `npm run dev` is Turbopack, which does not run the webpack plugin above.
  // The `browser` condition is required: a blanket alias also replaces the
  // module on the server, and the stub then throws during SSR.
  turbopack: {
    resolveAlias: {
      "@/lib/logger/server": {
        browser: "./src/lib/logger/server.browser.ts",
      },
    },
  },

  // Determine which file extensions to use based on SAAS enablement
  pageExtensions: (() => {
    const isSaasEnabled =
      process.env.NEXT_PUBLIC_ENABLE_SAAS_FEATURES === "true";

    // Base extensions
    const baseExtensions = ["js", "jsx", "ts", "tsx"];

    if (isSaasEnabled) {
      // For SAAS version, include .saas. files and exclude .open. files
      return [
        ...baseExtensions.map((ext) => ext),
        ...baseExtensions.map((ext) => `saas.${ext}`),
      ].filter((ext) => !ext.includes(".open."));
    } else {
      // For open source version, include .open. files and exclude .saas. files
      return [
        ...baseExtensions.map((ext) => ext),
        ...baseExtensions.map((ext) => `open.${ext}`),
      ].filter((ext) => !ext.includes(".saas."));
    }
  })(),
};

module.exports = nextConfig;
