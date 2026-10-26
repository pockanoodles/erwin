"use client";

import { useEffect, useMemo, useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { localDay } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import {
  MACROS,
  MACRO_NAMES,
  MACRO_UNITS,
  type Macro,
  type Targets,
  amount,
  dayTitle,
  entryMacros,
} from "@/modules/nutrition/macros";
import { useNutritionStore } from "@/modules/nutrition/store";
import type { EntryRow, FoodInput, FoodRow } from "@/modules/nutrition/types";

/** A food as typed: numbers stay text until it's sent, so a field can sit empty mid-edit. */
export type FoodDraft = Record<"name" | "serving" | Macro, string>;

export const EMPTY_FOOD: FoodDraft = {
  name: "",
  serving: "",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
};

const numberText = (n: number) =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);

export const draftOfFood = (f: FoodInput): FoodDraft => ({
  name: f.name,
  serving: f.serving ?? "",
  calories: numberText(f.calories),
  protein: numberText(f.protein),
  carbs: numberText(f.carbs),
  fat: numberText(f.fat),
});

const parse = (s: string) => {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** The food a draft describes, or why it can't be saved yet. */
export function foodOfDraft(d: FoodDraft): FoodInput | string {
  if (!d.name.trim()) return "A food needs a name.";
  const calories = parse(d.calories);
  if (calories == null) return "Say how many calories a serving has.";
  return {
    name: d.name.trim(),
    serving: d.serving.trim() || null,
    calories,
    protein: parse(d.protein) ?? 0,
    carbs: parse(d.carbs) ?? 0,
    fat: parse(d.fat) ?? 0,
  };
}

/** "1.5 × 1 cup", "2", "1 bar". */
export function servingsText(servings: number, serving: string | null) {
  const n = numberText(servings);
  if (!serving) return n === "1" ? "1 serving" : `${n} servings`;
  return n === "1" ? serving : `${n} × ${serving}`;
}

/** Name, serving and the four amounts per serving. */
export function FoodFields({
  value,
  onChange,
  idPrefix,
  autoFocus,
}: {
  value: FoodDraft;
  onChange: (next: FoodDraft) => void;
  idPrefix: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-name`}>Food</Label>
          <Input
            id={`${idPrefix}-name`}
            value={value.name}
            autoFocus={autoFocus}
            placeholder="Greek yogurt"
            autoComplete="off"
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-serving`}>Serving</Label>
          <Input
            id={`${idPrefix}-serving`}
            value={value.serving}
            placeholder="1 cup"
            autoComplete="off"
            onChange={(e) => onChange({ ...value, serving: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {MACROS.map((m) => (
          <div key={m} className="grid gap-1.5">
            <Label htmlFor={`${idPrefix}-${m}`}>
              {MACRO_NAMES[m]}{" "}
              <span className="text-muted-foreground">{MACRO_UNITS[m]}</span>
            </Label>
            <Input
              id={`${idPrefix}-${m}`}
              inputMode="decimal"
              value={value[m]}
              placeholder="0"
              onChange={(e) => onChange({ ...value, [m]: e.target.value })}
              className="text-right tabular-nums"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ServingsInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Servings</Label>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 text-right tabular-nums"
      />
    </div>
  );
}

const servingsOf = (s: string) => {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** What a day's pane offers with nothing selected: the usual foods, and a new one. */
export function AddPanel({ day }: { day: string }) {
  const foods = useNutritionStore((s) => s.foods);
  const add = useNutritionStore((s) => s.add);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<FoodDraft>(EMPTY_FOOD);
  const [servings, setServings] = useState("1");
  const [save, setSave] = useState(true);
  const [busy, setBusy] = useState(false);
  const title = dayTitle(day, localDay(new Date()));
  // "Add to today", "Add to Sat, Oct 24".
  const where = /^(Today|Yesterday|Tomorrow)$/.test(title)
    ? title.toLowerCase()
    : title;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return foods
      .filter((f) => !q || f.name.toLowerCase().includes(q))
      .slice(0, 12);
  }, [foods, query]);

  const quickAdd = async (food: FoodRow) => {
    if (await add({ day, foodId: food.id, servings: 1 })) {
      toast.success(`Added ${food.name}.`);
    } else {
      toast.error("Couldn't add it. Try again.");
    }
  };

  const addNew = async () => {
    const food = foodOfDraft(draft);
    const n = servingsOf(servings);
    if (typeof food === "string") return void toast.error(food);
    if (n == null) return void toast.error("Servings is a number above 0.");
    setBusy(true);
    const ok = await add({ day, servings: n, food, save });
    setBusy(false);
    if (ok) {
      setDraft(EMPTY_FOOD);
      setServings("1");
      toast.success(`Added ${food.name}.`);
    } else {
      toast.error("Couldn't add it. Try again.");
    }
  };

  return (
    <div className="space-y-6 p-5">
      <h2 className="er-display text-lg text-foreground">Add to {where}</h2>
      <PaneSection label="Your foods">
        <Input
          aria-label="Search your foods"
          placeholder="Search your foods"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        {matches.length > 0 ? (
          <ul>
            {matches.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-3 border-t border-border py-1.5 text-sm first:border-t-0"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-foreground">{f.name}</span>
                  {f.serving ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {f.serving}
                    </span>
                  ) : null}
                </span>
                <span className="flex-none tabular-nums text-muted-foreground">
                  {amount(f.calories)} kcal · {amount(f.protein)} g protein
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void quickAdd(f)}
                  aria-label={`Add ${f.name}`}
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {foods.length > 0
              ? "No saved food matches. Add it below."
              : "Foods you save show up here, the usual ones first."}
          </p>
        )}
      </PaneSection>
      <PaneSection label="Something new">
        <FoodFields value={draft} onChange={setDraft} idPrefix="new-food" />
        <div className="flex flex-wrap items-end gap-4">
          <ServingsInput
            id="new-servings"
            value={servings}
            onChange={setServings}
          />
          <label className="flex h-9 items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={save}
              onChange={(e) => setSave(e.target.checked)}
              className="h-4 w-4 accent-[var(--er-ink)]"
            />
            Save it for next time
          </label>
        </div>
        <Button disabled={busy} onClick={() => void addNew()}>
          Add
        </Button>
      </PaneSection>
    </div>
  );
}

/** One thing eaten: change its servings or amounts, or delete it. */
export function EntryPane({ entry }: { entry: EntryRow }) {
  const editEntry = useNutritionStore((s) => s.editEntry);
  const removeEntry = useNutritionStore((s) => s.removeEntry);
  const select = useNutritionStore((s) => s.select);
  const base = useMemo(
    () => ({ food: draftOfFood(entry), servings: numberText(entry.servings) }),
    [entry]
  );
  const [draft, setDraft] = useState(base.food);
  const [servings, setServings] = useState(base.servings);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    setDraft(base.food);
    setServings(base.servings);
  }, [base]);

  const dirty =
    JSON.stringify(draft) !== JSON.stringify(base.food) ||
    servings !== base.servings;
  const total = entryMacros(entry);

  const save = async () => {
    const food = foodOfDraft(draft);
    const n = servingsOf(servings);
    if (typeof food === "string") return void toast.error(food);
    if (n == null) return void toast.error("Servings is a number above 0.");
    setBusy(true);
    const ok = await editEntry(entry.id, { ...food, servings: n });
    setBusy(false);
    if (!ok) toast.error("Couldn't save. Try again.");
  };

  const remove = async () => {
    if (!armed) return setArmed(true);
    setBusy(true);
    const ok = await removeEntry(entry.id);
    setBusy(false);
    if (!ok) toast.error("Couldn't delete it. Try again.");
  };

  return (
    <div className="space-y-6 p-5">
      <div className="space-y-1">
        <h2 className="er-display text-lg text-foreground">{entry.name}</h2>
        <p className="text-sm text-foreground">
          {servingsText(entry.servings, entry.serving)}:{" "}
          <span className="tabular-nums">
            {amount(total.calories)} kcal · {amount(total.protein)} g protein ·{" "}
            {amount(total.carbs)} g carbs · {amount(total.fat)} g fat
          </span>
        </p>
      </div>
      <PaneSection label="Change it">
        <ServingsInput
          id="entry-servings"
          value={servings}
          onChange={setServings}
        />
        <p className="text-xs text-muted-foreground">
          Amounts are per serving. Changing them here changes only this entry.
        </p>
        <FoodFields value={draft} onChange={setDraft} idPrefix="entry" />
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            variant="secondary"
            disabled={!dirty || busy}
            onClick={() => void save()}
          >
            Save changes
          </Button>
          <Button
            variant="quiet"
            disabled={busy}
            onClick={() => void remove()}
            className={cn(armed && "text-destructive hover:text-destructive")}
          >
            {armed ? "Delete it" : "Delete"}
          </Button>
          <Button variant="quiet" onClick={() => select(null)}>
            Add something else
          </Button>
        </div>
      </PaneSection>
    </div>
  );
}

const targetText = (n: number | null) => (n == null ? "" : String(n));

/** The daily targets. One left empty isn't tracked. */
export function TargetsPane({ targets }: { targets: Targets }) {
  const setTargets = useNutritionStore((s) => s.setTargets);
  const select = useNutritionStore((s) => s.select);
  const [draft, setDraft] = useState<Record<Macro, string>>(() => ({
    calories: targetText(targets.calories),
    protein: targetText(targets.protein),
    carbs: targetText(targets.carbs),
    fat: targetText(targets.fat),
  }));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const next = {} as Targets;
    for (const m of MACROS) {
      const raw = draft[m].trim();
      const n = raw ? Number.parseInt(raw, 10) : null;
      if (raw && (n == null || !Number.isFinite(n) || n < 0)) {
        return void toast.error(
          `${MACRO_NAMES[m]} is a whole number, or empty.`
        );
      }
      next[m] = n;
    }
    setBusy(true);
    const ok = await setTargets(next);
    setBusy(false);
    if (ok) {
      toast.success("Targets saved.");
      select(null);
    } else {
      toast.error("Couldn't save. Try again.");
    }
  };

  return (
    <div className="space-y-6 p-5">
      <h2 className="er-display text-lg text-foreground">Daily targets</h2>
      <PaneSection label="Each day">
        <div className="grid grid-cols-2 gap-3">
          {MACROS.map((m) => (
            <div key={m} className="grid gap-1.5">
              <Label htmlFor={`target-${m}`}>
                {MACRO_NAMES[m]}{" "}
                <span className="text-muted-foreground">{MACRO_UNITS[m]}</span>
              </Label>
              <Input
                id={`target-${m}`}
                inputMode="numeric"
                value={draft[m]}
                placeholder="Not tracked"
                onChange={(e) => setDraft({ ...draft, [m]: e.target.value })}
                className="text-right tabular-nums"
              />
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Leave one empty and it isn&apos;t tracked. The top bar counts down
          protein, or calories when protein has no target.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void save()}
          >
            Save targets
          </Button>
          <Button variant="quiet" onClick={() => select(null)}>
            Cancel
          </Button>
        </div>
      </PaneSection>
    </div>
  );
}

/** A saved food: change it, log it today, or archive it. With none, a new one. */
export function FoodPane({ food }: { food: FoodRow | null }) {
  const saveFood = useNutritionStore((s) => s.saveFood);
  const updateFood = useNutritionStore((s) => s.updateFood);
  const add = useNutritionStore((s) => s.add);
  const select = useNutritionStore((s) => s.select);
  const base = useMemo(() => (food ? draftOfFood(food) : EMPTY_FOOD), [food]);
  const [draft, setDraft] = useState(base);
  const [busy, setBusy] = useState(false);

  useEffect(() => setDraft(base), [base]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);

  const save = async () => {
    const input = foodOfDraft(draft);
    if (typeof input === "string") return void toast.error(input);
    setBusy(true);
    if (food) {
      if (!(await updateFood(food.id, input))) {
        toast.error("Couldn't save. Try again.");
      }
    } else {
      const saved = await saveFood(input);
      if (saved) select(saved.id);
      else toast.error("Couldn't save. Try again.");
    }
    setBusy(false);
  };

  return (
    <div className="space-y-6 p-5">
      <div className="space-y-1">
        <h2 className="er-display text-lg text-foreground">
          {food ? food.name : "New food"}
        </h2>
        {food ? (
          <p className="text-sm tabular-nums text-muted-foreground">
            {food.serving ? `${food.serving}: ` : "A serving: "}
            {amount(food.calories)} kcal · {amount(food.protein)} g protein ·{" "}
            {amount(food.carbs)} g carbs · {amount(food.fat)} g fat
          </p>
        ) : null}
      </div>
      {food && !food.archived ? (
        <PaneSection label="Eat it">
          <Button
            onClick={async () => {
              const ok = await add({
                day: localDay(new Date()),
                foodId: food.id,
                servings: 1,
              });
              if (ok) toast.success(`Added ${food.name} to today.`);
              else toast.error("Couldn't add it. Try again.");
            }}
          >
            Add to today
          </Button>
        </PaneSection>
      ) : null}
      <PaneSection label={food ? "Change it" : "What it is"}>
        <FoodFields
          value={draft}
          onChange={setDraft}
          idPrefix="food"
          autoFocus={!food}
        />
        {food ? (
          <p className="text-xs text-muted-foreground">
            What&apos;s already logged keeps the amounts it was logged with.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            variant={food ? "secondary" : "default"}
            disabled={(food != null && !dirty) || busy}
            onClick={() => void save()}
          >
            {food ? "Save changes" : "Save"}
          </Button>
          {!food ? (
            <Button variant="quiet" onClick={() => select(null)}>
              Cancel
            </Button>
          ) : null}
        </div>
      </PaneSection>
      {food ? (
        <PaneSection label={food.archived ? "Archived" : "Archive"}>
          <p className="text-sm text-muted-foreground">
            {food.archived
              ? "Archived foods stay in what you've logged and leave the quick list."
              : "Archiving takes it off the quick list. What you've logged stays."}
          </p>
          <Button
            variant="quiet"
            onClick={async () => {
              if (!(await updateFood(food.id, { archived: !food.archived }))) {
                toast.error("Couldn't change that. Try again.");
              } else {
                select(null);
              }
            }}
          >
            {food.archived ? "Restore" : "Archive"}
          </Button>
        </PaneSection>
      ) : null}
    </div>
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
