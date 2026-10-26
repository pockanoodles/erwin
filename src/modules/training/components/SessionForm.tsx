"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { cn } from "@/lib/utils";

import { localDay } from "@/modules/training/cadence";
import {
  type Entry,
  UNITS,
  type Unit,
  convertWeight,
} from "@/modules/training/sets";
import type { WorkoutInput } from "@/modules/training/types";

/** A line as typed: numbers stay text until it's sent, so a field can sit empty mid-edit. */
interface Line {
  key: number;
  exercise: string;
  sets: string;
  reps: string;
  weight: string;
}

const LINE_GRID =
  "grid grid-cols-[minmax(0,1fr)_2.75rem_auto_2.75rem_auto_4rem_1.5rem] items-center gap-1";

const toLine = (e: Entry, key: number): Line => ({
  key,
  exercise: e.exercise,
  sets: String(e.sets),
  reps: e.reps == null ? "" : String(e.reps),
  weight: e.weight == null ? "" : String(e.weight),
});

function toEntry(line: Line): Entry {
  const int = (s: string) => {
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  };
  const dec = (s: string) => {
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : null;
  };
  return {
    exercise: line.exercise,
    sets: int(line.sets) ?? 0,
    reps: int(line.reps),
    weight: dec(line.weight),
  };
}

/** When a session on `day` happened: now if that's today, else midday then. */
function atFor(day: string): string {
  if (day === localDay(new Date())) return new Date().toISOString();
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toISOString();
}

/** The chip a pane uses for a pick-one choice (the cadence, the unit). */
export function ChoiceChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-7 px-2.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors duration-150",
        on
          ? "er-brackets text-foreground [--bracket:var(--er-ink)]"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

/**
 * One session's sets, as a form: the day, the unit, a line per exercise
 * (sets × reps @ weight), and a note. It starts from what the caller hands
 * it (last time's numbers, or the session being changed).
 */
export function SessionForm({
  initial,
  submitLabel,
  emphasis = "loud",
  onSubmit,
  onDelete,
  onCancel,
}: {
  initial: {
    at: string | null;
    unit: Unit;
    note: string | null;
    entries: Entry[];
  };
  submitLabel: string;
  /** `loud` for the page's one main action, logging; `quiet` for changing one. */
  emphasis?: "loud" | "quiet";
  onSubmit: (input: WorkoutInput) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
  onCancel?: () => void;
}) {
  const startDay = localDay(initial.at ? new Date(initial.at) : new Date());
  const keys = useRef(initial.entries.length);
  const [day, setDay] = useState(startDay);
  const [unit, setUnit] = useState<Unit>(initial.unit);
  const [lines, setLines] = useState<Line[]>(() => initial.entries.map(toLine));
  const [note, setNote] = useState(initial.note ?? "");
  const [busy, setBusy] = useState(false);
  // Deleting asks twice: the first press only arms it.
  const [armed, setArmed] = useState(false);

  const change = (key: number, field: keyof Omit<Line, "key">, value: string) =>
    setLines((ls) =>
      ls.map((l) => (l.key === key ? { ...l, [field]: value } : l))
    );

  // Switching units converts what's typed, so 60 kg becomes 132.5 lb.
  const changeUnit = (to: Unit) => {
    if (to === unit) return;
    setLines((ls) =>
      ls.map((l) => {
        const w = Number.parseFloat(l.weight);
        return Number.isFinite(w)
          ? { ...l, weight: String(convertWeight(w, unit, to)) }
          : l;
      })
    );
    setUnit(to);
  };

  const addLine = () => {
    const last = lines[lines.length - 1];
    keys.current += 1;
    setLines([
      ...lines,
      // Another line of the same exercise is the usual next thing (a set of 6 after two of 8).
      last
        ? { ...last, key: keys.current }
        : { key: keys.current, exercise: "", sets: "3", reps: "", weight: "" },
    ]);
  };

  const submit = async () => {
    setBusy(true);
    await onSubmit({
      // A change that leaves the day alone keeps the session's own time.
      ...(initial.at && day === startDay ? {} : { at: atFor(day) }),
      unit,
      note: note.trim() || null,
      entries: lines.map(toEntry),
    });
    setBusy(false);
  };

  const remove = async () => {
    if (!onDelete) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    await onDelete();
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          aria-label="Day"
          value={day}
          max={localDay(new Date())}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          className="h-8 w-[10.5rem]"
        />
        <div className="flex gap-1" role="group" aria-label="Weight unit">
          {UNITS.map((u) => (
            <ChoiceChip key={u} on={unit === u} onClick={() => changeUnit(u)}>
              {u}
            </ChoiceChip>
          ))}
        </div>
      </div>

      {lines.length > 0 ? (
        <div className="space-y-1">
          <div
            className={cn(
              LINE_GRID,
              "font-mono text-[10px] uppercase tracking-wide text-muted-foreground"
            )}
          >
            <span>Exercise</span>
            <span>Sets</span>
            <span />
            <span>Reps</span>
            <span />
            <span>{unit}</span>
            <span />
          </div>
          {lines.map((l) => (
            <div key={l.key} className={LINE_GRID}>
              <Input
                aria-label="Exercise"
                value={l.exercise}
                onChange={(e) => change(l.key, "exercise", e.target.value)}
                className="h-8"
                autoComplete="off"
              />
              <Input
                aria-label="Sets"
                inputMode="numeric"
                value={l.sets}
                onChange={(e) => change(l.key, "sets", e.target.value)}
                className="h-8 px-1.5 text-center tabular-nums"
              />
              <span className="text-xs text-muted-foreground">×</span>
              <Input
                aria-label="Reps"
                inputMode="numeric"
                value={l.reps}
                onChange={(e) => change(l.key, "reps", e.target.value)}
                className="h-8 px-1.5 text-center tabular-nums"
              />
              <span className="text-xs text-muted-foreground">@</span>
              <Input
                aria-label={`Weight in ${unit}`}
                inputMode="decimal"
                placeholder="—"
                value={l.weight}
                onChange={(e) => change(l.key, "weight", e.target.value)}
                className="h-8 px-1.5 text-right tabular-nums"
              />
              <button
                type="button"
                aria-label="Remove this line"
                title="Remove this line"
                onClick={() => setLines(lines.filter((x) => x.key !== l.key))}
                className="h-8 text-muted-foreground transition-colors duration-150 hover:text-foreground"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <Button variant="quiet" onClick={addLine}>
        Add a line
      </Button>

      <Textarea
        aria-label="Note"
        placeholder="How it went (optional)"
        value={note}
        rows={2}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant={emphasis === "loud" ? "default" : "secondary"}
          disabled={busy}
          onClick={() => void submit()}
        >
          {submitLabel}
        </Button>
        {onDelete ? (
          <Button
            variant="quiet"
            disabled={busy}
            onClick={() => void remove()}
            className={cn(armed && "text-destructive hover:text-destructive")}
          >
            {armed ? "Delete it" : "Delete"}
          </Button>
        ) : null}
        {onCancel ? (
          <Button variant="quiet" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
