#!/usr/bin/env node
/**
 * Regenerates every icon Erwin ships from the masters in brand/.
 *
 *   node scripts/brand-assets.mjs
 *
 *   brand/app-icon.svg → public/icons/*.png       PWA, Apple touch icon
 *                      → src/app/favicon.ico       16–256px, PNG-in-ICO
 *                      → desktop/build/icon.png    1024px; electron-builder makes
 *                                                  the .icns, .ico and Linux sizes
 *                      → desktop/build/appx/*.png  Microsoft Store tiles
 *   brand/favicon.svg  → src/app/icon.svg          theme-aware tab icon
 *
 * The outputs are committed, so a build never needs a browser. Rendering uses
 * Playwright's Chromium, which the e2e suite already installs.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brand = (f) => path.join(root, "brand", f);
const out = (f) => path.join(root, f);

/** The field ground the Store tiles sit on (brand/tokens.css --er-stage, dark). */
const STAGE = "#0e0d08";

const renders = [
  ...[192, 512].map((s) => ({ svg: "app-icon.svg", w: s, h: s, to: `public/icons/icon-${s}.png` })),
  { svg: "app-icon.svg", w: 512, h: 512, to: "public/icons/icon-512-maskable.png" },
  { svg: "app-icon.svg", w: 180, h: 180, to: "public/icons/apple-touch-icon.png" },
  { svg: "app-icon.svg", w: 1024, h: 1024, to: "desktop/build/icon.png" },
  ...Object.entries({
    StoreLogo: [50, 50],
    Square44x44Logo: [44, 44],
    SmallTile: [71, 71],
    Square150x150Logo: [150, 150],
    Wide310x150Logo: [310, 150],
    LargeTile: [310, 310],
  }).map(([name, [w, h]]) => ({ svg: "app-icon.svg", w, h, bg: STAGE, to: `desktop/build/appx/${name}.png` })),
];
const icoSizes = [16, 32, 48, 64, 128, 256];

const browser = await chromium.launch({ channel: "chromium" }).catch(() => chromium.launch());
// Drawn on a canvas and exported from it, rather than screenshotted: canvas
// PNGs are always 8-bit RGBA, which ICO readers (Next's among them) require,
// while a screenshot of an opaque icon comes out RGB.
async function render({ svg, w, h, bg }) {
  const page = await browser.newPage();
  const src = `data:image/svg+xml;base64,${fs.readFileSync(brand(svg)).toString("base64")}`;
  const dataUrl = await page.evaluate(
    async ({ src, w, h, bg }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (bg) {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
      }
      const art = Math.min(w, h);
      ctx.drawImage(img, (w - art) / 2, (h - art) / 2, art, art);
      return canvas.toDataURL("image/png");
    },
    { src, w, h, bg: bg ?? null }
  );
  await page.close();
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

for (const job of renders) {
  fs.mkdirSync(path.dirname(out(job.to)), { recursive: true });
  fs.writeFileSync(out(job.to), await render(job));
  console.log(`  ${job.to}`);
}

// favicon.ico: PNG entries in an ICO container (valid since Windows Vista).
const pngs = [];
for (const s of icoSizes) pngs.push(await render({ svg: "app-icon.svg", w: s, h: s }));
const header = Buffer.alloc(6 + 16 * pngs.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);
let offset = header.length;
pngs.forEach((png, i) => {
  const s = icoSizes[i];
  const at = 6 + 16 * i;
  header.writeUInt8(s >= 256 ? 0 : s, at);
  header.writeUInt8(s >= 256 ? 0 : s, at + 1);
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(png.length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += png.length;
});
fs.writeFileSync(out("src/app/favicon.ico"), Buffer.concat([header, ...pngs]));
console.log("  src/app/favicon.ico");

fs.copyFileSync(brand("favicon.svg"), out("src/app/icon.svg"));
console.log("  src/app/icon.svg");

await browser.close();
