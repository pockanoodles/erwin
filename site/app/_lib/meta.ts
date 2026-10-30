import type { Metadata, Viewport } from "next";
import { copy, type Locale } from "@/content/copy";
import { policy } from "@/content/privacy";
import { pagePath, type Page } from "@/lib/routes";

export const SITE = "https://kaitosoeno.com";

// Every page states its own canonical and hreflang pair: Next merges metadata
// one key deep, so a page that set only a title would inherit the landing
// page's canonical and read as a copy of it.
export function metadataFor(locale: Locale, page: Page = "landing"): Metadata {
  const t = page === "privacy" ? policy[locale].meta : copy[locale].meta;
  const path = pagePath(locale, page);
  return {
    metadataBase: new URL(SITE),
    title: t.title,
    description: t.description,
    alternates: {
      canonical: path,
      languages: { en: pagePath("en", page), ja: pagePath("ja", page), "x-default": pagePath("en", page) },
    },
    icons: { icon: "/sigwald/favicon.svg", apple: "/sigwald/apple-touch-icon.png" },
    openGraph: {
      type: "website",
      url: path,
      title: t.title,
      description: t.description,
      siteName: "Sigwald",
      locale: locale === "ja" ? "ja_JP" : "en_US",
      images: [{ url: "/sigwald/og.png", width: 1200, height: 630, alt: copy[locale].meta.title }],
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
