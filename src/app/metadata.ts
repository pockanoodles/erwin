import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Erwin",
  description: "Your personal task intelligence system",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Erwin",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/logo.svg", type: "image/svg+xml", sizes: "any" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
    ],
  },
};
