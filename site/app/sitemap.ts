import type { MetadataRoute } from "next";
import { PAGES, pagePath } from "@/lib/routes";
import { SITE } from "./_lib/meta";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.flatMap((page) => {
    const languages = { en: `${SITE}${pagePath("en", page)}`, ja: `${SITE}${pagePath("ja", page)}` };
    return [
      { url: languages.en, alternates: { languages } },
      { url: languages.ja, alternates: { languages } },
    ];
  });
}
