"use client";

import { useEffect, useMemo } from "react";

import { useSearchParams } from "next/navigation";

import {
  HEAD,
  ROW,
  SheetLayout,
  cellClass,
  gutterClass,
  sheetKeyHandler,
  titleCellClass,
  useScrollActiveIntoView,
} from "@/components/sheet/sheet";
import { Button } from "@/components/ui/button";

import { daysBetween, localDay } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import { cadenceLabel, lastLabel, nextLabel } from "@/modules/training/cadence";
import {
  PaneSection,
  RoutinePane,
  SessionEditor,
  SessionLine,
} from "@/modules/training/components/RoutinePane";
import { sessionSummary } from "@/modules/training/sets";
import {
  type TrainingView,
  routinesInView,
  useTrainingStore,
} from "@/modules/training/store";
import type { RoutineRow, WorkoutRow } from "@/modules/training/types";

const ROUTINE_COLUMNS = [
  { label: "#", width: 44 },
  { label: "Routine", width: 180 },
  { label: "Every", width: 120 },
  { label: "Last done", width: 116 },
  { label: "Next", width: 128 },
  { label: "Exercises", width: undefined },
] as const;

const HISTORY_COLUMNS = [
  { label: "#", width: 44 },
  { label: "Day", width: 128 },
  { label: "Routine", width: 160 },
  { label: "What you did", width: undefined },
] as const;

/**
 * The Training page: the routines as a datasheet, soonest session first,
 * or every session newest first (History), with the selection whole in the
 * reading pane — the grammar every sheet shares (components/sheet), j/k and
 * arrows included. `?routine=<id>` opens one (Focus links here).
 */
export function TrainingPage() {
  const view = useTrainingStore((s) => s.view);
  const setView = useTrainingStore((s) => s.setView);
  const routines = useTrainingStore((s) => s.routines);
  const archived = useTrainingStore((s) => s.archived);
  const workouts = useTrainingStore((s) => s.workouts);
  const status = useTrainingStore((s) => s.status);
  const selected = useTrainingStore((s) => s.selected);
  const select = useTrainingStore((s) => s.select);
  const load = useTrainingStore((s) => s.load);
  const asked = useSearchParams().get("routine");

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!asked) return;
    setView("routines");
    select(asked);
  }, [asked, setView, select]);

  // "Today" moves with the data, so labels refresh whenever anything reloads.
  const today = useMemo(() => localDay(new Date()), [routines, workouts]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(
    () => routinesInView(view, routines, archived),
    [view, routines, archived]
  );
  const ids =
    view === "history" ? workouts.map((w) => w.id) : rows.map((r) => r.id);
  const activeIndex = ids.findIndex((id) => id === selected);

  useScrollActiveIntoView([selected]);
  const onKeyDown = sheetKeyHandler({
    count: ids.length,
    active: activeIndex,
    isSelectable: () => true,
    select: (i) => select(ids[i]),
  });

  const routine: RoutineRow | undefined =
    view !== "history" && selected && selected !== "new"
      ? [...routines, ...archived].find((r) => r.id === selected)
      : undefined;
  const workout: WorkoutRow | undefined =
    view === "history" ? workouts.find((w) => w.id === selected) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SheetLayout
        label="Training"
        onKeyDown={(e) => void onKeyDown(e)}
        sheet={
          <>
            {view === "history" ? (
              <HistorySheet
                workouts={workouts}
                selected={selected}
                onSelect={select}
              />
            ) : (
              <RoutineSheet
                rows={rows}
                today={today}
                selected={selected}
                onSelect={select}
              />
            )}
            {status === "ready" && ids.length === 0 ? (
              <EmptyState view={view} onAdd={() => select("new")} />
            ) : null}
            {status === "error" ? (
              <p className="p-6 text-sm text-destructive">
                Training couldn&apos;t load. Try again in a moment.
              </p>
            ) : null}
          </>
        }
        pane={
          <div className="min-h-0 flex-1 overflow-y-auto">
            {view !== "history" && selected === "new" ? (
              <RoutinePane key="new" routine={null} />
            ) : routine ? (
              <RoutinePane key={routine.id} routine={routine} />
            ) : workout ? (
              <div className="space-y-6 p-5">
                <div className="space-y-1">
                  <h2 className="er-display text-lg text-foreground">
                    {workout.routineName}
                  </h2>
                  <SessionLine workout={workout} />
                </div>
                <PaneSection label="Change it">
                  <SessionEditor key={workout.id} workout={workout} />
                </PaneSection>
              </div>
            ) : (
              <p className="p-5 text-sm text-muted-foreground">
                {view === "history"
                  ? "Select a session to see it here."
                  : "Select a routine to see it here."}
              </p>
            )}
          </div>
        }
      />
    </div>
  );
}

function SheetHead({
  columns,
}: {
  columns: ReadonlyArray<{ label: string; width: number | undefined }>;
}) {
  return (
    <>
      <colgroup>
        {columns.map((c) => (
          <col key={c.label} style={c.width ? { width: c.width } : undefined} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th
              key={c.label}
              scope="col"
              className={cn(ROW, HEAD, i === 0 && "text-right")}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
    </>
  );
}

const TABLE =
  "min-w-full table-fixed border-separate border-spacing-0 text-[13px]";

function RoutineSheet({
  rows,
  today,
  selected,
  onSelect,
}: {
  rows: RoutineRow[];
  today: string;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <table className={TABLE}>
      <SheetHead columns={ROUTINE_COLUMNS} />
      <tbody>
        {rows.map((r, i) => {
          const active = r.id === selected;
          const cell = cellClass(active);
          const late = r.nextDue != null && daysBetween(today, r.nextDue) < 0;
          return (
            <tr
              key={r.id}
              onClick={() => onSelect(r.id)}
              aria-selected={active}
              data-active-row={active || undefined}
              className="group cursor-default"
            >
              <td className={gutterClass(active)}>{i + 1}</td>
              <td
                className={cn(
                  cell,
                  titleCellClass(active),
                  "font-medium text-foreground"
                )}
              >
                {r.name}
              </td>
              <td className={cn(cell, "text-muted-foreground")}>
                {r.cadenceDays ? cadenceLabel(r.cadenceDays) : ""}
              </td>
              <td className={cn(cell, "tabular-nums text-muted-foreground")}>
                {lastLabel(r.lastDoneAt, today)}
              </td>
              <td
                className={cn(
                  cell,
                  "tabular-nums",
                  late
                    ? "font-medium text-destructive"
                    : "text-muted-foreground"
                )}
              >
                {nextLabel(r.nextDue, today)}
              </td>
              <td className={cn(cell, "text-muted-foreground")}>
                {r.plan.map((p) => p.name).join(", ")}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function HistorySheet({
  workouts,
  selected,
  onSelect,
}: {
  workouts: WorkoutRow[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <table className={TABLE}>
      <SheetHead columns={HISTORY_COLUMNS} />
      <tbody>
        {workouts.map((w, i) => {
          const active = w.id === selected;
          const cell = cellClass(active);
          return (
            <tr
              key={w.id}
              onClick={() => onSelect(w.id)}
              aria-selected={active}
              data-active-row={active || undefined}
              className="group cursor-default"
            >
              <td className={gutterClass(active)}>{i + 1}</td>
              <td
                className={cn(
                  cell,
                  titleCellClass(active),
                  "tabular-nums text-foreground"
                )}
              >
                {new Date(w.at).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </td>
              <td className={cn(cell, "font-medium text-foreground")}>
                {w.routineName}
              </td>
              <td className={cn(cell, "text-muted-foreground")}>
                {w.entries.length > 0
                  ? sessionSummary(w.entries, w.unit)
                  : w.ticked
                    ? "Ticked off, nothing entered yet"
                    : (w.note ?? "Done")}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function EmptyState({
  view,
  onAdd,
}: {
  view: TrainingView;
  onAdd: () => void;
}) {
  if (view === "history") {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        No sessions yet. Log one from a routine.
      </p>
    );
  }
  if (view === "archived") {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        No routine is archived.
      </p>
    );
  }
  return (
    <div className="max-w-xl space-y-5 p-6 md:p-10">
      <p className="er-label">No routines yet</p>
      <p className="text-lg leading-relaxed text-foreground">
        Add the workouts you repeat. Give one a schedule and Sigwald puts it in
        Today when it&apos;s due, with what you lifted last time.
      </p>
      <Button onClick={onAdd}>Add routine</Button>
    </div>
  );
}
