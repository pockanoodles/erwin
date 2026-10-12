# Erwin brand

One look for the app (`src/`), the desktop shell (`desktop/`) and the landing page (`site/`, served at kaitosoeno.com/erwin). The values live in `tokens.css`, and this file says why they are what they are, so a later change can disagree with a reason instead of a hex.

## The idea

Erwin answers one question, which is what you should do right now, and it should be as easy to read as a field watch, because a field watch exists to be read at a glance in bad light. The reference is the Hamilton Khaki Field Mechanical, a watch Hamilton still makes in the line of the ones it built for soldiers. Its olive strap, cream lume and leather band gave the palette, its dial gave the motif, and its plain equipment-plate lettering gave the type. The "rough" in the brief comes from material rather than decoration (bead-blasted grain, stenciled plates, rust).

## Mark

A plate with two corners cut, carrying the dial's twelve-o'clock index and a short run of railroad minute track. The index is rust and points down at the plate's empty face, which is where the one thing to do next goes. Files are `mark-dark.svg` (on dark grounds), `mark-light.svg` (on light grounds), `mark-mono.svg` (`currentColor`, with the track and index cut through) and `favicon.svg` (a heavier index with no track, which follows the OS theme).

- The minimum size is 16px, and below 32px use `favicon.svg`, since the track turns to noise.
- Keep clear space of half the mark's width around it.
- The wordmark is live text, "ERWIN" in Michroma at 0.14em tracking, set 10 to 12px from the mark.
- Never add a container, a gradient or a second colour to the small marks.

`app-icon.svg` is the platform icon. It is full bleed because macOS 26 masks app icons into its own squircle and puts any icon with a transparent margin into a grey box, so the art sits inside the central 72% where every platform's mask leaves it whole. `node scripts/brand-assets.mjs` regenerates every raster icon from these files.

## Colour

Every value was sampled from Hamilton's product photos of the Khaki Field Mechanical (the median colour of a region of one photo, named by reference number), then converged in oklch.

| Token | Light | Dark | Source and job |
|---|---|---|---|
| `--er-stage` | `#f3eddb` | `#0e0d08` | Khaki canvas strap by day, black dial by night. The landing page ground. |
| `--er-bg` | `#f8f6ee` | `#14130d` | The app window. |
| `--er-surface` | `#f0ecdf` | `#1b1a13` | Rails and grouped panels. |
| `--er-raised` | `#fefdf9` | `#23221a` | Inputs, popovers and dialogs. |
| `--er-line` / `-strong` | `#d8d4c6` / `#b5b1a0` | `#323127` / `#4d4b40` | Hairlines and input borders. |
| `--er-ink` | `#1b1a0f` (16.2:1) | `#f0e7d3` (15.2:1) | Text. Day ink is the dark strap weave and night ink is the Old Radium lume. |
| `--er-muted` | `#514d3e` (7.8:1) | `#c0b6a2` (9.3:1) | Secondary text. |
| `--er-faint` | `#686557` (5.4:1) | `#928c7b` (5.5:1) | Labels and tertiary text. |
| `--er-accent` | `#b3491b` | `#cf6136` | Rust, from the saddle-leather strap. |
| `--er-accent-text` | `#ad4212` (5.4:1) | `#e57f4f` (6.6:1) | Rust when it has to be read as text. |
| `--er-ok` | `#4d6824` | `#9dbf71` | Done and connected, from the green dial. |
| `--er-warn` | `#8f5d04` | `#ebbc63` | Due soon, from the lume family. |
| `--er-danger` | `#b9292d` | `#ef6661` | Errors and overdue only. |
| `--er-olive` | `#4d482d` | `#3b361c` | The strap itself, for bands on the landing page. |
| `--er-lume` | `#d4ba8e` | `#d4ba8e` | Old Radium, for the dial motif. |

Contrast figures are against `--er-bg`, and every text pair also clears 4.5:1 against `--er-surface`. Neutrals carry the strap's olive hue (H 93 to 100) at chroma 0.011 to 0.017, which keeps the greys reading as canvas instead of paint.

**There is one accent, and rust means "now".** It marks the next task, the current time on the calendar, the page's one main action and keyboard focus. Selection is framed in ink brackets and status is carried by bracketed words and shapes, so nothing else needs a second colour. The status colours (ok, warn, danger) are semantic, so they never decorate.

## Type

The pick is F4 from the specimen, "equipment plate", and it has three voices with strict jobs.

- **Michroma** (display) sets titles, the page name in the top bar, big readouts and the wordmark. It is wide and has one weight, so it is set in capitals, small, at 0.02 to 0.14em tracking. It sits in the rounded-square line of Microgramma, which is the look of 1960s instrument panels.
- **Chivo** (text) sets everything that is read, from task titles to body copy. Body is 15px in the app and 16 to 18px on the landing page.
- **Chivo Mono** (data) sets anything a machine would print, such as times, dates, counts, course codes, column headers and labels. Labels are 11 to 12px capitals at 0.08 to 0.12em tracking, and figures that line up in a column are tabular.
- **Murecho** sets Japanese on /erwin/ja.

All four are SIL Open Font License. The app and the site load them through `next/font`, which downloads them at build time and serves them itself, so Erwin makes no font request to anyone at run time.

## Components

The pick is B2 from the specimen, "crate stencil", which borrows the markings stenciled on supply crates. The parts are classes in `src/app/globals.css` (the "Field kit" block), so every surface composes the same pieces.

- `.er-plate` is a plate with the top-left and bottom-right corners cut. The page's main action is a rust plate, a second action is a surface plate, and an active segment is an ink plate. The cut is painted with gradients instead of `clip-path`, so a focus ring around a plate is never clipped away. Set its colour with `--plate`, because a `bg-*` class would fill the cut corners back in.
- `.er-brackets` draws four corner brackets, the registration marks around a stencil. They frame selection (the current page in the rail, an outlined button, a dialog).
- `.er-slash` is the quiet action, a stencil slash and a word ("/ SKIP").
- `.er-bracketed` turns a word into a status, like "[ NEXT ]", coloured by what it means.
- `.er-track` is the dial's railroad minute track, used as a rule.
- `.er-grain` adds bead-blasted grain to chrome surfaces such as the rail, the top bar and the boot screen. It never goes under data, since grain under text costs legibility.

## Space and shape

Spacing follows ui-master Design 03, which Mahoraga uses too, so the three product pages on kaitosoeno.com share one rhythm. That means the 4 to 128px ladder (`--er-s-1` to `--er-s-12`), one gutter (16px, 32px from 640px), and outer gaps at least three times the inner gaps. Shape is the opposite of Mahoraga's soft panels. Controls and panels have 2px corners, plates have cut corners, and only things that are round on the watch are round (lume pips, the crown). Shadows are not used, so a floating panel separates by its border and its raised colour.

## Motion

One curve, `cubic-bezier(0.2, 0.8, 0.2, 1)`, shared with Mahoraga. UI feedback takes 160 to 240ms and entrances take 700ms. The only ornament that moves is the dial's seconds hand on the landing page, and under reduced motion it stops at the current time.

## Voice

Copy is plain and specific. A screen names one thing to do, a control says what it does ("Start focus", "Defer"), and every number on the landing page comes from the product itself and says what it means. Web copy is one short sentence per idea, with no fragments, no em dashes and no "it's not X, it's Y" turns.
