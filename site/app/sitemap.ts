import type { MetadataRoute } from "next";
import { SITE } from "./_lib/meta";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/erwin/`, alternates: { languages: { ja: `${SITE}/erwin/ja/` } } },
    { url: `${SITE}/erwin/ja/`, alternates: { languages: { en: `${SITE}/erwin/` } } },
  ];
}
