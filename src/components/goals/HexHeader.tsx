"use client";

import { useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { differenceInDays, newDate } from "@/lib/date-utils";

import { updateCycleTheme } from "./api";
import type { OverviewCycle } from "./types";

interface HexHeaderProps {
  cycle: OverviewCycle;
  onChanged: () => Promise<void>;
}

/** The current hex: fixed two-month block, always present. Only the theme is
 *  editable — the calendar owns the dates. */
export function HexHeader({ cycle, onChanged }: HexHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [theme, setTheme] = useState(cycle.theme);
  const [isSaving, setIsSaving] = useState(false);

  const daysLeft = Math.max(
    differenceInDays(new Date(cycle.endDate), newDate()),
    0
  );

  const saveTheme = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateCycleTheme(cycle.id, theme.trim());
      setIsEditing(false);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save theme");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-2">
      <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
        {cycle.hex.label}
        <span className="text-foreground"> · {daysLeft}d left</span>
      </p>
      {isEditing ? (
        <form onSubmit={saveTheme} className="flex max-w-md gap-2">
          <Input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="Theme for this hex"
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
              setIsEditing(false);
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex items-baseline gap-2">
          {cycle.theme ? (
            <h2 className="text-xl font-semibold tracking-tight">
              {cycle.theme}
            </h2>
          ) : (
            <p className="text-sm text-muted-foreground">No theme yet.</p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-auto px-1.5 py-0.5 text-xs text-muted-foreground"
            onClick={() => {
              setTheme(cycle.theme);
              setIsEditing(true);
            }}
          >
            {cycle.theme ? "Edit" : "Set a theme"}
          </Button>
        </div>
      )}
    </section>
  );
}
