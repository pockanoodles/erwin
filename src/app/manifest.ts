import type { MetadataRoute } from "next";

// PWA manifest so erwin installs as a standalone app (macOS "Add to Dock",
// iOS/Android home screen) with no browser chrome. Colors track the light
// theme in globals.css (--background 45 49% 97%, --primary 222 47% 11%).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Erwin",
    short_name: "Erwin",
    description: "Your personal task intelligence system",
    start_url: "/focus",
    display: "standalone",
    background_color: "#faf8f2",
    theme_color: "#111a2e",
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
