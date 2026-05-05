import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Erwin",
  description: "Your personal task intelligence system",
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/logo.svg", type: "image/svg+xml", sizes: "64x64" },
    ],
    apple: [{ url: "/logo.svg", type: "image/svg+xml", sizes: "180x180" }],
  },
};
