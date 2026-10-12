import type { MetadataRoute } from "next";

// PWA manifest so erwin installs as a standalone app (macOS "Add to Dock",
// iOS/Android home screen) with no browser chrome. One colour pair only, so
// it is the field-at-night ground from brand/tokens.css (--er-stage, --er-bg).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Erwin",
    short_name: "Erwin",
    description: "Your calendar, your courses and your goals, and the one thing to do next.",
    start_url: "/focus",
    display: "standalone",
    background_color: "#0e0d08",
    theme_color: "#14130d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
