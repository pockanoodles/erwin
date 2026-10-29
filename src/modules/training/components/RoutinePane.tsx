"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { localDay } from "@/lib/date-utils";

import {
  CADENCE_CHOICES,
  cadenceLabel,
  lastLabel,
  nextLabel,
  sameCadence,
} from "@/modules/training/cadence";
import {
  ChoiceChip,
  SessionForm,
} from "@/modules/training/components/SessionForm";
import {
  type PlannedExercise,
  type Unit,
  prefillEntries,
  sessionSummary,
} from "@/modules/training/sets";
import { useTrainingStore } from "@/modules/training/store";
import type {
  RoutineInput,
  RoutineRow,
  WorkoutRow,
} from "@/modules/training/types";

/** A planned exercise as typed: numbers stay text until it's saved. */
interface PlanLine {
  key: number;
  name: string;
  sets: string;
  reps: string;
}

interface Draft {
  name: string;
  notes: string;
  cadenceDays: number | null;
  minutes: string;
  plan: PlanLine[];
}

function draftOf(r: RoutineRow | null): Draft {
  return {
    name: r?.name ?? "",
    notes: r?.notes ?? "",
    cadenceDays: r?.cadenceDays ?? null,
    minutes: String(r?.minutes ?? 60),
    plan: (r?.plan ?? []).map((p, key) => ({
      key,
      name: p.name,
      sets: String(p.sets),
      reps: p.reps == null ? "" : String(p.reps),
    })),
  };
}

/** The plan as saved: lines without a name are dropped. */
function planOf(lines: PlanLine[]): PlannedExercise[] {
  return lines.flatMap((l) => {
    const name = l.name.trim();
    if (!name) return [];
    const sets = Number.parseInt(l.sets, 10);
    const reps = Number.parseInt(l.reps, 10);
    return [
      {
        name,
        sets: Number.isFinite(sets) && sets > 0 ? sets : 1,
        reps: Number.isFinite(reps) && reps > 0 ? reps : null,
      },
    ];
  });
}

/** What a draft saves as, so "changed?" compares what would be stored. */
function inputOf(d: Draft): RoutineInput & { name: string } {
  const minutes = Number.parseInt(d.minutes, 10);
  return {
    name: d.name.trim(),
    notes: d.notes,
    cadenceDays: d.cadenceDays,
    minutes: Number.isFinite(minutes)
      ? Math.min(600, Math.max(5, minutes))
      : 60,
    plan: planOf(d.plan),
  };
}

/** Pounds where the browser says the US, kilograms everywhere else. */
const guessUnit = (): Unit =>
  typeof navigator !== "undefined" && navigator.language === "en-US"
    ? "lb"
    : "kg";

const dayText = (at: string) =>
  new Date(at).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

/**
 * One routine, whole: when it's next due, a form to log the session you just
 * did (starting from last time's weights), the history, and its plan and
 * schedule. With no routine it's the form for a new one, held here until
 * it's saved.
 */
export function RoutinePane({ routine }: { routine: RoutineRow | null }) {
  const create = useTrainingStore((s) => s.create);
  const update = useTrainingStore((s) => s.update);
  const select = useTrainingStore((s) => s.select);
  const [draft, setDraft] = useState<Draft>(() => draftOf(routine));
  const [saving, setSaving] = useState(false);
  const planKeys = useRef(routine?.plan.length ?? 0);

  // Saved values that change (a save, a reload) replace the draft; a reload
  // that changes nothing editable, like logging a session, leaves unsaved
  // edits alone.
  const baseKey = JSON.stringify(draftOf(routine));
  useEffect(() => {
    setDraft(JSON.parse(baseKey) as Draft);
  }, [baseKey]);

  const dirty = useMemo(
    () =>
      JSON.stringify(inputOf(draft)) !==
      JSON.stringify(inputOf(draftOf(routine))),
    [draft, routine]
  );

  const save = async () => {
    if (!draft.name.trim()) {
      toast.error("A routine needs a name.");
      return;
    }
    setSaving(true);
    const saved = routine
      ? await update(routine.id, inputOf(draft))
      : await create(inputOf(draft));
    setSaving(false);
    if (!saved) toast.error("Couldn't save. Try again.");
  };

  const setLine = (key: number, change: Partial<PlanLine>) =>
    setDraft({
      ...draft,
      plan: draft.plan.map((l) => (l.key === key ? { ...l, ...change } : l)),
    });

  const moveLine = (index: number, by: -1 | 1) => {
    const plan = [...draft.plan];
    const [line] = plan.splice(index, 1);
    plan.splice(index + by, 0, line);
    setDraft({ ...draft, plan });
  };

  const addLine = () => {
    planKeys.current += 1;
    setDraft({
      ...draft,
      plan: [
        ...draft.plan,
        { key: planKeys.current, name: "", sets: "3", reps: "10" },
      ],
    });
  };

  const today = localDay(new Date());

  return (
    <div className="space-y-6 p-5">
      <div className="space-y-1">
        <h2 className="er-display text-lg text-foreground">
          {routine ? routine.name : "New routine"}
        </h2>
        {routine ? (
          <p className="text-sm text-foreground">
            {routine.cadenceDays
              ? `${cadenceLabel(routine.cadenceDays)}. Next session ${nextLabel(routine.nextDue, today)}.`
              : "No schedule, so Sigwald won't remind you."}{" "}
            <span className="text-muted-foreground">
              Last done {lastLabel(routine.lastDoneAt, today)}.
            </span>
          </p>
        ) : null}
      </div>

      {routine && !routine.archived ? <LogSession routine={routine} /> : null}
      {routine ? <History routine={routine} /> : null}

      <PaneSection label={routine ? "Plan and schedule" : "What it is"}>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="routine-name">Name</Label>
            <Input
              id="routine-name"
              value={draft.name}
              autoFocus={!routine}
              placeholder="Push day, Long run"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>How often</Label>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[null, ...CADENCE_CHOICES].map((days) => (
                <ChoiceChip
                  key={days ?? "none"}
                  on={sameCadence(draft.cadenceDays, days)}
                  onClick={() => setDraft({ ...draft, cadenceDays: days })}
                >
                  {days ? cadenceLabel(days) : "No schedule"}
                </ChoiceChip>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="routine-minutes">Minutes a session</Label>
            <Input
              id="routine-minutes"
              inputMode="numeric"
              value={draft.minutes}
              onChange={(e) => setDraft({ ...draft, minutes: e.target.value })}
              className="w-24 tabular-nums"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Exercises</Label>
            {draft.plan.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                None planned. A session starts from the last one, so a run can
                stay empty here.
              </p>
            ) : (
              <ol className="space-y-1">
                {draft.plan.map((l, i) => (
                  <li
                    key={l.key}
                    className="grid grid-cols-[minmax(0,1fr)_2.75rem_auto_2.75rem_auto] items-center gap-1"
                  >
                    <Input
                      aria-label="Exercise"
                      value={l.name}
                      placeholder="Bench press"
                      onChange={(e) => setLine(l.key, { name: e.target.value })}
                      className="h-8"
                      autoComplete="off"
                    />
                    <Input
                      aria-label="Sets"
                      inputMode="numeric"
                      value={l.sets}
                      onChange={(e) => setLine(l.key, { sets: e.target.value })}
                      className="h-8 px-1.5 text-center tabular-nums"
                    />
                    <span className="text-xs text-muted-foreground">×</span>
                    <Input
                      aria-label="Reps"
                      inputMode="numeric"
                      value={l.reps}
                      onChange={(e) => setLine(l.key, { reps: e.target.value })}
                      className="h-8 px-1.5 text-center tabular-nums"
                    />
                    <span className="flex gap-0.5 text-muted-foreground">
                      <LineButton
                        label="Move up"
                        disabled={i === 0}
                        onClick={() => moveLine(i, -1)}
                      >
                        ↑
                      </LineButton>
                      <LineButton
                        label="Move down"
                        disabled={i === draft.plan.length - 1}
                        onClick={() => moveLine(i, 1)}
                      >
                        ↓
                      </LineButton>
                      <LineButton
                        label="Remove"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            plan: draft.plan.filter((x) => x.key !== l.key),
                          })
                        }
                      >
                        ×
                      </LineButton>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <div>
              <Button variant="quiet" onClick={addLine}>
                Add an exercise
              </Button>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="routine-notes">Notes</Label>
            <Textarea
              id="routine-notes"
              value={draft.notes}
              rows={3}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {routine ? (
            <Button
              variant="secondary"
              disabled={!dirty || saving}
              onClick={() => void save()}
            >
              Save changes
            </Button>
          ) : (
            <>
              <Button disabled={saving} onClick={() => void save()}>
                Add
              </Button>
              <Button variant="quiet" onClick={() => select(null)}>
                Cancel
              </Button>
            </>
          )}
        </div>
      </PaneSection>

      {routine ? (
        <PaneSection label={routine.archived ? "Archived" : "Archive"}>
          <p className="text-sm text-muted-foreground">
            {routine.archived
              ? "Archived routines keep their history and get no sessions."
              : "Archiving keeps the history and stops the sessions."}
          </p>
          <Button
            variant="quiet"
            onClick={async () => {
              if (
                !(await update(routine.id, { archived: !routine.archived }))
              ) {
                toast.error("Couldn't change that. Try again.");
              } else if (!routine.archived) {
                select(null);
              }
            }}
          >
            {routine.archived ? "Restore" : "Archive"}
          </Button>
        </PaneSection>
      ) : null}
    </div>
  );
}

/**
 * Log the session just done, starting from last time's weights. When the
 * latest session was ticked off elsewhere with nothing entered, this fills
 * that one in instead, so it isn't counted twice.
 */
function LogSession({ routine }: { routine: RoutineRow }) {
  const history = useTrainingStore((s) => s.history[routine.id]);
  const lastUnit = useTrainingStore((s) => s.unit);
  const log = useTrainingStore((s) => s.log);
  const edit = useTrainingStore((s) => s.edit);

  if (!history) {
    return (
      <PaneSection label="Log a session">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </PaneSection>
    );
  }

  const ticked = history[0]?.ticked ? history[0] : null;
  const unit = history.find((w) => !w.ticked)?.unit ?? lastUnit ?? guessUnit();
  const entries = prefillEntries(
    routine.plan,
    history.filter((w) => w !== ticked),
    unit
  );

  return (
    <PaneSection
      label={ticked ? `Fill in ${dayText(ticked.at)}` : "Log a session"}
    >
      {ticked ? (
        <p className="text-sm text-muted-foreground">
          Ticked off {lastLabel(ticked.at, localDay(new Date()))} with nothing
          entered. Say what you did and it&apos;s kept with the rest.
        </p>
      ) : null}
      <SessionForm
        key={`${routine.id}:${history[0]?.id ?? "first"}`}
        initial={{ at: ticked?.at ?? null, unit, note: null, entries }}
        submitLabel={ticked ? "Save" : "Log it"}
        onSubmit={async (input) => {
          const ok = ticked
            ? await edit(ticked, input)
            : await log(routine.id, input);
          if (ok) toast.success("Logged. The next session is planned from it.");
          else toast.error("Couldn't log it. Try again.");
          return ok;
        }}
      />
    </PaneSection>
  );
}

function History({ routine }: { routine: RoutineRow }) {
  const history = useTrainingStore((s) => s.history[routine.id]);
  const loadHistory = useTrainingStore((s) => s.loadHistory);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    void loadHistory(routine.id);
  }, [loadHistory, routine.id]);

  return (
    <PaneSection label="History">
      {!history ? null : history.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
      ) : (
        <ol className="space-y-2.5">
          {history.map((w) =>
            open === w.id ? (
              <li key={w.id}>
                <SessionEditor workout={w} onClose={() => setOpen(null)} />
              </li>
            ) : (
              <li key={w.id} className="text-sm">
                <button
                  type="button"
                  onClick={() => setOpen(w.id)}
                  className="w-full text-left"
                  title="Change this session"
                >
                  <SessionLine workout={w} />
                </button>
              </li>
            )
          )}
        </ol>
      )}
    </PaneSection>
  );
}

/** A session in the history: its day, then what was done. */
export function SessionLine({ workout: w }: { workout: WorkoutRow }) {
  return (
    <>
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        {dayText(w.at)}
      </p>
      <p className="mt-0.5 text-foreground">
        {w.entries.length > 0 ? (
          sessionSummary(w.entries, w.unit)
        ) : w.ticked ? (
          <span className="text-muted-foreground">
            Ticked off, nothing entered yet
          </span>
        ) : (
          "Done"
        )}
      </p>
      {w.note ? (
        <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">
          {w.note}
        </p>
      ) : null}
    </>
  );
}

/** Changing or deleting a session that's already logged. */
export function SessionEditor({
  workout,
  onClose,
}: {
  workout: WorkoutRow;
  onClose?: () => void;
}) {
  const edit = useTrainingStore((s) => s.edit);
  const remove = useTrainingStore((s) => s.remove);
  return (
    <SessionForm
      initial={workout}
      submitLabel="Save"
      emphasis="quiet"
      onSubmit={async (input) => {
        const ok = await edit(workout, input);
        if (ok) onClose?.();
        else toast.error("Couldn't save. Try again.");
        return ok;
      }}
      onDelete={async () => {
        const ok = await remove(workout);
        if (!ok) toast.error("Couldn't delete it. Try again.");
        return ok;
      }}
      onCancel={onClose}
    />
  );
}

function LineButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="h-8 w-5 transition-colors duration-150 hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
    >
      {children}
    </button>
  );
}

export function PaneSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5 border-t border-border pt-4">
      <h3 className="er-label">{label}</h3>
      {children}
    </section>
  );
}
