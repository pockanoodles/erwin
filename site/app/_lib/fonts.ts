import { Chivo, Chivo_Mono, Michroma, Murecho } from "next/font/google";

// The brand's voices (brand/BRAND.md § Type), self-hosted by next/font at
// build time, so the page makes no font request to anyone. Murecho carries
// Japanese on /erwin/ja, and backs Michroma there, which has no kana.
export const display = Michroma({ weight: "400", subsets: ["latin"], variable: "--font-display" });
export const sans = Chivo({ subsets: ["latin"], variable: "--font-sans" });
export const mono = Chivo_Mono({ subsets: ["latin"], variable: "--font-mono" });
export const ja = Murecho({ weight: ["400", "500", "700"], subsets: ["latin"], variable: "--font-ja", preload: false });

export const fontVars = `${display.variable} ${sans.variable} ${mono.variable} ${ja.variable}`;
