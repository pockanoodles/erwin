import type { MetadataRoute } from "next";
import { SITE } from "./_lib/meta";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/sigwald/`, alternates: { languages: { ja: `${SITE}/sigwald/ja/` } } },
    { url: `${SITE}/sigwald/ja/`, alternates: { languages: { en: `${SITE}/sigwald/` } } },
  ];
}
