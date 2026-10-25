"use client";

import { FilterStrip, StripCount } from "@/components/courses/sheet";
import { courseTab } from "@/components/courses/course-tab";

import { STAT_ABBREV, STAT_KEYS, STAT_NAMES } from "@/lib/erwin/stats";
import { cn } from "@/lib/utils";

import { useLadderStore } from "@/store/ladder";

import type { LadderPayload } from "@/types/ladder";

import { fmtXp, shortDay } from "./format";

/**
 * Every finished task and felled boss in the hex, newest first, with the XP
 * it paid each stat: the receipts behind the sheet. Follows the selection,
 * so a stat or a goal shows only what fed it.
 */
export function XpLog({ data }: { data: LadderPayload }) {
  const stat = useLadderStore((s) => s.stat);
  const goalId = useLadderStore((s) => s.goalId);
  const selectStat = useLadderStore((s) => s.selectStat);
  const goal = goalId ? data.goals.find((g) => g.id === goalId) : undefined;

  const events = data.events.filter((event) =>
    stat ? (event.stats[stat] ?? 0) > 0 : goal ? event.goalIds.includes(goal.id) : true
  );
  const filter = stat ? STAT_NAMES[stat] : goal?.title;

  return (
    <section aria-label="XP log" className="flex min-h-0 flex-1 flex-col border-t border-border">
      <FilterStrip>
        <span className="er-label pl-2">XP log</span>
        <StripCount>
          {events.length} {filter ? `for ${filter}` : data.hex.state === "current" ? "this hex" : "in this hex"}
        </StripCount>
        {filter ? (
          <button
            type="button"
            onClick={() => selectStat(null)}
            className="er-slash ml-auto px-2 font-mono text-xs uppercase tracking-wide text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            Show all
          </button>
        ) : null}
      </FilterStrip>

      {!filter && data.summary.unlinked > 0 ? (
        <p className="flex-none border-b border-border px-4 py-2 text-[12px] text-warning">
          {data.summary.unlinked} finished task{data.summary.unlinked === 1 ? "" : "s"} serve
          {data.summary.unlinked === 1 ? "s" : ""} no goal, so {data.summary.unlinked === 1 ? "it" : "they"} earned no XP.
          Have a goal claim where {data.summary.unlinked === 1 ? "it comes" : "they come"} from, or link{" "}
          {data.summary.unlinked === 1 ? "it" : "them"} in Tasks.
        </p>
      ) : null}

      <ol className="min-h-0 flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <li className="px-4 py-6 text-[13px] text-muted-foreground">
            {data.hex.state === "future"
              ? `This hex starts ${shortDay(data.hex.first)}.`
              : filter
                ? `Nothing in this hex fed ${filter}.`
                : data.hex.state === "past"
                  ? "Nothing earned XP in this hex."
                  : "Nothing has earned XP in this hex yet."}
          </li>
        ) : (
          events.map((event) => {
            const split = STAT_KEYS.filter((key) => (event.stats[key] ?? 0) > 0);
            return (
              <li
                key={`${event.kind}:${event.id}`}
                className="grid min-h-[30px] grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 px-4 text-[13px]"
              >
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{shortDay(event.day)}</span>
                <span className="flex min-w-0 items-center gap-2">
                  {event.kind === "boss" ? (
                    <span className="er-bracketed flex-none font-mono text-[10px] uppercase tracking-wide text-foreground">
                      Boss
                    </span>
                  ) : null}
                  <span className="truncate text-foreground" title={event.title}>
                    {event.title}
                  </span>
                  {event.courseName ? (
                    <span className="hidden flex-none font-mono text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">
                      {courseTab({ code: null, name: event.courseName })}
                    </span>
                  ) : null}
                  {event.proof ? (
                    <span className="hidden flex-none font-mono text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">
                      {event.proof}
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-none items-center gap-2 font-mono text-[11px] tabular-nums">
                  {split.length ? (
                    split.map((key) => (
                      <span key={key} className={cn(stat && stat !== key && "opacity-50")}>
                        <span className="text-foreground">+{fmtXp(event.stats[key]!)}</span>{" "}
                        <span className="text-muted-foreground">{STAT_ABBREV[key]}</span>
                      </span>
                    ))
                  ) : (
                    <span className="text-muted-foreground">No XP</span>
                  )}
                </span>
              </li>
            );
          })
        )}
      </ol>
    </section>
  );
}
