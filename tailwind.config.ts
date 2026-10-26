import tailwindcssForms from "@tailwindcss/forms";
import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * Every colour is a brand token from brand/tokens.css, read live through a
 * CSS variable. `color-mix` keeps Tailwind's opacity modifiers working
 * (`bg-rust/5`) without a second, derived copy of the palette to drift.
 */
const token = (slot: string) =>
  `color-mix(in srgb, var(--er-${slot}) calc(<alpha-value> * 100%), transparent)`;

const config: Config = {
  darkMode: ["class", "[data-theme='dark']"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/modules/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // The shadcn names the components were written against, mapped onto
        // the field palette. `primary` is ink, as it was under the Linear
        // theme: rust is not a general emphasis colour, it means "now".
        border: token("line"),
        input: token("line-strong"),
        ring: token("accent"),
        background: token("bg"),
        foreground: token("ink"),
        sidebar: token("surface"),
        primary: { DEFAULT: token("ink"), foreground: token("bg") },
        secondary: { DEFAULT: token("surface"), foreground: token("ink") },
        destructive: { DEFAULT: token("danger"), foreground: token("on-accent") },
        warning: { DEFAULT: token("warn"), foreground: token("on-accent") },
        ok: { DEFAULT: token("ok"), foreground: token("on-accent") },
        muted: { DEFAULT: token("surface"), foreground: token("faint") },
        accent: { DEFAULT: token("hover"), foreground: token("ink") },
        popover: { DEFAULT: token("raised"), foreground: token("ink") },
        card: { DEFAULT: token("raised"), foreground: token("ink") },

        // The field palette by its own names, for new work.
        rust: {
          DEFAULT: token("accent"),
          text: token("accent-text"),
          wash: token("accent-wash"),
          band: token("accent-band"),
          foreground: token("on-accent"),
        },
        stage: token("stage"),
        surface: token("surface"),
        raised: token("raised"),
        hover: token("hover"),
        selected: token("selected"),
        line: { DEFAULT: token("line"), strong: token("line-strong") },
        ink: { DEFAULT: token("ink"), muted: token("muted"), faint: token("faint") },
        olive: token("olive"),
        lume: token("lume"),
      },
      fontFamily: {
        // Equipment plate (F4): Michroma for titles and readouts, Chivo for
        // everything read, Chivo Mono for anything a machine would print.
        display: ["var(--font-display)", "Michroma", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "Chivo", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "Chivo Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        lg: "var(--er-radius-panel)",
        md: "var(--er-radius-control)",
        sm: "var(--er-radius-small)",
      },
      transitionTimingFunction: {
        field: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      spacing: {
        /** Height of the app top bar (AppTopBar). Pages that need to size
         *  against the viewport minus the bar can use `h-[calc(100dvh-theme(spacing.topbar))]`. */
        topbar: "2.75rem", // 44px
        /** The one width every secondary sidebar uses — the calendar's feed
         *  list and the tasks Lord list. They were 208px and 256px, so the
         *  content edge jumped every time you changed page; a single token is
         *  the only thing that keeps them honest as more pages grow one. */
        sidebar: "14rem", // 224px
        /** Width of the left nav rail when open. */
        rail: "12rem", // 192px
      },
    },
  },
  plugins: [tailwindcssAnimate, tailwindcssForms],
};

export default config;
