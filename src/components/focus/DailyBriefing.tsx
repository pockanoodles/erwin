"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { BriefingData } from "@/types/focus-briefing";

interface DailyBriefingProps {
  data: BriefingData;
  onContinue: () => void | Promise<void>;
}

/**
 * Full-screen first-open-of-day briefing (docs/focus-mode.md §1.4).
 */
export function DailyBriefing({
  data,
  onContinue,
}: DailyBriefingProps) {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const readouts = [
    { value: data.tasksDueToday, label: "Due today" },
    { value: data.tasksDueThisWeek, label: "Due this week" },
    { value: data.totalPendingTasks, label: "Open" },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-background px-4 pb-10 pt-12 md:px-8">
      <div className="mx-auto w-full max-w-xl flex-1 space-y-8">
        {/* The morning readout: three numbers in Michroma, the way a dial
            shows only what it has to. */}
        <header className="space-y-5">
          <p className="er-label">{data.date}</p>
          <dl className="grid grid-cols-3 border-y border-border">
            {readouts.map((r) => (
              <div key={r.label} className="border-r border-border py-4 pl-4 last:border-r-0 first:pl-0">
                <dd className="er-display text-[34px] leading-none tabular">{r.value}</dd>
                <dt className="er-label mt-2">{r.label}</dt>
              </div>
            ))}
          </dl>
          {data.dangerZoneTasks.length > 0 ? (
            <p className="er-bracketed font-mono text-xs font-semibold uppercase tracking-[0.1em] text-destructive">
              {plural(data.dangerZoneTasks.length, "task in danger", "tasks in danger")}
            </p>
          ) : null}
        </header>

        {data.dangerZoneTasks.map((dt) => {
          const proj = data.dangerProjections.find((p) => p.taskId === dt.id);
          return (
            <div key={dt.id} className="border border-destructive/40 bg-destructive/10 p-4">
              <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.1em] text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="er-bracketed">Danger</span>
              </div>
              <p className="mt-2 font-medium leading-snug text-foreground">
                {dt.courseName ? `${dt.courseName} · ` : ""}
                {dt.title}
              </p>
              <p className="mt-1 font-mono text-xs uppercase tracking-[0.04em] text-muted-foreground">
                {dt.countdownHuman} · {dt.gradeImpactPercent}% of final grade
              </p>
              {proj ? (
                <p className="mt-2 font-semibold text-destructive">
                  Missing this: {proj.currentCourseGrade}% ({proj.letterGradeCurrent}) →{" "}
                  {proj.gradeIfMissed}% ({proj.letterGradeIfMissed})
                </p>
              ) : null}
            </div>
          );
        })}

        {data.freeHoursToday != null || data.nextEvent ? (
          <section className="space-y-1 font-mono text-xs uppercase tracking-[0.04em] text-muted-foreground">
            {data.freeHoursToday != null ? <p>Free time today · about {data.freeHoursToday} h</p> : null}
            {data.nextEvent ? (
              <p>
                Next event · {data.nextEvent.title} {data.nextEvent.startsIn}
              </p>
            ) : null}
          </section>
        ) : null}

        <section>
          <h3 className="er-label mb-2">Today&apos;s order</h3>
          <ol className="border-t border-border">
            {data.topTasks.map((t, i) => (
              <li key={t.id} className="border-b border-border">
                <button
                  type="button"
                  className="grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-baseline gap-3 py-2.5 text-left text-sm transition-colors hover:bg-hover"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      sessionStorage.setItem("erwin-focus-boost", t.id);
                    }
                  }}
                >
                  <span className={i === 0 ? "font-mono text-xs text-rust-text" : "font-mono text-xs text-muted-foreground"}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="truncate font-medium">{t.title}</span>
                  <span className="font-mono text-xs uppercase text-muted-foreground tabular">
                    {t.estimatedDuration}m
                    {t.gradeImpactPercent != null ? ` · ${t.gradeImpactPercent}%` : ""}
                    {t.courseName == null && t.category === "PERSONAL" ? " · personal" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <section className="font-mono text-xs uppercase tracking-[0.04em] text-muted-foreground">
          <p>Done today · {plural(data.tasksCompletedToday, "task", "tasks")}</p>
          <p>
            This week · {plural(data.tasksCompletedThisWeek, "task", "tasks")}, about {data.avgTasksPerDay} a day
          </p>
        </section>
      </div>

      <div className="mx-auto mt-8 w-full max-w-xl shrink-0 px-1">
        <Button type="button" size="lg" className="w-full" onClick={() => void onContinue()}>
          Let&apos;s go
        </Button>
      </div>
    </div>
  );
}
