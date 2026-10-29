// `next dev` and `next start` both default to `.next`, so a dev session
// silently overwrites the production build a running `next start` server is
// serving — and that server keeps answering from memory, so nothing looks
// wrong until it restarts weeks later on whatever the last dev run happened
// to leave behind. Give dev its own directory; the two never touch.
//
// The desktop build (`npm run build:desktop`) gets a third directory for the
// same reason: it must never replace the build a running server is using.
const distDir =
  process.env.SIGWALD_DIST_DIR ||
  (process.env.NODE_ENV === "development" ? ".next-dev" : ".next");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable all development indicators
  devIndicators: false,

  distDir,

  // Each run checks types against its own directory's generated route types
  // and no other's. A build clears only its own directory, so a route deleted
  // since another directory was last built leaves a type file there that
  // imports a page that no longer exists. Reading every directory's types
  // failed the 2026-10-26 deploy on `.next-desktop`'s copy of the removed
  // /progress page.
  typescript: {
    tsconfigPath:
      {
        ".next": "tsconfig.build.json",
        ".next-desktop": "tsconfig.desktop.json",
        ".next-dev": "tsconfig.dev.json",
        ".next-local": "tsconfig.dev.json",
      }[distDir] ?? "tsconfig.json",
  },

  // Standalone output is only needed for the minimal Docker image. Native
  // `next start` (the daily-driver run path) needs a full build, and using
  // standalone with `next start` is unsupported — so gate it behind a flag.
  output: process.env.SIGWALD_STANDALONE === "1" ? "standalone" : undefined,

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

  // The product was called Erwin until 1.0. ops still calls /api/erwin/* and
  // reads each Focus task's `erwin` field (sigwald/focus/queue/route.ts), so
  // both answer until ops moves to the new names. Delete both together then.
  async rewrites() {
    return [{ source: "/api/erwin/:path*", destination: "/api/sigwald/:path*" }];
  },
};

module.exports = nextConfig;
