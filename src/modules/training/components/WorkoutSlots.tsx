"use client";

import Link from "next/link";

import { localDay } from "@/lib/date-utils";
import type { FocusQueueTask } from "@/lib/erwin/parse-task";
import { cn } from "@/lib/utils";

import { cadenceLabel, lastLabel } from "@/modules/training/cadence";
import { entryText, prefillEntries } from "@/modules/training/sets";
import type { RoutineRow, WorkoutRow } from "@/modules/training/types";

import { useResource } from "@/hooks/use-resource";

/** GET /api/erwin/training/tasks/:id */
interface TaskRoutine {
  routine: RoutineRow;
  workouts: WorkoutRow[];
}

/**
 * Training's task slots (src/modules/client.tsx): a workout task in Focus
 * and in the task sheet shows what to do, with last time's numbers, and
 * where to log it.
 */
function useTaskRoutine(taskId: string) {
  return useResource<TaskRoutine>(`/api/erwin/training/tasks/${taskId}`);
}

function RoutineCard({
  routine,
  workouts,
  className,
}: TaskRoutine & { className?: string }) {
  const last = workouts.find((w) => !w.ticked && w.entries.length > 0);
  const unit = last?.unit ?? "kg";
  const lines = prefillEntries(routine.plan, workouts, unit);
  const today = localDay(new Date());
  return (
    <div className={cn("space-y-4", className)}>
      <p className="text-[14px] text-muted-foreground">
        {[
          routine.cadenceDays ? cadenceLabel(routine.cadenceDays) : null,
          `last done ${lastLabel(routine.lastDoneAt, today)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {lines.length > 0 ? (
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="er-label text-left">
              <th className="pb-1.5 font-normal">Exercise</th>
              <th className="pb-1.5 text-right font-normal">
                {last ? "Last time" : "Planned"}
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((e, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-2 text-foreground">{e.exercise}</td>
                <td className="py-2 text-right tabular-nums text-foreground">
                  {entryText(e, unit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {routine.notes ? (
        <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">
          {routine.notes}
        </p>
      ) : null}
      <div className="space-y-1">
        <Link
          href={`/training?routine=${routine.id}`}
          className="inline-block text-[14px] text-foreground underline decoration-border underline-offset-4 hover:text-rust-text"
        >
          Log the session in Training
        </Link>
        <p className="text-[13px] text-muted-foreground">
          Ticking it off here counts the session too; its weights can be filled
          in on Training after.
        </p>
      </div>
    </div>
  );
}

function Status({
  loading,
  error,
}: {
  loading: boolean;
  error: string | null;
}) {
  return (
    <p className="text-[14px] text-muted-foreground">
      {error ? "The routine couldn't load." : loading ? "Loading…" : null}
    </p>
  );
}

/** Focus's work column: what to do this session. */
export function WorkoutTaskBody({ task }: { task: FocusQueueTask }) {
  const { data, loading, error } = useTaskRoutine(task.id);
  return (
    <div className="mt-4 max-w-[62ch]">
      {data ? (
        <RoutineCard {...data} />
      ) : (
        <Status loading={loading} error={error} />
      )}
    </div>
  );
}

/** The task sheet's reading pane: the same, in one column. */
export function WorkoutTaskPane({ taskId }: { taskId: string }) {
  const { data, loading, error } = useTaskRoutine(taskId);
  return (
    <div className="p-4">
      {data ? (
        <>
          <h2 className="er-display mb-3 text-lg text-foreground">
            {data.routine.name}
          </h2>
          <RoutineCard {...data} />
        </>
      ) : (
        <Status loading={loading} error={error} />
      )}
    </div>
  );
}
