import type { MetadataRoute } from "next";

import { brand } from "@/lib/brand";

// PWA manifest so sigwald installs as a standalone app (macOS "Add to Dock",
// iOS/Android home screen) with no browser chrome. One colour pair only, so
// it is the field-at-night ground from brand/tokens.css (--er-stage, --er-bg).
export default function manifest(): MetadataRoute.Manifest {
  return {
    // Without an id, Chrome keys an install to start_url, so moving start_url
    // orphans every install: it never takes a new name or icon again. "/today"
    // is the start_url every install since b476217 was keyed to.
    id: "/today",
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
