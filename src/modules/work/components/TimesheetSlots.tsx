"use client";

import { useState } from "react";

import Link from "next/link";

import { toast } from "sonner";

import type { FocusQueueTask } from "@/lib/erwin/parse-task";

import { PeriodCard } from "@/modules/work/components/PeriodPane";
import { LINK } from "@/modules/work/components/parts";
import { periodKey } from "@/modules/work/store";
import type { PeriodRow, TimesheetDetail } from "@/modules/work/types";

import { invalidateResources, useResource } from "@/hooks/use-resource";

import { useErwinStatusStore } from "@/store/erwinStatus";

/**
 * Work's task slots (src/modules/client.tsx): a "Submit hours" task in Focus
 * and in the task sheet shows the period's shifts and hours, the pay they
 * come to and the timesheet link, so the hours can be entered from here.
 */
function useTimesheet(taskId: string) {
  return useResource<TimesheetDetail>(`/api/erwin/work/tasks/${taskId}`);
}

/** Marking it is quiet here: Focus and the sheet have their own Done. */
function TimesheetCard({ detail }: { detail: TimesheetDetail }) {
  const { job, shifts } = detail;
  // What marking it sends back, until the task is read again.
  const [period, setPeriod] = useState<PeriodRow>(detail.period);
  const [busy, setBusy] = useState(false);

  const mark = async (submitted: boolean) => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/erwin/work/jobs/${job.id}/periods/${period.first}`,
        { method: submitted ? "POST" : "DELETE" }
      );
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const body = (await res.json()) as { period: PeriodRow };
      setPeriod(body.period);
      invalidateResources("/api/erwin/work/");
      // Submitting finishes the task; reopening brings it back.
      void useErwinStatusStore.getState().load({ force: true });
    } catch {
      toast.error("Couldn't change that. Try again.");
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <PeriodCard
        job={job}
        period={period}
        shifts={shifts}
        busy={busy}
        emphasis="quiet"
        onMark={(submitted) => void mark(submitted)}
      />
      <div className="space-y-1">
        <Link
          href={`/work?period=${periodKey(period)}`}
          className={`inline-block text-[14px] ${LINK}`}
        >
          See the period in Work
        </Link>
        <p className="text-[13px] text-muted-foreground">
          Ticking the task off marks the hours submitted too.
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
      {error ? "The timesheet couldn't load." : loading ? "Loading…" : null}
    </p>
  );
}

/** Focus's work column: what to put on the timesheet. */
export function TimesheetTaskBody({ task }: { task: FocusQueueTask }) {
  const { data, loading, error } = useTimesheet(task.id);
  return (
    <div className="mt-4 max-w-[62ch]">
      {data ? (
        <TimesheetCard key={task.id} detail={data} />
      ) : (
        <Status loading={loading} error={error} />
      )}
    </div>
  );
}

/** The task sheet's reading pane: the same, in one column. */
export function TimesheetTaskPane({ taskId }: { taskId: string }) {
  const { data, loading, error } = useTimesheet(taskId);
  return (
    <div className="p-4">
      {data ? (
        <>
          <h2 className="er-display mb-3 text-lg text-foreground">
            {data.job.name}
          </h2>
          <TimesheetCard key={taskId} detail={data} />
        </>
      ) : (
        <Status loading={loading} error={error} />
      )}
    </div>
  );
}
