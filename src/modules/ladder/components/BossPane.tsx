"use client";

import { format, newDate } from "@/lib/date-utils";

import type { Boss } from "@/store/lord";

import { countdown } from "./boss-cells";

/**
 * The packet pane for a boss row. A bound boss shows its assignment's packet
 * under this strip; an unbound one has no packet, so the pane says what it is
 * and where it's written down.
 */

export function BossStrip({ boss }: { boss: Boss }) {
  return (
    <div className="border-b border-border px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
      ⚔ Boss · <span className="text-foreground">{boss.title}</span>
      {boss.felled ? " · Felled" : null}
    </div>
  );
}

export function BossPane({ boss, lordTitle }: { boss: Boss; lordTitle: string | null }) {
  const facts = [
    boss.targetDate ? format(newDate(boss.targetDate), "EEE MMM d") : "No date",
    boss.targetDate ? countdown(boss.targetDate) : null,
    boss.felled ? "Felled" : null,
  ].filter(Boolean);
  return (
    <div className="px-4 py-3">
      {lordTitle ? (
        <div className="mb-1 truncate text-[12px] font-medium tracking-tight text-muted-foreground">
          {lordTitle}
        </div>
      ) : null}
      <h2 className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-foreground">
        ⚔ {boss.title}
      </h2>
      <p className="mt-1 text-[13px] tabular-nums text-muted-foreground">{facts.join(" · ")}</p>
      <p className="mt-4 max-w-[48ch] text-[13px] leading-relaxed text-muted-foreground">
        No Canvas assignment behind this one, so there&apos;s no packet — an in-class
        test or a date the vault declares. It lives in your vault&apos;s goal overview;
        give its heading a <code className="font-mono text-[12px] text-foreground">canvas:</code>{" "}
        line once the assignment exists and it becomes that row.
      </p>
    </div>
  );
}
