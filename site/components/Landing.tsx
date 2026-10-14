"use client";

// The landing page, both languages. Composition is ui-master Design 03 (the
// spacing Mahoraga's page uses too): a corner-anchored hero with the dial in
// the middle, then one idea per screen. The parts are Erwin's own field kit
// (brand/BRAND.md): rust plates for the one main action per screen, corner
// brackets for frames, Michroma for the statement and readouts.
import { useEffect, useState } from "react";
import type { Dict, Locale } from "@/content/copy";
import { channels, PORTFOLIO_URL, RELEASES_URL, REPO_URL, type ChannelGroup } from "@/content/channels";
import { AppTour } from "./AppTour";
import { Dial, type DayBlock } from "./Dial";
import { Downloads, detectGroup } from "./Downloads";
import { Mark } from "./Mark";
import { SiteMenu } from "./SiteMenu";

// One example day for the dial, in minutes after midnight.
const DAY: DayBlock[] = [
  { start: 7 * 60, end: 8 * 60, label: "Gym" },
  { start: 9 * 60 + 50, end: 11 * 60 + 30, label: "CS 3500" },
  { start: 13 * 60 + 35, end: 14 * 60 + 40, label: "MATH 2331" },
  { start: 15 * 60, end: 16 * 60 + 40, label: "CS 3500 lab" },
  { start: 17 * 60, end: 18 * 60, label: "Co-op info session" },
  { start: 19 * 60, end: 21 * 60, label: "Assignment 5" },
];

const DIAL_LABEL: Record<Locale, string> = {
  en: "A field-watch dial showing the current time, with an example day of classes on its inner track.",
  ja: "現在時刻を示すフィールドウォッチの文字盤。内側のトラックに 1 日の授業の例が並んでいる。",
};

export function Landing({ t, locale }: { t: Dict; locale: Locale }) {
  const [group, setGroup] = useState<ChannelGroup | null>(null);
  useEffect(() => setGroup(detectGroup()), []);

  const liveForMine = channels.some((c) => c.group === group && c.live && c.href);
  const ctaLabel = group === "mac" ? t.hero.cta.mac : group === "windows" ? t.hero.cta.windows : group === "linux" ? t.hero.cta.linux : t.hero.cta.other;
  const ctaHref = liveForMine ? RELEASES_URL : "#install";
  const other = locale === "en" ? { href: "/erwin/ja/", label: "日本語" } : { href: "/erwin/", label: "English" };

  return (
    <>
      <header className="bar">
        <a href={locale === "en" ? "/erwin/" : "/erwin/ja/"} className="bar__brand" aria-label={t.nav.label}>
          <Mark size={26} />
          <span>ERWIN</span>
        </a>
        <nav className="bar__nav" aria-label={t.nav.label}>
          <a href="#how">{t.nav.how}</a>
          <a href="#app">{t.nav.app}</a>
          <a href="#data">{t.nav.data}</a>
          <a href="#install">{t.nav.install}</a>
        </nav>
        <div className="bar__util">
          <a href={other.href} hrefLang={locale === "en" ? "ja" : "en"} className="label">
            {other.label}
          </a>
          <a href={REPO_URL} className="label">
            {t.nav.github}
          </a>
        </div>
      </header>

      <main>
        <section className="hero" data-hero>
          <div className="hero__visual">
            <Dial blocks={DAY} label={DIAL_LABEL[locale]} />
            <p className="label hero__caption">{t.hero.dial.caption}</p>
          </div>
          <div className="hero__words">
            <p className="label">{t.hero.label}</p>
            <h1 className="hero__statement">{t.hero.statement}</h1>
            <p className="hero__sub">{t.hero.sub}</p>
          </div>
          <div className="hero__action">
            <a href={ctaHref} className="plate plate--lg">
              {ctaLabel}
            </a>
            <a href="#install" className="hero__more">
              {t.hero.more} <span aria-hidden>↓</span>
            </a>
          </div>
        </section>

        <section id="how" className="screen">
          <div className="screen__body">
            <p className="label eyebrow">{t.how.eyebrow}</p>
            <h2 className="screen__title">{t.how.title}</h2>
            <ol className="steps">
              {t.how.steps.map((step, i) => (
                <li key={step.title} className="step">
                  <span className="step__n">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="step__title">{step.title}</h3>
                  <p className="step__body">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="app" className="screen">
          <div className="screen__body screen__body--wide">
            <p className="label eyebrow">{t.app.eyebrow}</p>
            <h2 className="screen__title">{t.app.title}</h2>
            <AppTour t={t.app} />
          </div>
        </section>

        <section id="data" className="screen">
          <div className="screen__body split">
            <div className="split__lead">
              <p className="label eyebrow">{t.data.eyebrow}</p>
              <h2 className="screen__title screen__title--left">{t.data.title}</h2>
              <p className="lede">{t.data.body}</p>
            </div>
            <ul className="points">
              {t.data.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        </section>

        <section id="install" className="screen">
          <div className="screen__body screen__body--wide">
            <p className="label eyebrow">{t.install.eyebrow}</p>
            <h2 className="screen__title">{t.install.title}</h2>
            <p className="screen__sub">{t.install.sub}</p>
            <Downloads t={t.install} />
          </div>
        </section>

        <section id="open" className="screen screen--end">
          <div className="screen__body">
            <p className="label eyebrow">{t.open.eyebrow}</p>
            <h2 className="screen__title">{t.open.title}</h2>
            <p className="screen__sub">{t.open.body}</p>
            <div className="end__action">
              <a href={REPO_URL} className="plate plate--lg">
                {t.open.cta}
              </a>
              <p className="end__note">
                {t.open.by}{" "}
                <a href={locale === "en" ? PORTFOLIO_URL : "https://kaitosoeno.com/ja/portfolio"}>
                  {t.open.more} <span aria-hidden>→</span>
                </a>
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="foot__brand">
          <Mark size={22} />
          <span>
            {t.footer.rights} · {t.footer.license}
          </span>
        </div>
        <div className="foot__cols">
          <div>
            <p className="label">{t.footer.product}</p>
            <ul>
              <li>
                <a href="#install">{t.nav.install}</a>
              </li>
              <li>
                <a href={REPO_URL}>{t.footer.source}</a>
              </li>
              <li>
                <a href={locale === "en" ? "https://kaitosoeno.com/privacy" : "https://kaitosoeno.com/ja/privacy"}>{t.footer.privacy}</a>
              </li>
            </ul>
          </div>
          <div>
            <p className="label">{t.footer.maker}</p>
            <ul>
              <li>
                <a href={locale === "en" ? PORTFOLIO_URL : "https://kaitosoeno.com/ja/portfolio"}>{t.footer.portfolio}</a>
              </li>
              <li>
                <a href={locale === "en" ? "https://kaitosoeno.com/" : "https://kaitosoeno.com/ja"}>{t.menu.items[0].label}</a>
              </li>
            </ul>
          </div>
        </div>
      </footer>

      <SiteMenu t={t.menu} />
    </>
  );
}
