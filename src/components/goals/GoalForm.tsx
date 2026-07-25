"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface GoalFormValues {
  title: string;
  whyItMatters: string | null;
  definitionOfDone: string | null;
  importanceScore: number | null;
}

interface GoalFormProps {
  initialValues: GoalFormValues;
  submitLabel: string;
  onSubmit: (values: GoalFormValues) => Promise<void>;
  onCancel: () => void;
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
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

/** Inline form for adding or editing a goal within the active season. */
export function GoalForm({
  initialValues,
  submitLabel,
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        whyItMatters: whyItMatters.trim() || null,
        definitionOfDone: definitionOfDone.trim() || null,
        importanceScore: importance ? Number(importance) : null,
      });
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
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
