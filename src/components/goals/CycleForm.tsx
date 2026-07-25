"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface CycleFormValues {
  theme: string;
  startDate: string;
  endDate: string;
}

interface CycleFormProps {
  initialValues: CycleFormValues;
  submitLabel: string;
  onSubmit: (values: CycleFormValues) => Promise<void>;
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

/** Inline form for starting or editing a season (GoalCycle). */
export function CycleForm({
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
}: CycleFormProps) {
  const [theme, setTheme] = useState(initialValues.theme);
  const [startDate, setStartDate] = useState(initialValues.startDate);
  const [endDate, setEndDate] = useState(initialValues.endDate);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!theme.trim() || !startDate || !endDate) return;
    setIsSubmitting(true);
    try {
      await onSubmit({ theme: theme.trim(), startDate, endDate });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <FieldLabel htmlFor="cycle-theme">Theme</FieldLabel>
        <Input
          id="cycle-theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="e.g. Land the internship, ship Erwin v2"
          autoFocus
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <FieldLabel htmlFor="cycle-start">Start</FieldLabel>
          <Input
            id="cycle-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel htmlFor="cycle-end">End</FieldLabel>
          <Input
            id="cycle-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting || !theme.trim()}
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
