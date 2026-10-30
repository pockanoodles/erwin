// The bar every page carries: the mark, the landing page's four sections, the
// language switch and GitHub. On the landing page the section links are
// anchors, and from any other page they lead back to those sections.
import type { Dict, Locale } from "@/content/copy";
import { REPO_URL } from "@/content/channels";
import { pagePath, type Page } from "@/lib/routes";
import { Mark } from "./Mark";

const SECTIONS = ["how", "app", "data", "install"] as const;

export function Bar({ t, locale, page }: { t: Dict; locale: Locale; page: Page }) {
  const home = pagePath(locale, "landing");
  const at = page === "landing" ? "" : home;
  const other = locale === "en" ? { lang: "ja", label: "日本語" } : { lang: "en", label: "English" };
  return (
    <header className="bar">
      <a href={home} className="bar__brand" aria-label={t.nav.label}>
        <Mark size={26} />
        <span>SIGWALD</span>
      </a>
      <nav className="bar__nav" aria-label={t.nav.label}>
        {SECTIONS.map((id) => (
          <a key={id} href={`${at}#${id}`}>
            {t.nav[id]}
          </a>
        ))}
      </nav>
      <div className="bar__util">
        <a href={pagePath(other.lang as Locale, page)} hrefLang={other.lang} className="label">
          {other.label}
        </a>
        <a href={REPO_URL} className="label">
          {t.nav.github}
        </a>
      </div>
    </header>
  );
}
