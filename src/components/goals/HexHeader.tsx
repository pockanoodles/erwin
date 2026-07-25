"use client";

import { useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { differenceInDays, newDate } from "@/lib/date-utils";
import { STAT_ABBREV, STAT_KEYS, type StatKey } from "@/lib/erwin/stats";
import { cn } from "@/lib/utils";

import { updateCycle } from "./api";
import { formatDay, hexBoss } from "./types";
import type { ApplyOverview, GoalsOverview } from "./types";

interface HexHeaderProps {
  overview: GoalsOverview;
  apply: ApplyOverview;
  refetch: () => Promise<void>;
}

/** The current hex: fixed two-month block, always present. The Build (focus
 *  stats) and theme are editable — the calendar owns the dates, and the boss
 *  is derived from the hex's goals (nearest-dated active boss goal). */
export function HexHeader({ overview, apply, refetch }: HexHeaderProps) {
  const cycle = overview.activeCycle;
  const [isEditing, setIsEditing] = useState(false);
  const [theme, setTheme] = useState(cycle.theme);
  const [focusStats, setFocusStats] = useState<string[]>(cycle.focusStats);
  const [isSaving, setIsSaving] = useState(false);

  const daysLeft = Math.max(
    differenceInDays(new Date(cycle.endDate), newDate()),
    0
  );
  const boss = hexBoss(overview.goals);

  const toggleStat = (key: StatKey) => {
    setFocusStats((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const nextTheme = theme.trim();
    const nextStats = focusStats;
    try {
      await updateCycle(cycle.id, { theme: nextTheme, focusStats: nextStats });
      apply((o) => ({
        ...o,
        activeCycle: {
          ...o.activeCycle,
          theme: nextTheme,
          focusStats: nextStats,
        },
      }));
      setIsEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save hex");
      void refetch();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-2">
      <h1 className="font-mono text-xl uppercase tracking-wide md:text-2xl">
        {cycle.hex.label}
        <span className="text-muted-foreground"> · {daysLeft}d left</span>
      </h1>
      {isEditing ? (
        <form onSubmit={save} className="max-w-md space-y-3">
          <div className="flex flex-wrap gap-1">
            {STAT_KEYS.map((key) => {
              const active = focusStats.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  title={key}
                  onClick={() => toggleStat(key)}
                  className={cn(
                    "rounded border px-1.5 py-0.5 font-mono text-xs transition-colors",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:border-foreground/40"
                  )}
                >
                  {STAT_ABBREV[key]}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Input
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="Theme for this hex (optional)"
              autoFocus
            />
            <Button type="submit" size="sm" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setTheme(cycle.theme);
                setFocusStats(cycle.focusStats);
                setIsEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-1">
          <div className="flex items-baseline gap-2">
            {cycle.focusStats.length > 0 ? (
              <h2 className="text-xl font-semibold tracking-tight">
                <span className="font-mono text-sm uppercase tracking-wide text-muted-foreground">
                  Build{" "}
                </span>
                {cycle.focusStats
                  .map((key) => STAT_ABBREV[key as StatKey] ?? key)
                  .join(" + ")}
              </h2>
            ) : (
              <p className="text-sm text-muted-foreground">No Build set.</p>
            )}
            {cycle.theme ? (
              <span className="text-sm text-muted-foreground">
                · {cycle.theme}
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-1.5 py-0.5 text-xs text-muted-foreground"
              onClick={() => {
                setTheme(cycle.theme);
                setFocusStats(cycle.focusStats);
                setIsEditing(true);
              }}
            >
              {cycle.focusStats.length > 0 || cycle.theme
                ? "Edit"
                : "Set the Build"}
            </Button>
          </div>
          {boss ? (
            <p className="text-sm">
              <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                ⚔ Boss{" "}
              </span>
              <span className="font-medium">{boss.title}</span>
              {boss.targetDate ? (
                <span className="text-muted-foreground">
                  {" "}
                  — {formatDay(boss.targetDate)}
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              No boss set for this hex — mark a goal as ⚔ Boss.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
