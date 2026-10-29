import type { MetadataRoute } from "next";

import { brand } from "@/lib/brand";

// PWA manifest so sigwald installs as a standalone app (macOS "Add to Dock",
// iOS/Android home screen) with no browser chrome. One colour pair only, so
// it is the field-at-night ground from brand/tokens.css (--er-stage, --er-bg).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.name,
    description: brand.description,
    start_url: "/today",
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
