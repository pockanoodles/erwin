"use client";

import { useRef } from "react";

import { STAT_ABBREV, STAT_NAMES } from "@/lib/sigwald/stats";
import { cn } from "@/lib/utils";

import { useElementWidth } from "@/hooks/use-element-width";

import { useLadderStore } from "@/store/ladder";

import type { LadderBoss, LadderDay, LadderPayload } from "@/types/ladder";

import { countdown, daysBetween, fmtXp, monthOf, shortDay, weekdayOf } from "./format";

/** How much label the day track can carry without letters colliding. */
type TrackDensity = "roomy" | "cozy" | "tight" | "dense";

function trackDensity(trackWidth: number, dayCount: number): TrackDensity {
  if (trackWidth <= 0 || dayCount <= 0) return "roomy";
  const dayPx = trackWidth / dayCount;
  if (dayPx < 10) return "dense";
  if (dayPx < 16) return "tight";
  if (dayPx < 22) return "cozy";
  return "roomy";
}

/**
 * The hex across the top of Stats: which two months these are and what they
 * push, the days as a field watch's railroad track with the work done on each
 * and the bosses beneath, and the four numbers that say how it's going.
 * Rust marks today and nothing else, because rust means "now".
 *
 * Density follows the track's measured width so labels fade out before they
 * collide, instead of snapping or overlapping during a window resize.
 */
export function HexBand({ data }: { data: LadderPayload }) {
  const { hex } = data;
  return (
    <section
      aria-label={hex.label}
      className="er-layout-soft grid flex-none gap-x-8 gap-y-5 border-b border-border px-4 py-5 md:gap-x-10 md:px-8 md:py-6 lg:grid-cols-[minmax(10rem,13rem)_minmax(0,1fr)] xl:grid-cols-[minmax(10rem,13rem)_minmax(0,1fr)_minmax(12rem,15rem)]"
    >
      <Identity data={data} />
      <HexTrack data={data} />
      <Readouts data={data} />
    </section>
  );
}

function Identity({ data }: { data: LadderPayload }) {
  const { hex } = data;
  const setBuildOpen = useLadderStore((s) => s.setBuildOpen);
  const editable = hex.state === "current" && hex.cycleId !== null;
  return (
    <div className="min-w-0">
      <p className="er-label">
        Hex {hex.index} of 6 · {hex.year}
      </p>
      <h1 className="er-display mt-1.5 truncate text-[clamp(1.125rem,2.4vw,1.75rem)] tracking-[0.04em] text-foreground">
        {hex.months}
      </h1>
      <p className="mt-1 truncate text-[13px] text-muted-foreground" title={hex.theme || undefined}>
        {hex.theme || "No theme"}
      </p>

      <div className="mt-4">
        <p className="er-label">
          {hex.inheritedFrom
            ? `Build · from ${hex.inheritedFrom}`
            : hex.buildProjected
              ? "Build · from your vault"
              : "Build"}
        </p>
        {hex.build.length > 0 ? (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {hex.build.map((key) => (
              <li
                key={key}
                title={STAT_NAMES[key]}
                className={cn(
                  "er-plate er-plate-sm flex h-6 items-center px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em]",
                  hex.inheritedFrom ? "text-foreground [--plate:var(--er-surface)]" : "text-background [--plate:var(--er-ink)]"
                )}
              >
                {STAT_ABBREV[key]}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            None set
            {editable ? (
              <button
                type="button"
                onClick={() => setBuildOpen(true)}
                className="er-slash ml-2 font-mono text-xs uppercase tracking-wide text-muted-foreground transition-colors duration-150 hover:text-foreground"
              >
                Choose
              </button>
            ) : null}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The year under the hex: six segments, the one on show framed, each with the
 * XP it earned. The day track above is this segment opened up, and a segment
 * is also a way to jump to that hex.
 */
function YearRail({ data, density }: { data: LadderPayload; density: TrackDensity }) {
  const showHex = useLadderStore((s) => s.showHex);
  const most = Math.max(1, ...data.year.map((h) => h.xp));
  const showMonths = density === "roomy" || density === "cozy";
  return (
    <div className="mt-4">
      <p className="er-label">{data.hex.year} · XP by hex</p>
      <ol className="mt-1.5 grid grid-cols-6 gap-1">
        {data.year.map((h) => {
          const shown = h.index === data.hex.index;
          const isCurrent = data.current.year === data.hex.year && data.current.index === h.index;
          return (
            <li key={h.index} className="min-w-0">
              <button
                type="button"
                onClick={() => showHex(isCurrent ? null : { year: data.hex.year, index: h.index })}
                aria-current={shown || undefined}
                title={`Hex ${h.index} · ${h.months} ${data.hex.year} · ${h.done} done · ${fmtXp(h.xp)} XP`}
                className={cn(
                  "relative flex h-7 w-full items-center justify-between gap-1 overflow-hidden px-1.5 transition-colors duration-150 sm:px-2",
                  shown ? "er-brackets bg-selected [--bracket:var(--er-ink)]" : "bg-surface hover:bg-hover"
                )}
              >
                <span
                  className={cn(
                    "min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.1em] transition-opacity duration-ui ease-field",
                    shown ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {showMonths ? h.months : h.index}
                </span>
                <span className="flex flex-none items-center gap-1 font-mono text-[11px] tabular-nums text-foreground sm:gap-1.5">
                  <span
                    className={cn(
                      "transition-opacity duration-ui ease-field",
                      density === "dense" ? "opacity-0" : "opacity-100"
                    )}
                  >
                    {h.state === "future" ? "" : h.xp > 0 ? fmtXp(h.xp) : <span className="text-muted-foreground">—</span>}
                  </span>
                  {isCurrent ? <span aria-label="now" className="h-1 w-1 flex-none rounded-full bg-rust" /> : null}
                </span>
                {h.xp > 0 ? (
                  <span
                    aria-hidden
                    className="absolute bottom-0 left-0 h-[2px] bg-foreground/70 transition-[width] duration-ui ease-field"
                    style={{ width: `${(h.xp / most) * 100}%` }}
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function HexTrack({ data }: { data: LadderPayload }) {
  const { hex, days, today } = data;
  const trackRef = useRef<HTMLDivElement>(null);
  const trackWidth = useElementWidth(trackRef);
  const density = trackDensity(trackWidth, days.length);
  const columns = { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` };
  const most = Math.max(3, ...days.map((d) => d.done));
  const bossesOn = new Map<string, LadderBoss[]>();
  for (const boss of data.bosses) bossesOn.set(boss.day, [...(bossesOn.get(boss.day) ?? []), boss]);

  const heading =
    hex.state === "current"
      ? `Day ${hex.elapsed} of ${hex.days}`
      : hex.state === "past"
        ? `${hex.days} days · ended ${shortDay(hex.last)}`
        : `${hex.days} days · starts ${shortDay(hex.first)}`;

  const showMonths = density === "roomy" || density === "cozy";
  const showLegend = density === "roomy";

  return (
    <div ref={trackRef} className="min-w-0">
      <div className="flex items-baseline justify-between gap-4">
        <p className="er-label truncate">{heading}</p>
        <p
          className={cn(
            "er-label flex-none overflow-hidden transition-[opacity,max-width] duration-ui ease-field",
            showLegend
              ? "max-w-[20rem] opacity-100"
              : "pointer-events-none max-w-0 opacity-0"
          )}
          aria-hidden={!showLegend}
        >
          Tasks done each day · <span className="text-foreground">◆</span> boss
        </p>
      </div>

      {/* Month names sit over the first day of each month; they fade before
          they would collide with a neighbour when the track is tight. */}
      <div
        className={cn(
          "mt-3 grid overflow-hidden transition-opacity duration-ui ease-field",
          showMonths ? "opacity-100" : "opacity-0"
        )}
        style={columns}
        aria-hidden={!showMonths}
      >
        {days.map((d, i) =>
          i === 0 || d.day.endsWith("-01") ? (
            <span
              key={d.day}
              className="truncate font-mono text-[10px] uppercase leading-none tracking-[0.12em] text-muted-foreground"
              style={{ gridColumn: `${i + 1} / span ${Math.min(4, days.length - i)}` }}
            >
              {monthOf(d.day)}
            </span>
          ) : null
        )}
      </div>

      <ol className="mt-1.5 grid" style={columns} aria-label="Days of the hex">
        {days.map((d) => (
          <TrackDay
            key={d.day}
            day={d}
            today={today}
            most={most}
            bosses={bossesOn.get(d.day) ?? []}
            density={density}
          />
        ))}
      </ol>

      <YearRail data={data} density={density} />
    </div>
  );
}

function TrackDay({
  day,
  today,
  most,
  bosses,
  density,
}: {
  day: LadderDay;
  today: string;
  most: number;
  bosses: LadderBoss[];
  density: TrackDensity;
}) {
  const setGoalDialog = useLadderStore((s) => s.setGoalDialog);
  const isToday = day.day === today;
  const gone = day.day < today;
  const monthStart = day.day.endsWith("-01");
  const monday = weekdayOf(day.day) === 1;
  // A Monday's number beside "Today" would print over it.
  const wantNumber =
    density !== "dense" &&
    density !== "tight" &&
    !isToday &&
    monday &&
    Math.abs(daysBetween(today, day.day)) > 2;
  const dayNumber = wantNumber ? Number(day.day.slice(8, 10)) : null;
  const facts = [shortDay(day.day), `${day.done} done`, day.xp > 0 ? `${fmtXp(day.xp)} XP` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="relative flex min-w-0 flex-col items-center" title={facts}>
      {/* Work done that day. */}
      <span className="flex h-10 w-full items-end justify-center">
        {day.done > 0 ? (
          <span
            className={cn(
              "w-[3px] transition-[height,background-color] duration-ui ease-field sm:w-1",
              isToday ? "bg-rust" : "bg-foreground/80"
            )}
            style={{ height: `${Math.max(14, (day.done / most) * 100)}%` }}
          />
        ) : null}
      </span>

      {/* The railroad: a tick a day, longer on Mondays and month starts, on one hairline. */}
      <span className="flex h-3 w-full items-end justify-center border-b border-line-strong">
        <span
          className={cn(
            "transition-[height,background-color] duration-ui ease-field",
            isToday ? "h-3 w-[2px] bg-rust" : "w-px",
            !isToday && (monthStart ? "h-3" : monday ? "h-2" : "h-1"),
            !isToday && (gone ? "bg-ink-faint" : "bg-line-strong")
          )}
        />
      </span>
      {isToday ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[52px] w-[2px] bg-rust/70 transition-opacity duration-ui ease-field"
        />
      ) : null}

      <span
        className={cn(
          "relative mt-1 flex h-2.5 w-full justify-center whitespace-nowrap font-mono text-[9px] uppercase leading-none tracking-[0.08em]",
          "transition-opacity duration-ui ease-field",
          isToday ? "font-semibold text-rust-text" : "overflow-hidden text-muted-foreground"
        )}
      >
        {isToday ? (
          <span
            className={cn(
              "absolute left-1/2 -translate-x-1/2 transition-opacity duration-ui ease-field",
              // "Today" is wider than a cozy day column; keep it only when the
              // track is roomy enough to print the whole word.
              density === "roomy" ? "opacity-100" : "opacity-0"
            )}
          >
            Today
          </span>
        ) : (
          <span
            className={cn(
              "transition-opacity duration-ui ease-field",
              dayNumber !== null ? "opacity-100" : "opacity-0"
            )}
          >
            {dayNumber ?? ""}
          </span>
        )}
      </span>

      {/* Bosses dated that day. */}
      <span className="mt-1 flex min-h-[11px] flex-col items-center gap-[3px]">
        {bosses.slice(0, 3).map((boss) => (
          <BossMark
            key={boss.id}
            boss={boss}
            gone={boss.day < today}
            onOpen={boss.managed ? undefined : () => setGoalDialog({ mode: "edit", goalId: boss.id })}
          />
        ))}
      </span>
    </li>
  );
}

/** What a boss's mark says: beaten and how, or what its proof says now. */
function bossState(boss: LadderBoss, gone: boolean) {
  if (boss.felled) return `felled · ${boss.proof.label}`;
  if (boss.proof.state === "missed") return "missed";
  return gone ? `date passed · ${boss.proof.label}` : boss.proof.label;
}

/** Who settles a boss, in a few words. */
function settledBy(boss: LadderBoss) {
  return boss.proof.source === "canvas" ? "Canvas checks it" : boss.proof.source === "task" ? "Its task checks it" : "You mark it";
}

function BossMark({ boss, gone, onOpen }: { boss: LadderBoss; gone: boolean; onOpen?: () => void }) {
  const label = [boss.title, shortDay(boss.day), boss.goalTitle, bossState(boss, gone)].filter(Boolean).join(" · ");
  const mark = (
    <span
      className={cn(
        "block h-[7px] w-[7px] rotate-45",
        boss.felled
          ? "bg-foreground"
          : gone
            ? "border border-ink-faint"
            : "border-[1.5px] border-foreground bg-background"
      )}
    />
  );
  return onOpen ? (
    <button type="button" onClick={onOpen} aria-label={`Edit boss: ${label}`} title={label} className="p-0.5">
      {mark}
    </button>
  ) : (
    <span role="img" aria-label={`Boss: ${label}`} title={label} className="p-0.5">
      {mark}
    </span>
  );
}

function Readouts({ data }: { data: LadderPayload }) {
  const { hex, summary, today } = data;
  const first =
    hex.state === "current"
      ? { label: "Days left", value: String(hex.days - hex.elapsed) }
      : hex.state === "past"
        ? { label: "Days", value: String(hex.days) }
        : { label: "Days to start", value: String(daysBetween(today, hex.first)) };
  const readouts: { label: string; value: string; unit?: string }[] = [
    first,
    { label: "Tasks done", value: String(summary.done) },
    { label: "XP earned", value: fmtXp(summary.gained) },
    {
      label: "On the Build",
      value: summary.buildShare === null ? "—" : String(Math.round(summary.buildShare * 100)),
      unit: summary.buildShare === null ? undefined : "%",
    },
  ];

  return (
    <div className="min-w-0 lg:col-span-2 xl:col-span-1">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 xl:grid-cols-2">
        {readouts.map((r) => (
          <div key={r.label} className="min-w-0">
            <dt className="er-label truncate">{r.label}</dt>
            <dd className="er-display mt-1.5 truncate text-[clamp(1.125rem,2vw,1.375rem)] tabular-nums text-foreground">
              {r.value}
              {/* Michroma's % is a stylised glyph that reads as "o/o"; the mono one reads as percent. */}
              {r.unit ? <span className="ml-0.5 font-mono text-[15px]">{r.unit}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      <NextBoss data={data} />
    </div>
  );
}

function NextBoss({ data }: { data: LadderPayload }) {
  const { hex, today } = data;
  if (hex.state === "past") {
    const felled = data.bosses.filter((b) => b.felled).length;
    return (
      <div className="mt-4 border-t border-border pt-3">
        <p className="er-label">Bosses</p>
        <p className="mt-1 text-[13px] text-foreground">
          {data.bosses.length === 0 ? "None were dated in this hex" : `${data.bosses.length} dated here · ${felled} felled`}
        </p>
      </div>
    );
  }
  const boss = data.nextBoss;
  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="er-label">Next boss</p>
      {boss ? (
        <>
          <p className="mt-1 line-clamp-2 text-[13px] font-medium leading-snug text-foreground" title={boss.title}>
            {boss.title}
          </p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
            {shortDay(boss.day, today)} · {countdown(today, boss.day)}
            {boss.goalTitle ? ` · ${boss.goalTitle}` : ""}
          </p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" title={boss.proof.label}>
            {settledBy(boss)}
          </p>
        </>
      ) : (
        <p className="mt-1 text-[13px] text-muted-foreground">None ahead</p>
      )}
    </div>
  );
}
