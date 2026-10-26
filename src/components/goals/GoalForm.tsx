"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { suggestProof } from "@/lib/erwin/boss-proof";
import { STAT_ABBREV, STAT_KEYS, type StatKey } from "@/lib/erwin/stats";
import { cn } from "@/lib/utils";

import type { ClaimOption } from "@/modules/types";

export interface GoalFormValues {
  title: string;
  whyItMatters: string | null;
  definitionOfDone: string | null;
  importanceScore: number | null;
  develops: string[];
  isBoss: boolean;
  targetDate: string | null;
  /** Where its work comes from: "CANVAS", a module's claim ("course:<id>"), "project:<id>". */
  taskSources: string[];
  /** A boss's proof: one Canvas gradebook item, or one task. */
  canvasAssignmentId: string | null;
  proofTaskId: string | null;
  status: string;
}

/** GET /api/erwin/goals/sources: what a goal can claim and a boss can name as proof. */
export interface GoalSources {
  /** Whole task sources that have work in them ("All Canvas work"). */
  sources: ClaimOption[];
  /** What the modules offer to claim (Courses: each course). */
  claimOptions: ClaimOption[];
  projects: { id: string; name: string }[];
  items: {
    canvasId: string;
    courseId: string;
    courseCode: string | null;
    name: string;
    dueDay: string | null;
    label: string;
    boundTo: string | null;
  }[];
  tasks: { id: string; title: string; source: string | null; dueDay: string | null; done: boolean }[];
}

interface GoalFormProps {
  initialValues: GoalFormValues;
  submitLabel: string;
  /** Goals a new one can sit under, a boss on its path. Omit when editing. */
  parents?: { id: string; title: string }[];
  /** What it can claim and prove; null while that loads. */
  sources: GoalSources | null;
  /** The goal being edited, so its own proof stays selectable. */
  goalId?: string | null;
  onSubmit: (values: GoalFormValues, parentGoalId: string | null) => Promise<void>;
  onCancel: () => void;
}

/** "SCHM2301" from Canvas's "SCHM2301.10244.202710". */
const shortCode = (code: string | null, name: string) => code?.split(".")[0] || name;

const dayLabel = (day: string | null) =>
  day
    ? new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    : "no date";

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

function Chip({ on, onClick, title, children }: { on: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "border px-1.5 py-0.5 font-mono text-xs transition-colors",
        on
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:border-foreground/40"
      )}
    >
      {children}
    </button>
  );
}

/** The form for adding or editing a goal made in Erwin. */
export function GoalForm({
  initialValues,
  submitLabel,
  parents,
  sources,
  goalId = null,
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
  const [claims, setClaims] = useState<string[]>(initialValues.taskSources);
  const [isBoss, setIsBoss] = useState(initialValues.isBoss);
  const [targetDate, setTargetDate] = useState(
    initialValues.targetDate ? initialValues.targetDate.slice(0, 10) : ""
  );
  // "" (marked by hand), "canvas:<id>" or "task:<id>".
  const [proof, setProof] = useState(
    initialValues.canvasAssignmentId
      ? `canvas:${initialValues.canvasAssignmentId}`
      : initialValues.proofTaskId
        ? `task:${initialValues.proofTaskId}`
        : ""
  );
  const [done, setDone] = useState(initialValues.status === "done");
  const [parentGoalId, setParentGoalId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggle = (list: string[], key: string) =>
    list.includes(key) ? list.filter((k) => k !== key) : [...list, key];

  // Canvas items free to prove this boss, by course.
  const freeItems = useMemo(
    () => (sources?.items ?? []).filter((item) => !item.boundTo || item.boundTo === goalId),
    [sources, goalId]
  );
  const itemsByCourse = useMemo(() => {
    const groups = new Map<string, GoalSources["items"]>();
    for (const item of freeItems) {
      const course = shortCode(item.courseCode, "Canvas");
      groups.set(course, [...(groups.get(course) ?? []), item]);
    }
    return [...groups];
  }, [freeItems]);
  const suggestion = useMemo(
    () =>
      isBoss && !proof && title.trim()
        ? suggestProof({ title, day: targetDate || null }, freeItems)
        : null,
    [isBoss, proof, title, targetDate, freeItems]
  );
  const chosenItem = proof.startsWith("canvas:")
    ? sources?.items.find((item) => item.canvasId === proof.slice(7))
    : undefined;

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
          taskSources: isBoss ? [] : claims,
          canvasAssignmentId: isBoss && proof.startsWith("canvas:") ? proof.slice(7) : null,
          proofTaskId: isBoss && proof.startsWith("task:") ? proof.slice(5) : null,
          status: isBoss && !proof ? (done ? "done" : "active") : initialValues.status,
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
          {STAT_KEYS.map((key: StatKey) => (
            <Chip key={key} title={key} on={develops.includes(key)} onClick={() => setDevelops((d) => toggle(d, key))}>
              {STAT_ABBREV[key]}
            </Chip>
          ))}
        </div>
      </div>
      {!isBoss ? (
        <div className="space-y-1.5">
          <FieldLabel>Counts toward it</FieldLabel>
          {sources ? (
            sources.sources.length + sources.claimOptions.length + sources.projects.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-1">
                  {[...sources.sources, ...sources.claimOptions].map((option) => (
                    <Chip
                      key={option.key}
                      title={option.title}
                      on={claims.includes(option.key)}
                      onClick={() => setClaims((c) => toggle(c, option.key))}
                    >
                      {option.label}
                    </Chip>
                  ))}
                  {sources.projects.map((project) => (
                    <Chip
                      key={project.id}
                      on={claims.includes(`project:${project.id}`)}
                      onClick={() => setClaims((c) => toggle(c, `project:${project.id}`))}
                    >
                      {project.name}
                    </Chip>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Tasks from what you pick file under this goal on their own, finished ones too.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Connect Canvas or make a project, and its work can file under this goal on its own.
              </p>
            )
          ) : (
            <p className="text-xs text-muted-foreground">Loading…</p>
          )}
        </div>
      ) : null}
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
      {isBoss ? (
        <div className="space-y-1.5">
          <FieldLabel htmlFor="goal-proof">Proof</FieldLabel>
          <select
            id="goal-proof"
            value={proof}
            onChange={(e) => setProof(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-raised px-2 text-sm text-foreground"
          >
            <option value="">None, I&apos;ll mark it done</option>
            {itemsByCourse.map(([course, items]) => (
              <optgroup key={course} label={course}>
                {items.map((item) => (
                  <option key={item.canvasId} value={`canvas:${item.canvasId}`}>
                    {item.name} · {dayLabel(item.dueDay)} · {item.label}
                  </option>
                ))}
              </optgroup>
            ))}
            {sources?.tasks.length ? (
              <optgroup label="Other tasks">
                {sources.tasks.map((task) => (
                  <option key={task.id} value={`task:${task.id}`}>
                    {task.title} · {dayLabel(task.dueDay)}
                    {task.done ? " · done" : ""}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
          {proof ? (
            <p className="text-xs text-muted-foreground">
              {chosenItem ? `Canvas says: ${chosenItem.label}. ` : ""}
              {proof.startsWith("canvas:")
                ? "Handing it in, a grade or an excusal fells the boss, and Canvas's due date replaces this one."
                : "Finishing the task fells the boss."}
            </p>
          ) : (
            <>
              {suggestion ? (
                <p className="text-xs text-muted-foreground">
                  Looks like <span className="text-foreground">{suggestion.name}</span> in Canvas.
                  <button
                    type="button"
                    onClick={() => setProof(`canvas:${suggestion.canvasId}`)}
                    className="er-slash ml-2 font-mono uppercase tracking-wide text-muted-foreground transition-colors duration-150 hover:text-foreground"
                  >
                    Use it
                  </button>
                </p>
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={(e) => setDone(e.target.checked)}
                  className="h-3.5 w-3.5 accent-foreground"
                />
                <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  Done, it&apos;s beaten
                </span>
              </label>
            </>
          )}
        </div>
      ) : null}
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
