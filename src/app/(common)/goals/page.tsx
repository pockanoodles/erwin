"use client";

import { useEffect, useState } from "react";

import { differenceInDays, format, newDate } from "@/lib/date-utils";
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

export default function GoalsPage() {
  const [data, setData] = useState<GoalsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/erwin/goals/overview");
        if (!res.ok) {
          throw new Error("Failed to load goals overview");
        }
        const json = (await res.json()) as GoalsOverview;
        if (!cancelled) {
          setData(json);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cycle = data?.activeCycle ?? null;
  const daysLeft = cycle
    ? Math.max(differenceInDays(new Date(cycle.endDate), newDate()), 0)
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-12 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Goals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Where the season&apos;s effort is going — read-only, grouped by
          source.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {/* Season header */}
      <section className="space-y-2">
        <SectionLabel>Season</SectionLabel>
        {cycle ? (
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
          <p className="text-sm text-muted-foreground">
            No active season. Start a cycle to frame the next couple of
            months.
          </p>
        ) : null}
      </section>

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

      {/* Explicit Erwin goals — only when rows exist */}
      {data && data.goals.length > 0 ? (
        <section className="space-y-6">
          <SectionLabel>Erwin goals</SectionLabel>
          {data.goals.map((goal) => (
            <div key={goal.id} className="border-t border-border pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold tracking-tight">
                  {goal.title}
                </h3>
                {goal.importanceScore != null ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {Math.round(goal.importanceScore)}/100
                  </span>
                ) : null}
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
          ))}
        </section>
      ) : null}
    </div>
  );
}
