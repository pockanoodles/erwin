"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { STAT_ABBREV, STAT_KEYS, type StatKey } from "@/lib/erwin/stats";
import { cn } from "@/lib/utils";

export interface GoalFormValues {
  title: string;
  whyItMatters: string | null;
  definitionOfDone: string | null;
  importanceScore: number | null;
  develops: string[];
  isBoss: boolean;
  targetDate: string | null;
}

interface GoalFormProps {
  initialValues: GoalFormValues;
  submitLabel: string;
  /** Goals a new one can sit under, a boss on its path. Omit when editing. */
  parents?: { id: string; title: string }[];
  onSubmit: (values: GoalFormValues, parentGoalId: string | null) => Promise<void>;
  onCancel: () => void;
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="font-mono text-xs uppercase tracking-wide text-muted-foreground"
    >
      {children}
    </label>
  );
}

/** The form for adding or editing a goal made in Erwin. */
export function GoalForm({
  initialValues,
  submitLabel,
  parents,
  onSubmit,
  onCancel,
}: GoalFormProps) {
  const [title, setTitle] = useState(initialValues.title);
  const [whyItMatters, setWhyItMatters] = useState(
    initialValues.whyItMatters ?? ""
  );
  const [definitionOfDone, setDefinitionOfDone] = useState(
    initialValues.definitionOfDone ?? ""
  );
  const [importance, setImportance] = useState(
    initialValues.importanceScore != null
      ? String(Math.round(initialValues.importanceScore))
      : ""
  );
  const [develops, setDevelops] = useState<string[]>(initialValues.develops);
  const [isBoss, setIsBoss] = useState(initialValues.isBoss);
  const [targetDate, setTargetDate] = useState(
    initialValues.targetDate ? initialValues.targetDate.slice(0, 10) : ""
  );
  const [parentGoalId, setParentGoalId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleStat = (key: StatKey) => {
    setDevelops((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(
        {
          title: title.trim(),
          whyItMatters: whyItMatters.trim() || null,
          definitionOfDone: definitionOfDone.trim() || null,
          importanceScore: importance ? Number(importance) : null,
          develops,
          isBoss,
          targetDate: targetDate || null,
        },
        parentGoalId || null
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-end gap-4">
        <div className="flex-1 space-y-1.5">
          <FieldLabel htmlFor="goal-title">Goal</FieldLabel>
          <Input
            id="goal-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Pass CFA Level 1 registration + study plan"
            autoFocus
            required
          />
        </div>
        <div className="w-28 space-y-1.5">
          <FieldLabel htmlFor="goal-importance">Importance</FieldLabel>
          <Input
            id="goal-importance"
            type="number"
            min={0}
            max={100}
            value={importance}
            onChange={(e) => setImportance(e.target.value)}
            placeholder="0–100"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <FieldLabel>Develops</FieldLabel>
        <div className="flex flex-wrap gap-1">
          {STAT_KEYS.map((key) => {
            const active = develops.includes(key);
            return (
              <button
                key={key}
                type="button"
                title={key}
                onClick={() => toggleStat(key)}
                className={cn(
                  "border px-1.5 py-0.5 font-mono text-xs transition-colors",
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
      </div>
      {parents && parents.length > 0 ? (
        <div className="space-y-1.5">
          <FieldLabel htmlFor="goal-parent">Under</FieldLabel>
          <select
            id="goal-parent"
            value={parentGoalId}
            onChange={(e) => setParentGoalId(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-raised px-2 text-sm text-foreground"
          >
            <option value="">Nothing, it stands alone</option>
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="flex items-end gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isBoss}
            onChange={(e) => setIsBoss(e.target.checked)}
            className="h-3.5 w-3.5 accent-foreground"
          />
          <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
            Boss, a dated milestone
          </span>
        </label>
        {isBoss ? (
          <div className="space-y-1.5">
            <FieldLabel htmlFor="goal-target">Boss date</FieldLabel>
            <Input
              id="goal-target"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="h-8 w-40 text-sm"
            />
          </div>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor="goal-why">Why it matters</FieldLabel>
        <Textarea
          id="goal-why"
          value={whyItMatters}
          onChange={(e) => setWhyItMatters(e.target.value)}
          rows={2}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor="goal-done">Done when</FieldLabel>
        <Textarea
          id="goal-done"
          value={definitionOfDone}
          onChange={(e) => setDefinitionOfDone(e.target.value)}
          rows={2}
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting || !title.trim()}
        >
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" size="sm" variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
