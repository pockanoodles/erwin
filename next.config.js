/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable all development indicators
  devIndicators: false,

  // `next dev` and `next start` both default to `.next`, so a dev session
  // silently overwrites the production build that the launchd service
  // (`com.erwin.app`, :3939) is serving — and the running server keeps
  // answering from memory, so nothing looks wrong until it restarts weeks
  // later on whatever the last dev run happened to leave behind. Give dev its
  // own directory; the two never touch.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",

  // Standalone output is only needed for the minimal Docker image. Native
  // `next start` (the daily-driver run path) needs a full build, and using
  // standalone with `next start` is unsupported — so gate it behind a flag.
  output: process.env.ERWIN_STANDALONE === "1" ? "standalone" : undefined,

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
