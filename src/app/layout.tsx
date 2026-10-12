import type { Viewport } from "next";
import { Chivo, Chivo_Mono, Michroma } from "next/font/google";

import { Providers } from "@/components/providers";
import { metadata as baseMetadata } from "./metadata";

/**
 * Equipment plate (brand/BRAND.md § Type). next/font fetches these at build
 * time and serves them from the app itself, so Erwin makes no font request
 * to anyone at run time, the desktop app included.
 */
const display = Michroma({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});
const sans = Chivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});
const mono = Chivo_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata = baseMetadata;

/** The browser chrome follows the theme: khaki by day, the field at night. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f6ee" },
    { media: "(prefers-color-scheme: dark)", color: "#14130d" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`h-full ${display.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex h-full flex-col bg-background font-sans text-[15px] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
