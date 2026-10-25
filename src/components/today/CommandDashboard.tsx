"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { FirstRun } from "@/components/today/FirstRun";
import { Button } from "@/components/ui/button";

import { isToday } from "@/lib/date-utils";
import { primaryLadderGoal, type FocusQueueTask } from "@/lib/erwin/parse-task";
import { cn } from "@/lib/utils";

import { CLIENT_MODULES } from "@/modules/client";

import { useErwinStatusStore } from "@/store/erwinStatus";
import { useModuleOn, useOnModules } from "@/store/modules";

// Tier idiom, mirrored from FocusDesk so the whole app reads danger/urgency
// the same way: DANGER = red, HIGH-and-due-today = amber, else quiet.
function tierRowAccent(task: FocusQueueTask): string {
  const tier = task.erwin?.urgencyTier;
  if (task.erwin?.danger || tier === "DANGER") {
    return "border-l-2 border-l-destructive bg-destructive/10";
  }
  if (tier === "HIGH") {
    return "border-l-2 border-l-warning bg-warning/10";
  }
  return "border-l-2 border-l-transparent";
}

// Decompose'd task titles carry vault markdown (**bold**, `code`); strip the
// markers so the queue reads as plain text.
function plainTitle(s: string): string {
  return s.replace(/\*\*/g, "").replace(/`/g, "");
}

function tierBadge(
  task: FocusQueueTask
): { label: string; className: string } | null {
  const tier = task.erwin?.urgencyTier;
  if (task.erwin?.danger || tier === "DANGER") {
    return { label: "DANGER", className: "text-destructive" };
  }
  if (tier === "HIGH" && task.dueDate && isToday(task.dueDate)) {
    return { label: "DUE TODAY", className: "text-warning" };
  }
  return null;
}

export function CommandDashboard() {
  // The queue is shared with the top bar's status strip (store/erwinStatus.ts)
  // — this page used to own it, which is why the counts could only be seen
  // while standing on /today.
  const tasks = useErwinStatusStore((s) => s.tasks);
  const status = useErwinStatusStore((s) => s.status);
  const ladderOn = useModuleOn("ladder");
  const load = useErwinStatusStore((s) => s.load);
  const removeTask = useErwinStatusStore((s) => s.removeTask);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(
    () => tasks.find((t) => t.id === selectedId) ?? tasks[0] ?? null,
    [tasks, selectedId]
  );

  const markDone = useCallback(
    async (id: string) => {
      // Optimistic: drop it and slide selection to the next task. The status
      // strip is reading the same list, so its counts fall at the same moment.
      const idx = tasks.findIndex((t) => t.id === id);
      const next = tasks.filter((t) => t.id !== id);
      removeTask(id);
      setSelectedId(next[Math.min(idx, next.length - 1)]?.id ?? null);
      try {
        await fetch("/api/erwin/focus/interact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskId: id,
            action: "COMPLETED",
            sessionId: crypto.randomUUID(),
          }),
        });
      } catch {
        // A failed completion shouldn't silently look done — reload truth.
        load({ force: true });
      }
    },
    [tasks, removeTask, load]
  );

  return (
    // No header: the date and the counts that used to sit here are permanent
    // furniture in the app top bar now.
    <div className="flex h-full flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_23rem] xl:grid-cols-[1fr_27rem]">
        {/* LEFT — the climb: ranked queue */}
        <section className="min-h-0 overflow-y-auto border-b border-border lg:border-b-0 lg:border-r">
          {(status === "idle" || status === "loading") && (
            <p className="p-6 text-sm text-muted-foreground">Loading today…</p>
          )}
          {status === "error" && (
            <p className="p-6 text-sm text-destructive">
              Today couldn&apos;t load. Try again in a moment, and if it keeps
              failing, Settings has the logs.
            </p>
          )}
          {status === "ready" && tasks.length === 0 && <FirstRun />}
          <ol>
            {tasks.map((task, i) => {
              const badge = tierBadge(task);
              const goal = primaryLadderGoal(task);
              const isSelected = selected?.id === task.id;
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(task.id)}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-border px-6 py-3 text-left transition-colors",
                      tierRowAccent(task),
                      isSelected ? "bg-accent" : "hover:bg-muted/60"
                    )}
                  >
                    <span className="mt-0.5 w-5 flex-none font-mono text-xs text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        {badge && (
                          <span
                            className={cn(
                              "flex-none font-mono text-[10px] font-semibold uppercase tracking-wide",
                              badge.className
                            )}
                          >
                            {badge.label}
                          </span>
                        )}
                        <span className="truncate text-sm font-medium text-foreground">
                          {plainTitle(task.title)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        {task.erwin?.countdownHuman && (
                          <span>{task.erwin.countdownHuman}</span>
                        )}
                        {task.courseName && <span>· {task.courseName}</span>}
                        {goal && (
                          <span className="truncate">
                            · ↑ {goal.title}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        {/* RIGHT — the peak: the goal the selected task ladders to */}
        <aside className="min-h-0 overflow-y-auto p-6 md:p-8">
          {selected ? (
            <LadderPanel task={selected} onDone={markDone} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {ladderOn
                ? "Select a task to see the goal it climbs toward."
                : "Select a task to see it here."}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function LadderPanel({
  task,
  onDone,
}: {
  task: FocusQueueTask;
  onDone: (id: string) => void;
}) {
  const badge = tierBadge(task);
  const gi = task.gradeWeightPercent;
  const modules = useOnModules();

  return (
    <div>
      {/* The focused task */}
      <div>
        {badge && (
          <span
            className={cn(
              "font-mono text-xs font-semibold uppercase tracking-wide",
              badge.className
            )}
          >
            {badge.label}
          </span>
        )}
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">
          {plainTitle(task.title)}
        </h2>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {task.erwin?.countdownHuman && <span>{task.erwin.countdownHuman}</span>}
          {task.erwin?.effortEstimate && (
            <>
              <span aria-hidden>·</span>
              <span>{task.erwin.effortEstimate}</span>
            </>
          )}
          {task.courseName && (
            <>
              <span aria-hidden>·</span>
              <span>{task.courseName}</span>
            </>
          )}
          {gi != null && gi > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{gi}% of grade</span>
            </>
          )}
        </p>
      </div>

      {/* Sections modules add for the selected task (Ladder: the goal it
          climbs toward), each only while its module is on. */}
      {modules.map((m) => {
        const Section = CLIENT_MODULES[m.id].TodayTaskSection;
        return Section ? <Section key={m.id} task={task} /> : null;
      })}

      {/* Actions */}
      <div className="mt-8 flex items-center gap-3 border-t border-border pt-6">
        <Button onClick={() => onDone(task.id)}>Done</Button>
        <Button asChild variant="ghost">
          <Link href="/focus">Enter focus mode →</Link>
        </Button>
      </div>
    </div>
  );
}
