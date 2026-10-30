// The site's pages and where each lives in each language. Links between pages,
// the metadata and the sitemap read their paths from here.
import type { Locale } from "@/content/copy";

export type Page = "landing" | "privacy";
export const PAGES: readonly Page[] = ["landing", "privacy"];

const ROOT: Record<Locale, string> = { en: "/sigwald/", ja: "/sigwald/ja/" };

export function pagePath(locale: Locale, page: Page): string {
  return page === "landing" ? ROOT[locale] : `${ROOT[locale]}${page}/`;
}
