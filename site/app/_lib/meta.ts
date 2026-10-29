import type { Metadata, Viewport } from "next";
import { copy, type Locale } from "@/content/copy";

export const SITE = "https://kaitosoeno.com";

const PATHS: Record<Locale, string> = { en: "/sigwald/", ja: "/sigwald/ja/" };

export function metadataFor(locale: Locale): Metadata {
  const t = copy[locale].meta;
  return {
    metadataBase: new URL(SITE),
    title: t.title,
    description: t.description,
    alternates: { canonical: PATHS[locale], languages: { en: PATHS.en, ja: PATHS.ja, "x-default": PATHS.en } },
    icons: { icon: "/sigwald/favicon.svg", apple: "/sigwald/apple-touch-icon.png" },
    openGraph: {
      type: "website",
      url: PATHS[locale],
      title: t.title,
      description: t.description,
      siteName: "Sigwald",
      locale: locale === "ja" ? "ja_JP" : "en_US",
      images: [{ url: "/sigwald/og.png", width: 1200, height: 630, alt: t.title }],
    },
    twitter: { card: "summary_large_image", title: t.title, description: t.description, images: ["/sigwald/og.png"] },
  };
}

// The page is the field at night, continuing the black of the rest of the site.
export const viewport: Viewport = {
  themeColor: "#0e0d08",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
