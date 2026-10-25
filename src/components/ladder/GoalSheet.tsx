"use client";

import {
  FilterStrip,
  HEAD,
  ROW,
  StripCount,
  Tag,
  cellClass,
  gutterClass,
  sheetKeyHandler,
  titleCellClass,
  useScrollActiveIntoView,
} from "@/components/courses/sheet";

import { STAT_ABBREV } from "@/lib/erwin/stats";
import { cn } from "@/lib/utils";

import { useLadderStore } from "@/store/ladder";

import type { LadderPayload } from "@/types/ladder";

import { countdown, daysBetween, fmtXp, shortDay } from "./format";

/**
 * Where the XP came from: every goal on show, what it develops, what it
 * earned this hex and what's still open on it. A selected stat dims the goals
 * that don't feed it, which is how a flat stat explains itself.
 */
export function GoalSheet({ data }: { data: LadderPayload }) {
  const stat = useLadderStore((s) => s.stat);
  const goalId = useLadderStore((s) => s.goalId);
  const selectGoal = useLadderStore((s) => s.selectGoal);
  const setGoalDialog = useLadderStore((s) => s.setGoalDialog);
  const feeders = stat ? new Set(data.stats.find((s) => s.key === stat)?.feeders ?? []) : null;
  const selected = goalId ? data.goals.find((g) => g.id === goalId) : undefined;
  const earning = data.goals.filter((g) => g.xp > 0).length;
  const canAdd = data.hex.state !== "past";
  const activeIndex = selected ? data.goals.indexOf(selected) : -1;
  useScrollActiveIntoView([activeIndex]);

  // j/k and the arrows walk the rows, Enter opens a goal made here: the same keys as every sheet.
  const onKeyDown = sheetKeyHandler({
    count: data.goals.length,
    active: activeIndex,
    isSelectable: () => true,
    select: (i) => selectGoal(data.goals[i].id),
    open: () => selected && !selected.managed && setGoalDialog({ mode: "edit", goalId: selected.id }),
  });

  return (
    <section aria-label="Goals" className="flex min-h-0 flex-col">
      <FilterStrip>
        <span className="er-label pl-2">Goals</span>
        <StripCount>
          {data.goals.length} · {earning} earned XP {data.hex.state === "current" ? "this hex" : "here"}
        </StripCount>
        {data.managedExternally ? <Tag>Synced from your vault</Tag> : null}
        <span className="ml-auto flex items-center">
          <button
            type="button"
            disabled={!selected || selected.managed}
            title={
              !selected
                ? "Select a goal to edit it"
                : selected.managed
                  ? "This goal comes from your vault, so edit it there"
                  : "Edit the selected goal"
            }
            onClick={() => selected && setGoalDialog({ mode: "edit", goalId: selected.id })}
            className="er-slash px-2 font-mono text-xs uppercase tracking-wide text-muted-foreground transition-colors duration-150 hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={!canAdd}
            title={canAdd ? "Add a goal of your own" : "Goals are added to the running hex"}
            onClick={() => setGoalDialog({ mode: "add" })}
            className="er-slash px-2 font-mono text-xs uppercase tracking-wide text-muted-foreground transition-colors duration-150 hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground"
          >
            Add goal
          </button>
        </span>
      </FilterStrip>

      <div
        tabIndex={0}
        aria-label="Goals sheet"
        onKeyDown={(e) => void onKeyDown(e)}
        className="min-h-0 flex-1 overflow-auto outline-none"
      >
        {data.goals.length === 0 ? (
          <p className="max-w-md px-4 py-6 text-[13px] leading-relaxed text-muted-foreground">
            {data.hex.state === "past"
              ? "No goal earned XP in this hex."
              : "No goals yet. A goal names the stats its work develops, and every task you link to it from Tasks earns XP for them."}
          </p>
        ) : (
          <table className="w-full min-w-[540px] table-fixed select-none border-separate border-spacing-0 text-[13px]">
            <colgroup>
              <col style={{ width: 36 }} />
              <col />
              <col style={{ width: 96 }} />
              <col style={{ width: 52 }} />
              <col style={{ width: 48 }} />
              <col style={{ width: 48 }} />
              <col style={{ width: 132 }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={cn(ROW, HEAD, "left-0 z-30 text-right")}>#</th>
                <th scope="col" className={cn(ROW, HEAD)}>Goal</th>
                <th scope="col" className={cn(ROW, HEAD)}>Develops</th>
                <th scope="col" className={cn(ROW, HEAD, "text-right")} title="XP it earned in this hex">XP</th>
                <th scope="col" className={cn(ROW, HEAD, "text-right")} title="Tasks finished in this hex">Done</th>
                <th scope="col" className={cn(ROW, HEAD, "text-right")} title="Tasks open now">Open</th>
                <th scope="col" className={cn(ROW, HEAD, "border-r-0")}>Next boss</th>
              </tr>
            </thead>
            <tbody>
              {data.goals.map((goal, i) => {
                const active = goal.id === goalId;
                const cell = cellClass(active);
                const dim = feeders !== null && !feeders.has(goal.id);
                const title = [
                  goal.title,
                  goal.parents.length ? `serves ${goal.parents.map((p) => p.title).join(", ")}` : null,
                  goal.managed ? "from your vault" : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <tr
                    key={goal.id}
                    data-active-row={active || undefined}
                    // A double-click's second click opens it rather than letting go of it.
                    onClick={(e) => e.detail < 2 && selectGoal(active ? null : goal.id)}
                    onDoubleClick={() => !goal.managed && setGoalDialog({ mode: "edit", goalId: goal.id })}
                    className={cn("group cursor-cell transition-opacity duration-150", dim && "opacity-40")}
                  >
                    <td className={gutterClass(active)}>{i + 1}</td>
                    <td className={cn(cell, titleCellClass(active), "text-foreground")} title={title}>
                      {goal.parents.length ? <span className="text-muted-foreground">↳ </span> : null}
                      {goal.title}
                    </td>
                    <td className={cn(cell, "font-mono text-[11px] uppercase")}>
                      {goal.stats.length ? (
                        goal.stats.map((key, k) => (
                          <span key={key} className={cn(stat === key ? "text-foreground" : "text-muted-foreground")}>
                            {k ? " " : ""}
                            {STAT_ABBREV[key]}
                          </span>
                        ))
                      ) : (
                        <span className="text-warning" title="It earns no XP until it names a stat">
                          None
                        </span>
                      )}
                    </td>
                    <td className={cn(cell, "text-right tabular-nums", goal.xp > 0 ? "text-foreground" : "text-muted-foreground")}>
                      {goal.xp > 0 ? `+${fmtXp(goal.xp)}` : "—"}
                    </td>
                    <td className={cn(cell, "text-right tabular-nums text-muted-foreground")}>{goal.done || "—"}</td>
                    <td className={cn(cell, "text-right tabular-nums text-muted-foreground")}>{goal.open || "—"}</td>
                    <td
                      className={cn(cell, "border-r-0 text-muted-foreground")}
                      title={
                        goal.nextBoss
                          ? `${goal.nextBoss.title} · ${shortDay(goal.nextBoss.day, data.today)} · ${countdown(data.today, goal.nextBoss.day)}`
                          : undefined
                      }
                    >
                      {goal.nextBoss ? (
                        <>
                          <span className="font-mono text-[11px] tabular-nums text-foreground">
                            {shortDay(goal.nextBoss.day, data.today)}
                          </span>
                          {/* A countdown helps for the next two months; past that the date says more. */}
                          {daysBetween(data.today, goal.nextBoss.day) <= 60 ? (
                            <span className="text-[12px]"> {countdown(data.today, goal.nextBoss.day)}</span>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
