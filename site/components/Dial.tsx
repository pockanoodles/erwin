"use client";

// The hero's visual: a field-watch dial, drawn from the brand tokens.
//
// It reads the way a Khaki Field reads. Twelve-hour numerals ride outside the
// 13-to-24 track, a railroad minute track rings the edge with the lume index
// at twelve, and the hands show the visitor's own time with the seconds hand
// in rust, because rust is the colour that means "now". Inside the 24-hour
// numerals sits an example day: the half of it the hands are in (morning
// before noon, afternoon after), so the blocks line up with the inner numerals
// exactly the way a 24-hour track does on the real watch.
//
// Canvas rather than SVG, redrawn once a second at most, paused in a hidden
// tab, and frozen at the moment of load under prefers-reduced-motion.
import { useEffect, useRef } from "react";

export interface DayBlock {
  /** Minutes after midnight. */
  start: number;
  end: number;
  label: string;
}

const TAU = Math.PI * 2;

export function Dial({ blocks, label }: { blocks: DayBlock[]; label: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const box = wrap.current;
    if (!el || !box) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let size = 0;
    let frozen: Date | null = reduce ? new Date() : null;

    const draw = () => {
      const now = frozen ?? new Date();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const target = Math.round(box.clientWidth);
      if (target !== size) {
        size = target;
        el.width = size * dpr;
        el.height = size * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      if (size < 40) return;

      const c = size / 2;
      const R = size / 2 - 2;
      const u = R / 280; // every measure below is in a 280-unit dial
      const ink = css("--er-ink");
      const faint = css("--er-faint");
      const line = css("--er-line-strong");
      const lume = css("--er-lume");
      const rust = css("--er-accent");
      const face = css("--er-surface");
      const olive = css("--er-olive");
      const display = css("--font-display") || "sans-serif";
      const mono = css("--font-mono") || "monospace";
      const at = (a: number, r: number) => [c + Math.cos(a) * r, c + Math.sin(a) * r] as const;
      const clock = (frac: number) => frac * TAU - Math.PI / 2;

      // Face and bezel.
      ctx.fillStyle = face;
      ctx.beginPath();
      ctx.arc(c, c, R, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Railroad minute track, with a heavier tick every five minutes.
      ctx.beginPath();
      ctx.arc(c, c, R - 12 * u, 0, TAU);
      ctx.moveTo(c + R - 28 * u, c);
      ctx.arc(c, c, R - 28 * u, 0, TAU);
      ctx.stroke();
      for (let m = 0; m < 60; m++) {
        const a = clock(m / 60);
        const five = m % 5 === 0;
        if (m === 0) continue;
        ctx.strokeStyle = five ? ink : faint;
        ctx.lineWidth = (five ? 2.4 : 1) * u;
        const [x1, y1] = at(a, R - 12 * u);
        const [x2, y2] = at(a, R - 28 * u);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      // The lume index at twelve.
      ctx.fillStyle = lume;
      ctx.beginPath();
      ctx.moveTo(c, c - R + 38 * u);
      ctx.lineTo(c - 9 * u, c - R + 14 * u);
      ctx.lineTo(c + 9 * u, c - R + 14 * u);
      ctx.closePath();
      ctx.fill();

      // Hour numerals, then the 13-24 track inside them.
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let h = 1; h <= 12; h++) {
        const a = clock(h / 12);
        if (h !== 12) {
          ctx.fillStyle = ink;
          ctx.font = `${Math.round(25 * u)}px ${display}`;
          const [x, y] = at(a, R - 58 * u);
          ctx.fillText(String(h), x, y);
        }
        ctx.fillStyle = faint;
        ctx.font = `${Math.round(12.5 * u)}px ${mono}`;
        const [x, y] = at(a, R - 92 * u);
        ctx.fillText(String(h === 12 ? 24 : h + 12), x, y);
      }
      ctx.fillStyle = ink;
      ctx.font = `${Math.round(25 * u)}px ${display}`;
      ctx.fillText("12", c, c - R + 60 * u);

      // The example day, on the half of the dial the hands are in.
      const pm = now.getHours() >= 12;
      const half = pm ? 720 : 0;
      const minuteOfDay = now.getHours() * 60 + now.getMinutes();
      const band = R - 112 * u;
      ctx.lineCap = "butt";
      ctx.lineWidth = 7 * u;
      ctx.strokeStyle = line;
      ctx.beginPath();
      ctx.arc(c, c, band, 0, TAU);
      ctx.globalAlpha = 0.35;
      ctx.stroke();
      ctx.globalAlpha = 1;
      for (const b of blocks) {
        const s = Math.max(b.start, half);
        const e = Math.min(b.end, half + 720);
        if (e <= s) continue;
        const live = minuteOfDay >= b.start && minuteOfDay < b.end;
        ctx.strokeStyle = live ? rust : olive === "" ? line : lume;
        ctx.globalAlpha = live ? 1 : 0.55;
        ctx.beginPath();
        ctx.arc(c, c, band, clock((s - half) / 720), clock((e - half) / 720));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Hands: hour and minute in ink with a lume stripe, seconds in rust.
      const sec = now.getSeconds();
      const min = now.getMinutes() + sec / 60;
      const hr = (now.getHours() % 12) + min / 60;
      const hand = (frac: number, len: number, width: number, color: string, tail: number) => {
        const a = clock(frac);
        const [x1, y1] = at(a + Math.PI, tail);
        const [x2, y2] = at(a, len);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      };
      hand(hr / 12, 128 * u, 11 * u, ink, 20 * u);
      hand(hr / 12, 110 * u, 4 * u, lume, 0);
      hand(min / 60, 196 * u, 8 * u, ink, 24 * u);
      hand(min / 60, 176 * u, 3 * u, lume, 0);
      hand(sec / 60, 226 * u, 2.2 * u, rust, 48 * u);
      ctx.fillStyle = rust;
      ctx.beginPath();
      ctx.arc(c, c, 8 * u, 0, TAU);
      ctx.fill();
      ctx.fillStyle = face;
      ctx.beginPath();
      ctx.arc(c, c, 3 * u, 0, TAU);
      ctx.fill();
    };

    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      if (frozen || document.visibilityState !== "visible") return;
      // Tick on the second, the way the watch does.
      timer = window.setTimeout(() => {
        draw();
        schedule();
      }, 1000 - (Date.now() % 1000) + 5);
    };

    const resize = new ResizeObserver(() => draw());
    resize.observe(box);
    const onVisible = () => {
      draw();
      schedule();
    };
    document.addEventListener("visibilitychange", onVisible);
    void document.fonts.ready.then(() => {
      draw();
      schedule();
    });
    draw();

    return () => {
      window.clearTimeout(timer);
      resize.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
      frozen = null;
    };
  }, [blocks]);

  return (
    <div ref={wrap} className="dial">
      <canvas ref={canvas} role="img" aria-label={label} />
    </div>
  );
}
