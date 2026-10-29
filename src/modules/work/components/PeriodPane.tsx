"use client";

import { useEffect, useState } from "react";

import { toast } from "sonner";

import { Tag } from "@/components/sheet/sheet";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";

import {
  LINK,
  dayText,
  hoursText,
  linkHref,
  linkName,
  linksInOrder,
  momentDayText,
  moneyText,
  rangeText,
  spanText,
  useTimeFormat,
} from "@/modules/work/components/parts";
import { useWorkStore } from "@/modules/work/store";
import type { JobRow, PeriodRow, ShiftRow } from "@/modules/work/types";

/** Its hours are due and not on the timesheet yet: the thing to do now. */
export const periodDue = (p: PeriodRow) => !p.current && p.unlogged > 0;

/**
 * One pay period whole, for entering it on the timesheet: the shifts with
 * their hours, the total, the pay it comes to, the job's timesheet link
 * first, and marking it submitted. Hours and Focus both draw it.
 */
export function PeriodCard({
  job,
  period,
  shifts,
  busy,
  emphasis,
  onMark,
  className,
}: {
  job: JobRow;
  period: PeriodRow;
  /** Null while they load. */
  shifts: ShiftRow[] | null;
  busy: boolean;
  /** `loud` where marking it is the page's main action; Focus has its own Done. */
  emphasis: "loud" | "quiet";
  onMark: (submitted: boolean) => void;
  className?: string;
}) {
  const format = useTimeFormat();
  const listed = (shifts ?? []).filter((s) => !s.dropped);
  const toCome = Math.max(0, period.scheduledHours - period.hours);
  const links = linksInOrder(job.links);
  const overdue =
    period.unlogged > 0 && new Date(period.dueBy).getTime() < Date.now();

  return (
    <div className={cn("space-y-4", className)}>
      <p className="text-[14px] text-muted-foreground">
        {rangeText(period.first, period.last)} ·{" "}
        <span className={cn(overdue && "font-medium text-destructive")}>
          due {momentDayText(period.dueBy)}
        </span>
      </p>

      {shifts === null ? (
        <p className="text-[14px] text-muted-foreground">Loading…</p>
      ) : listed.length === 0 ? (
        <p className="text-[14px] text-muted-foreground">
          No shifts in this period.
        </p>
      ) : (
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="er-label text-left">
              <th className="pb-1.5 font-normal">Day</th>
              <th className="pb-1.5 font-normal">Time</th>
              <th className="pb-1.5 text-right font-normal">Hours</th>
              <th className="w-24 pb-1.5 font-normal" />
            </tr>
          </thead>
          <tbody>
            {listed.map((s) => (
              <tr
                key={s.id}
                className={cn(
                  "border-t border-border",
                  s.worked ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <td className="py-2">{dayText(s.day)}</td>
                <td className="py-2 tabular-nums">{spanText(s, format)}</td>
                <td className="py-2 text-right tabular-nums">
                  {hoursText(s.hours)}
                </td>
                <td className="py-2 pl-3 text-right">
                  {s.loggedAt ? (
                    <Tag tone="ok">Entered</Tag>
                  ) : !s.worked ? (
                    <Tag>To come</Tag>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-strong">
              <td className="py-2 font-medium text-foreground" colSpan={2}>
                Worked
              </td>
              <td className="py-2 text-right font-medium tabular-nums text-foreground">
                {hoursText(period.hours)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}

      <div className="space-y-1 text-[14px]">
        <p className="text-foreground">
          {period.earnings !== null ? (
            <>
              About {moneyText(period.earnings, job.currency)}{" "}
              <span className="text-muted-foreground">
                before tax, at {moneyText(job.hourlyRate ?? 0, job.currency)} an
                hour
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">
              No hourly rate, so no pay to show.
            </span>
          )}
        </p>
        {toCome > 0 ? (
          <p className="text-muted-foreground">
            {hoursText(toCome)} more still to come in this period.
          </p>
        ) : null}
      </div>

      {links.length > 0 ? (
        <ul className="space-y-1 text-[14px]">
          {links.map((l, i) => {
            const href = linkHref(l.url);
            return (
              <li key={`${i}:${l.url}`}>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={LINK}
                  >
                    {linkName(l)}
                  </a>
                ) : (
                  <span className="text-muted-foreground">{l.url}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          No timesheet link yet. Add one to the job in Work → Jobs.
        </p>
      )}

      <MarkSubmitted
        period={period}
        busy={busy}
        emphasis={emphasis}
        onMark={onMark}
      />
    </div>
  );
}

function MarkSubmitted({
  period,
  busy,
  emphasis,
  onMark,
}: {
  period: PeriodRow;
  busy: boolean;
  emphasis: "loud" | "quiet";
  onMark: (submitted: boolean) => void;
}) {
  if (period.shifts === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Nothing worked in this period yet, so nothing to submit.
      </p>
    );
  }
  if (!period.tracked) {
    return (
      <p className="text-[13px] text-muted-foreground">
        From before Sigwald counted this job&apos;s timesheets, so there&apos;s
        nothing to submit here.
      </p>
    );
  }
  if (period.submitted) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Tag tone="ok">Submitted</Tag>
        <Button variant="quiet" disabled={busy} onClick={() => onMark(false)}>
          Reopen
        </Button>
      </div>
    );
  }
  const partly = period.unlogged < period.shifts;
  return (
    <div className="space-y-1.5">
      <Button
        variant={emphasis === "loud" ? "default" : "secondary"}
        disabled={busy}
        onClick={() => onMark(true)}
      >
        Mark submitted
      </Button>
      {partly ? (
        <p className="text-[13px] text-muted-foreground">
          {period.unlogged === 1
            ? "1 shift isn't on the timesheet yet."
            : `${period.unlogged} shifts aren't on the timesheet yet.`}
        </p>
      ) : null}
    </div>
  );
}

/** Hours' reading pane: the selected pay period, with its shifts. */
export function PeriodPane({
  job,
  period,
}: {
  job: JobRow;
  period: PeriodRow;
}) {
  const loadedAt = useWorkStore((s) => s.loadedAt);
  const periodShifts = useWorkStore((s) => s.periodShifts);
  const submitPeriod = useWorkStore((s) => s.submitPeriod);
  const reopenPeriod = useWorkStore((s) => s.reopenPeriod);
  const [shifts, setShifts] = useState<ShiftRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Again after every reload: a write can change what's on the timesheet.
  useEffect(() => {
    let live = true;
    void periodShifts(job.id, period.first, period.last).then((list) => {
      if (!live) return;
      setShifts(list ?? []);
      setFailed(list === null);
    });
    return () => {
      live = false;
    };
  }, [periodShifts, job.id, period.first, period.last, loadedAt]);

  const mark = async (submitted: boolean) => {
    setBusy(true);
    const done = submitted
      ? await submitPeriod(job.id, period.first)
      : await reopenPeriod(job.id, period.first);
    setBusy(false);
    if (!done) toast.error("Couldn't change that. Try again.");
  };

  return (
    <div className="space-y-3 p-5">
      <h2 className="er-display text-lg text-foreground">{job.name}</h2>
      {failed ? (
        <p className="text-sm text-destructive">
          The shifts couldn&apos;t load. Try again in a moment.
        </p>
      ) : null}
      <PeriodCard
        job={job}
        period={period}
        shifts={shifts}
        busy={busy}
        emphasis={periodDue(period) ? "loud" : "quiet"}
        onMark={(submitted) => void mark(submitted)}
      />
    </div>
  );
}
