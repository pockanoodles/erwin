"use client";

import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/card";

import { humanCountdown } from "@/lib/erwin/human-countdown";
import type { FocusQueueTask } from "@/lib/erwin/parse-task";
import { cn } from "@/lib/utils";
import { format, isToday } from "@/lib/date-utils";

interface FocusTaskCardProps {
  task: FocusQueueTask;
}

function tierAccentClass(tier: string | undefined, danger: boolean): string {
  if (danger || tier === "DANGER") {
    return "border-l-4 border-red-600 bg-red-50 dark:bg-red-950/30";
  }
  if (tier === "HIGH") {
    return "border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/25";
  }
  return "";
}

function tierBadge(task: FocusQueueTask): { label: string; className: string } | null {
  const tier = task.erwin?.urgencyTier;
  const danger = Boolean(task.erwin?.danger);
  if (danger || tier === "DANGER") {
    return { label: "DANGER", className: "text-red-700 dark:text-red-400 font-semibold" };
  }
  if (tier === "HIGH" && task.dueDate && isToday(task.dueDate)) {
    return {
      label: "DUE TODAY",
      className: "text-amber-700 dark:text-amber-400 font-semibold",
    };
  }
  return null;
}

/**
 * Single-task hero card (docs/focus-mode.md §2.2–§2.3).
 */
export function FocusTaskCard({ task }: FocusTaskCardProps) {
  const tier = task.erwin?.urgencyTier;
  const danger = Boolean(task.erwin?.danger);
  const canvas = task.source === "CANVAS";
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!danger || !task.dueDate) {
      return;
    }
    const id = window.setInterval(() => setTick((x) => x + 1), 60_000);
    return () => window.clearInterval(id);
  }, [danger, task.dueDate]);

  const countdown = useMemo(() => {
    if (!task.dueDate) {
      return null;
    }
    const due = task.dueDate instanceof Date ? task.dueDate : new Date(task.dueDate);
    if (danger) {
      return humanCountdown(due);
    }
    return task.erwin?.countdownHuman ?? humanCountdown(due);
  }, [task.dueDate, task.erwin?.countdownHuman, danger, tick]);

  const badge = tierBadge(task);
  const accent = tierAccentClass(tier, danger);

  const gi = task.erwin?.gradeImpactPercent;
  const showGradeImpact =
    canvas &&
    gi != null &&
    (danger ||
      tier === "HIGH" ||
      tier === "NORMAL" ||
      (tier === "LOW" && gi > 0));

  const proj = task.erwin?.gradeProjection;

  return (
    <Card className={cn("relative overflow-hidden p-6 md:p-8", accent)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          {badge ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={badge.className}>{badge.label}</span>
              {countdown ? (
                <span
                  className={cn(
                    danger ? "text-red-700 dark:text-red-300" : "text-muted-foreground",
                    danger && "font-semibold"
                  )}
                >
                  {countdown}
                </span>
              ) : null}
            </div>
          ) : countdown ? (
            <p className="text-sm text-muted-foreground">{countdown}</p>
          ) : null}
          <h2 className="text-2xl font-bold tracking-tight">{task.title}</h2>
          {task.courseName ? (
            <p className="text-sm text-muted-foreground">{task.courseName}</p>
          ) : task.category ? (
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {task.category}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <p className="text-muted-foreground">
          {task.erwin?.effortEstimate ?? "~30 min"}
          {showGradeImpact ? (
            <span className="text-foreground">
              {" "}
              · {gi}% of your grade
            </span>
          ) : null}
        </p>

        {danger && canvas && proj ? (
          <p className="font-semibold text-red-600 dark:text-red-400">
            Missing this: {proj.letterCurrent} → {proj.letterIfMissed}
          </p>
        ) : null}

        {(danger || (tier === "HIGH" && (task.skipCount ?? 0) > 0)) &&
        (task.skipCount ?? 0) > 0 &&
        task.lastSkippedAt ? (
          <p className="text-muted-foreground">
            Skipped {task.erwin?.lastSkippedAgo ?? "recently"}
          </p>
        ) : null}
        {(tier === "NORMAL" || tier === "LOW") &&
        (task.skipCount ?? 0) >= 3 ? (
          <p className="text-muted-foreground">
            Skipped {task.skipCount}× — consider scheduling time
          </p>
        ) : null}

        {task.dueDate && !danger && tier !== "HIGH" && (
          <p className="text-xs text-muted-foreground">
            Due {format(task.dueDate instanceof Date ? task.dueDate : new Date(task.dueDate), "PPP")}
          </p>
        )}
      </div>
    </Card>
  );
}
