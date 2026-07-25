"use client";

import { useCallback, useEffect, useState } from "react";

import { toast } from "sonner";

import { CycleForm, CycleFormValues } from "@/components/goals/CycleForm";
import { GoalForm, GoalFormValues } from "@/components/goals/GoalForm";
import { Button } from "@/components/ui/button";

import { addDays, differenceInDays, format, newDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

interface OverviewCycle {
  id: string;
  theme: string;
  startDate: string;
  endDate: string;
}

interface OverviewTask {
  id: string;
  title: string;
  dueDate: string | null;
  urgencyTier: string | null;
}

interface OverviewGroup {
  key: string;
  openCount: number;
  doneLast30: number;
  tasks: OverviewTask[];
}

interface OverviewGoal {
  id: string;
  title: string;
  whyItMatters: string | null;
  definitionOfDone: string | null;
  status: string;
  importanceScore: number | null;
  cycleTheme: string;
}

interface GoalsOverview {
  activeCycle: OverviewCycle | null;
  groups: OverviewGroup[];
  goals: OverviewGoal[];
}

function titleCaseSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function groupDisplay(key: string): { name: string; slug: string | null } {
  if (key.startsWith("venture:")) {
    const slug = key.slice("venture:".length);
    return { name: titleCaseSlug(slug), slug };
  }
  if (key === "CANVAS") {
    return { name: "School — Canvas", slug: null };
  }
  return { name: "Untagged", slug: null };
}

/** Mirrors the Focus tier treatment (FocusTaskCard): red for DANGER, amber for HIGH. */
function tierBadge(tier: string | null): { label: string; className: string } | null {
  if (tier === "DANGER") {
    return {
      label: "DANGER",
      className: "text-red-700 dark:text-red-400",
    };
  }
  if (tier === "HIGH") {
    return {
      label: "HIGH",
      className: "text-amber-700 dark:text-amber-400",
    };
  }
  return null;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function toDateInput(iso: string): string {
  return new Date(iso).toISOString().split("T")[0];
}

export default function GoalsPage() {
  const [data, setData] = useState<GoalsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "start" = creating, "edit" = editing the active cycle, null = display
  const [cycleFormMode, setCycleFormMode] = useState<"start" | "edit" | null>(
    null
  );
  // "new" = adding, otherwise the id of the goal being edited
  const [goalFormTarget, setGoalFormTarget] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/erwin/goals/overview");
      if (!res.ok) {
        throw new Error("Failed to load goals overview");
      }
      const json = (await res.json()) as GoalsOverview;
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const cycle = data?.activeCycle ?? null;
  const daysLeft = cycle
    ? Math.max(differenceInDays(new Date(cycle.endDate), newDate()), 0)
    : null;

  const saveCycle = async (values: CycleFormValues) => {
    const editing = cycleFormMode === "edit" && cycle;
    const res = await fetch(
      editing ? `/api/erwin/cycles/${cycle.id}` : "/api/erwin/cycles",
      {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      }
    );
    if (!res.ok) {
      toast.error(await res.text());
      return;
    }
    setCycleFormMode(null);
    toast.success(editing ? "Season updated" : "Season started");
    await loadOverview();
  };

  const saveGoal = async (values: GoalFormValues) => {
    const editing = goalFormTarget !== null && goalFormTarget !== "new";
    const res = await fetch(
      editing ? `/api/erwin/goals/${goalFormTarget}` : "/api/erwin/goals",
      {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      }
    );
    if (!res.ok) {
      toast.error(await res.text());
      return;
    }
    setGoalFormTarget(null);
    toast.success(editing ? "Goal updated" : "Goal added");
    await loadOverview();
  };

  const deleteGoal = async (goal: OverviewGoal) => {
    if (!window.confirm(`Delete "${goal.title}"? Linked tasks are kept.`)) {
      return;
    }
    const res = await fetch(`/api/erwin/goals/${goal.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error(await res.text());
      return;
    }
    toast.success("Goal deleted");
    await loadOverview();
  };

  const cycleFormInitial: CycleFormValues =
    cycleFormMode === "edit" && cycle
      ? {
          theme: cycle.theme,
          startDate: toDateInput(cycle.startDate),
          endDate: toDateInput(cycle.endDate),
        }
      : {
          theme: "",
          startDate: newDate().toISOString().split("T")[0],
          // Kaito plans in two-month cycles; offer that as the default frame.
          endDate: addDays(newDate(), 61).toISOString().split("T")[0],
        };

  const emptyGoal: GoalFormValues = {
    title: "",
    whyItMatters: null,
    definitionOfDone: null,
    importanceScore: null,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-12 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Goals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Where the season&apos;s effort is going, grouped by source.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {/* Season header */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <SectionLabel>Season</SectionLabel>
          {cycle && cycleFormMode === null ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-1.5 py-0.5 text-xs text-muted-foreground"
              onClick={() => setCycleFormMode("edit")}
            >
              Edit
            </Button>
          ) : null}
        </div>
        {cycleFormMode !== null ? (
          <CycleForm
            initialValues={cycleFormInitial}
            submitLabel={cycleFormMode === "edit" ? "Save" : "Start season"}
            onSubmit={saveCycle}
            onCancel={() => setCycleFormMode(null)}
          />
        ) : cycle ? (
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {cycle.theme}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {format(new Date(cycle.startDate), "MMM d")} →{" "}
              {format(new Date(cycle.endDate), "MMM d, yyyy")}
              <span className="text-foreground"> · {daysLeft}d left</span>
            </p>
          </div>
        ) : data ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No active season. Start a cycle to frame the next couple of
              months.
            </p>
            <Button size="sm" onClick={() => setCycleFormMode("start")}>
              Start a season
            </Button>
          </div>
        ) : null}
      </section>

      {/* Explicit Erwin goals */}
      {data ? (
        <section className="space-y-6">
          <div className="flex items-baseline justify-between gap-2">
            <SectionLabel>Erwin goals</SectionLabel>
            {cycle && goalFormTarget === null ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-1.5 py-0.5 text-xs text-muted-foreground"
                onClick={() => setGoalFormTarget("new")}
              >
                Add goal
              </Button>
            ) : null}
          </div>
          {goalFormTarget === "new" ? (
            <div className="border-t border-border pt-4">
              <GoalForm
                initialValues={emptyGoal}
                submitLabel="Add goal"
                onSubmit={saveGoal}
                onCancel={() => setGoalFormTarget(null)}
              />
            </div>
          ) : null}
          {data.goals.length === 0 && goalFormTarget !== "new" ? (
            <p className="text-sm text-muted-foreground">
              {cycle
                ? "No goals yet — name the two or three outcomes that define this season."
                : "Goals live inside a season. Start one above first."}
            </p>
          ) : null}
          {data.goals.map((goal) =>
            goalFormTarget === goal.id ? (
              <div key={goal.id} className="border-t border-border pt-4">
                <GoalForm
                  initialValues={goal}
                  submitLabel="Save"
                  onSubmit={saveGoal}
                  onCancel={() => setGoalFormTarget(null)}
                />
              </div>
            ) : (
              <div key={goal.id} className="group border-t border-border pt-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-lg font-semibold tracking-tight">
                    {goal.title}
                  </h3>
                  <span className="flex items-baseline gap-3">
                    {goal.importanceScore != null ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {Math.round(goal.importanceScore)}/100
                      </span>
                    ) : null}
                    <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto px-1.5 py-0.5 text-xs text-muted-foreground"
                        onClick={() => setGoalFormTarget(goal.id)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto px-1.5 py-0.5 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => deleteGoal(goal)}
                      >
                        Delete
                      </Button>
                    </span>
                  </span>
                </div>
                {goal.whyItMatters ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {goal.whyItMatters}
                  </p>
                ) : null}
                {goal.definitionOfDone ? (
                  <p className="mt-1 text-sm">
                    <span className="text-muted-foreground">Done when:</span>{" "}
                    {goal.definitionOfDone}
                  </p>
                ) : null}
              </div>
            )
          )}
        </section>
      ) : null}

      {/* Goal groups by source */}
      {data ? (
        <section className="space-y-6">
          <SectionLabel>Where the work is</SectionLabel>
          {data.groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No open tasks yet — everything lands here once Canvas, the
              ventures, or manual entry create work.
            </p>
          ) : (
            data.groups.map((group) => {
              const { name, slug } = groupDisplay(group.key);
              return (
                <div key={group.key} className="border-t border-border pt-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-lg font-semibold tracking-tight">
                        {name}
                      </h3>
                      {slug ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                          {slug}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {group.openCount} open
                      {group.doneLast30 > 0 ? (
                        <> · {group.doneLast30} done · 30d</>
                      ) : null}
                    </p>
                  </div>
                  {group.tasks.length > 0 ? (
                    <ul className="mt-2 divide-y divide-border/60">
                      {group.tasks.map((task) => {
                        const badge = tierBadge(task.urgencyTier);
                        return (
                          <li
                            key={task.id}
                            className="flex items-baseline justify-between gap-4 py-2.5"
                          >
                            <span className="min-w-0 truncate text-sm">
                              {task.title}
                            </span>
                            <span className="flex flex-none items-baseline gap-3">
                              {badge ? (
                                <span
                                  className={cn(
                                    "text-xs font-semibold",
                                    badge.className
                                  )}
                                >
                                  {badge.label}
                                </span>
                              ) : null}
                              {task.dueDate ? (
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(task.dueDate), "MMM d")}
                                </span>
                              ) : null}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Nothing open — {group.doneLast30} closed in the last 30
                      days.
                    </p>
                  )}
                </div>
              );
            })
          )}
        </section>
      ) : null}
    </div>
  );
}
