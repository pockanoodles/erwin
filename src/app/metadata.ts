import { brand } from "@/lib/brand";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: brand.name,
  description: brand.description,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: brand.name,
    statusBarStyle: "black-translucent",
  },
  // src/app/icon.svg (theme-aware) and src/app/favicon.ico are picked up by
  // Next's file conventions; these are the raster sizes platforms ask for.
  // All of them are generated from brand/ by scripts/brand-assets.mjs.
  icons: {
    icon: [{ url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" }],
    apple: [
      { url: "/icons/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
    ],
  },
};
