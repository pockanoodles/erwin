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
  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-background px-4 pb-10 pt-12 md:px-8">
      <div className="mx-auto w-full max-w-lg flex-1 space-y-6">
        <header className="space-y-2">
          <p className="text-sm text-muted-foreground">{data.date}</p>
          <div className="space-y-1 text-base">
            <p>
              <span className="font-medium text-foreground">{data.tasksDueToday}</span>{" "}
              tasks due today
            </p>
            <p>
              <span className="font-medium text-foreground">{data.tasksDueThisWeek}</span>{" "}
              due this week
            </p>
            <p>
              <span className="font-medium text-foreground">{data.totalPendingTasks}</span>{" "}
              pending total
            </p>
            {data.dangerZoneTasks.length > 0 ? (
              <p className="flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {data.dangerZoneTasks.length} in the danger zone
              </p>
            ) : null}
          </div>
        </header>

        {data.dangerZoneTasks.map((dt) => {
          const proj = data.dangerProjections.find((p) => p.taskId === dt.id);
          return (
            <div
              key={dt.id}
              className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
                <AlertTriangle className="h-4 w-4" />
                DANGER
              </div>
              <p className="mt-2 font-medium leading-snug text-foreground">
                {dt.courseName ? `${dt.courseName} · ` : ""}
                {dt.title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {dt.countdownHuman} · {dt.gradeImpactPercent}% of final grade
              </p>
              {proj ? (
                <p className="mt-2 font-semibold text-red-600 dark:text-red-400">
                  Missing this: {proj.currentCourseGrade}% ({proj.letterGradeCurrent}) →{" "}
                  {proj.gradeIfMissed}% ({proj.letterGradeIfMissed})
                </p>
              ) : null}
            </div>
          );
        })}

        <section className="space-y-1 text-sm text-muted-foreground">
          {data.freeHoursToday != null ? (
            <p>Free time today: ~{data.freeHoursToday} hours</p>
          ) : null}
          {data.nextEvent ? (
            <p>
              Next event: {data.nextEvent.title} {data.nextEvent.startsIn}
            </p>
          ) : null}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium text-foreground">
            Today&apos;s order
          </h3>
          <ol className="space-y-2 text-sm">
            {data.topTasks.map((t, i) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="w-full rounded-md border border-border px-3 py-2 text-left hover:bg-muted/60"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      sessionStorage.setItem("erwin-focus-boost", t.id);
                    }
                  }}
                >
                  <span className="text-muted-foreground">{i + 1}. </span>
                  <span className="font-medium">{t.title}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    (~{t.estimatedDuration}m
                    {t.gradeImpactPercent != null
                      ? `, ${t.gradeImpactPercent}%`
                      : ""}
                    {t.courseName == null && t.category === "PERSONAL"
                      ? ", personal"
                      : ""}
                    )
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <section className="text-sm text-muted-foreground">
          <p>Completed today: {data.tasksCompletedToday} tasks</p>
          <p>
            This week: {data.tasksCompletedThisWeek} tasks (avg {data.avgTasksPerDay}
            /day)
          </p>
        </section>
      </div>

      <div className="mx-auto mt-8 w-full max-w-lg shrink-0 px-1">
        <Button
          type="button"
          className="h-12 w-full bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          onClick={() => void onContinue()}
        >
          Let&apos;s go
        </Button>
      </div>
    </div>
  );
}
