"use client";

import { STAT_ABBREV, STAT_MEANINGS, STAT_NAMES } from "@/lib/erwin/stats";
import { cn } from "@/lib/utils";

import { useLadderStore } from "@/store/ladder";

import type { LadderPayload, LadderStat } from "@/types/ladder";

import { fmtXp, shortDay } from "./format";

/**
 * The eight stats, read the way the game's status screen reads them: the
 * level, how far into it you are, and what this hex added. Selecting one
 * lights the goals that feed it.
 */
export function StatSheet({ data }: { data: LadderPayload }) {
  const stat = useLadderStore((s) => s.stat);
  const goalId = useLadderStore((s) => s.goalId);
  const selectStat = useLadderStore((s) => s.selectStat);
  const goal = goalId ? (data.goals.find((g) => g.id === goalId) ?? null) : null;
  const { summary, hex } = data;

  return (
    <section aria-label="Stats" className="flex min-h-0 flex-col">
      <div className="flex min-h-[45px] flex-none flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-1.5 md:px-6">
        <span className="er-label">Stats</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          <span className="text-foreground">LV {summary.level}</span> · {fmtXp(summary.xp)} XP in all
          {hex.state === "past" ? ` as of ${shortDay(hex.last)}` : ""}
        </span>
        {goal ? (
          <span className="ml-auto truncate font-mono text-xs text-muted-foreground">
            {goal.stats.length ? `${goal.title} develops these` : `${goal.title} develops no stat`}
          </span>
        ) : null}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {data.stats.map((s) => (
          <StatRow
            key={s.key}
            stat={s}
            selected={stat === s.key}
            lit={goal ? goal.stats.includes(s.key) : null}
            hexState={hex.state}
            onSelect={() => selectStat(stat === s.key ? null : s.key)}
          />
        ))}
        <li className="px-4 py-4 text-[12px] leading-relaxed text-muted-foreground md:px-6">
          A finished task is 1 XP, split across the stats its goal develops, and a felled boss is 5.
          Each level costs one more XP than the last, so level 5 takes 15 in all and level 10 takes 55.
        </li>
      </ul>
    </section>
  );
}

function StatRow({
  stat,
  selected,
  lit,
  hexState,
  onSelect,
}: {
  stat: LadderStat;
  selected: boolean;
  /** With a goal selected: whether it develops this stat. */
  lit: boolean | null;
  hexState: LadderPayload["hex"]["state"];
  onSelect: () => void;
}) {
  const feeders = stat.feeders.length;
  // Status as a stencilled word: only a Build stat that isn't moving gets one.
  const flag =
    stat.flag === "starved"
      ? "No goal feeds it"
      : stat.flag === "idle"
        ? hexState === "current"
          ? "No XP yet this hex"
          : "No XP this hex"
        : null;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          "grid w-full grid-cols-[2.75rem_minmax(0,1fr)_3.25rem_4rem] items-center gap-x-3 border-b border-border px-4 py-2.5 text-left transition-[background-color,opacity] duration-150 sm:grid-cols-[3rem_minmax(0,1fr)_3.25rem_minmax(6rem,9.5rem)_4.25rem] sm:gap-x-4 md:px-6",
          selected || lit ? "er-brackets bg-selected [--bracket:var(--er-ink)]" : "hover:bg-hover",
          lit === false && "opacity-45"
        )}
      >
        <span className="er-display text-[13px] tracking-[0.08em] text-foreground">{STAT_ABBREV[stat.key]}</span>

        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex-none text-[14px] font-medium text-foreground">{STAT_NAMES[stat.key]}</span>
            {stat.build ? (
              <span className="er-plate er-plate-sm flex-none px-1.5 py-px font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-background [--plate:var(--er-ink)]">
                Build
              </span>
            ) : null}
            {flag ? (
              <span className="er-bracketed hidden flex-none font-mono text-[10px] uppercase tracking-wide text-warning sm:inline">
                {flag}
              </span>
            ) : null}
          </span>
          {/* On a phone the flag takes the second line, where it has room. */}
          {flag ? (
            <span className="block truncate font-mono text-[10px] uppercase tracking-wide text-warning sm:hidden">{flag}</span>
          ) : null}
          <span className={cn("truncate text-[12px] text-muted-foreground", flag ? "hidden sm:block" : "block")}>
            {STAT_MEANINGS[stat.key]}
            <span className="font-mono text-[11px]">
              {" · "}
              {feeders === 0 ? "no goal" : `${feeders} goal${feeders === 1 ? "" : "s"}`}
            </span>
          </span>
        </span>

        <span className="text-right">
          <span className="block font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Lv</span>
          <span className="er-display block text-[24px] tabular-nums leading-none text-foreground">{stat.level}</span>
        </span>

        <span className="hidden min-w-0 sm:block">
          <Pips into={stat.into} span={stat.span} />
          <span className="mt-1.5 block truncate font-mono text-[10px] tabular-nums text-muted-foreground">
            {fmtXp(stat.toNext)} to LV {stat.level + 1}
          </span>
        </span>

        <span className="text-right">
          <span className={cn("block font-mono text-[15px] tabular-nums", stat.gained > 0 ? "text-foreground" : "text-muted-foreground")}>
            +{fmtXp(stat.gained)}
          </span>
          <span className="block font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">This hex</span>
        </span>
      </button>
    </li>
  );
}

/** Progress through a level as pips, one per XP it costs, so the curve shows:
 *  each level is one pip longer than the last. Past 24 the pips become a bar. */
function Pips({ into, span }: { into: number; span: number }) {
  const label = `${fmtXp(into)} of ${fmtXp(span)} XP into this level`;
  if (span > 24) {
    return (
      <span role="img" aria-label={label} className="relative block h-2 bg-line">
        <span className="absolute inset-y-0 left-0 bg-foreground" style={{ width: `${(into / span) * 100}%` }} />
      </span>
    );
  }
  return (
    <span role="img" aria-label={label} className="flex h-2 gap-[2px]">
      {Array.from({ length: span }, (_, i) => {
        const fill = Math.min(1, Math.max(0, into - i));
        return (
          <span key={i} className="relative flex-1 bg-line">
            {fill > 0 ? <span className="absolute inset-y-0 left-0 bg-foreground" style={{ width: `${fill * 100}%` }} /> : null}
          </span>
        );
      })}
    </span>
  );
}
