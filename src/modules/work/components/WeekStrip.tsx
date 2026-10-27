"use client";

import { cn } from "@/lib/utils";

import { JobDot, hoursText, rangeText } from "@/modules/work/components/parts";
import { formatHours } from "@/modules/work/hours";
import type { JobRow } from "@/modules/work/types";

/** The strip's columns from md up: one per job, up to four. */
const MD_COLUMNS = [
  "",
  "md:grid-cols-1",
  "md:grid-cols-2",
  "md:grid-cols-3",
  "md:grid-cols-4",
];

/** This week's hours against each job's cap: what's on, what's left. */
export function WeekStrip({
  jobs,
  onSetCap,
}: {
  jobs: JobRow[];
  onSetCap: (jobId: string) => void;
}) {
  if (jobs.length === 0) return null;
  const columns = Math.min(jobs.length, 4);
  // Empty cells finish a short last row, so the ruled gaps don't show through.
  const pad = jobs.length > 4 ? (4 - (jobs.length % 4)) % 4 : 0;
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-px border-b border-border bg-border",
        MD_COLUMNS[columns]
      )}
    >
      {jobs.map((j) => (
        <WeekMeter key={j.id} job={j} onSetCap={() => onSetCap(j.id)} />
      ))}
      {Array.from({ length: pad }, (_, i) => (
        <div key={i} aria-hidden className="hidden bg-background md:block" />
      ))}
    </div>
  );
}

function WeekMeter({ job, onSetCap }: { job: JobRow; onSetCap: () => void }) {
  const { hours, workedHours, first, last } = job.week;
  const cap = job.weeklyCapHours;
  const left = cap !== null ? Math.round((cap - hours) * 100) / 100 : null;
  // At the cap is already worth a look: one more shift goes over.
  const atCap = left !== null && left <= 0;
  const share = cap ? Math.min(1, hours / cap) : 0;
  const toCome = Math.max(0, hours - workedHours);
  return (
    <div
      className="min-w-0 space-y-1.5 bg-background px-3 py-2.5"
      title={`This week, ${rangeText(first, last)}: ${hoursText(workedHours)} worked, ${hoursText(toCome)} to come`}
    >
      <p className="er-label flex items-center gap-1.5">
        <JobDot color={job.color} />
        <span className="truncate">{job.name}</span>
      </p>
      <p className="text-[13px] tabular-nums text-foreground">
        {formatHours(hours)}
        <span className="text-muted-foreground">
          {cap !== null ? ` / ${formatHours(cap)} h` : " h"} this week
        </span>
      </p>
      <div className="h-1 bg-line" aria-hidden>
        {cap ? (
          <div
            className={cn("h-full", atCap ? "bg-warning" : "bg-foreground")}
            style={{ width: `${share * 100}%` }}
          />
        ) : null}
      </div>
      {left !== null ? (
        <p
          className={cn(
            "font-mono text-[11px] uppercase tracking-wide",
            atCap ? "text-warning" : "text-muted-foreground"
          )}
        >
          {left > 0
            ? `${formatHours(left)} h under the cap`
            : left === 0
              ? "At the cap"
              : `${formatHours(-left)} h over the cap`}
        </p>
      ) : (
        <button
          type="button"
          onClick={onSetCap}
          className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          Set a cap
        </button>
      )}
    </div>
  );
}
