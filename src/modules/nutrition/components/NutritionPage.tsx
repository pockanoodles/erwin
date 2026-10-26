"use client";

import { useEffect, useMemo, useState } from "react";

import {
  FilterStrip,
  HEAD,
  ROW,
  SheetLayout,
  StripCount,
  StripToggle,
  cellClass,
  gutterClass,
  sheetKeyHandler,
  titleCellClass,
  useScrollActiveIntoView,
} from "@/components/sheet/sheet";
import { Input } from "@/components/ui/input";

import { daysBetween, localDay, shiftDay } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import {
  AddPanel,
  EntryPane,
  FoodPane,
  TargetsPane,
  servingsText,
} from "@/modules/nutrition/components/NutritionPanes";
import {
  MACROS,
  MACRO_NAMES,
  MACRO_UNITS,
  type Macro,
  type Macros,
  NO_TARGETS,
  type Targets,
  amount,
  dayTotals,
  entryMacros,
  leftLabel,
  leftOf,
} from "@/modules/nutrition/macros";
import { useNutritionStore } from "@/modules/nutrition/store";
import type { EntryRow, FoodRow } from "@/modules/nutrition/types";

type Column = { label: string; width: number | undefined; right?: boolean };

const DAY_COLUMNS: Column[] = [
  { label: "#", width: 44, right: true },
  { label: "Food", width: undefined },
  { label: "Servings", width: 120 },
  { label: "kcal", width: 68, right: true },
  { label: "Protein", width: 68, right: true },
  { label: "Carbs", width: 64, right: true },
  { label: "Fat", width: 56, right: true },
];

const FOOD_COLUMNS: Column[] = [
  { label: "#", width: 44, right: true },
  { label: "Food", width: undefined },
  { label: "Serving", width: 104 },
  { label: "kcal", width: 64, right: true },
  { label: "Protein", width: 68, right: true },
  { label: "Carbs", width: 64, right: true },
  { label: "Fat", width: 56, right: true },
  { label: "Last eaten", width: 104 },
];

/**
 * The Nutrition page: a day's food as a datasheet under that day's totals
 * against the targets, or the saved foods, with the selection whole in the
 * reading pane — the grammar every sheet shares (components/sheet), j/k and
 * arrows included. With nothing selected, a day's pane adds food to it.
 */
export function NutritionPage() {
  const view = useNutritionStore((s) => s.view);
  const day = useNutritionStore((s) => s.day);
  const shown = useNutritionStore((s) => s.shown);
  const foods = useNutritionStore((s) => s.foods);
  const archivedFoods = useNutritionStore((s) => s.archivedFoods);
  const status = useNutritionStore((s) => s.status);
  const selected = useNutritionStore((s) => s.selected);
  const select = useNutritionStore((s) => s.select);
  const setDay = useNutritionStore((s) => s.setDay);
  const load = useNutritionStore((s) => s.load);
  const [archived, setArchived] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  // "Today" moves with the data, so it turns over at midnight on the next load.
  const today = useMemo(() => localDay(new Date()), [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  const entries = shown?.entries ?? [];
  const listedFoods = archived ? archivedFoods : foods;
  const ids =
    view === "day" ? entries.map((e) => e.id) : listedFoods.map((f) => f.id);
  const activeIndex = ids.findIndex((id) => id === selected);

  useScrollActiveIntoView([selected]);
  const onKeyDown = sheetKeyHandler({
    count: ids.length,
    active: activeIndex,
    isSelectable: () => true,
    select: (i) => select(ids[i]),
  });

  const entry =
    view === "day" ? entries.find((e) => e.id === selected) : undefined;
  const food =
    view === "foods"
      ? [...foods, ...archivedFoods].find((f) => f.id === selected)
      : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SheetLayout
        label="Nutrition"
        onKeyDown={(e) => void onKeyDown(e)}
        sheet={
          view === "day" ? (
            <>
              <FilterStrip>
                <StripToggle
                  pressed={false}
                  title="The day before"
                  onClick={() => day && void setDay(shiftDay(day, -1))}
                >
                  ‹
                </StripToggle>
                <Input
                  type="date"
                  aria-label="Day"
                  value={day ?? ""}
                  onChange={(e) =>
                    e.target.value && void setDay(e.target.value)
                  }
                  className="h-8 w-[10.5rem]"
                />
                <StripToggle
                  pressed={false}
                  title="The day after"
                  onClick={() => day && void setDay(shiftDay(day, 1))}
                >
                  ›
                </StripToggle>
                <StripToggle
                  pressed={day === today}
                  onClick={() => void setDay(today)}
                >
                  Today
                </StripToggle>
                <StripCount>
                  {entries.length === 1
                    ? "1 entry"
                    : `${entries.length} entries`}
                </StripCount>
              </FilterStrip>
              <Meters
                eaten={dayTotals(entries)}
                targets={shown?.targets ?? NO_TARGETS}
                onTargets={() => select("targets")}
              />
              <DaySheet
                entries={entries}
                selected={selected}
                onSelect={select}
              />
              {status === "ready" && entries.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  Nothing logged {day === today ? "today" : "this day"}. Add
                  what you eat from the pane.
                </p>
              ) : null}
              {status === "error" ? (
                <p className="p-6 text-sm text-destructive">
                  Nutrition couldn&apos;t load. Try again in a moment.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <FilterStrip>
                <StripToggle
                  pressed={archived}
                  onClick={() => {
                    setArchived(!archived);
                    select(null);
                  }}
                >
                  Archived
                </StripToggle>
                <StripCount>
                  {listedFoods.length === 1
                    ? "1 food"
                    : `${listedFoods.length} foods`}
                </StripCount>
              </FilterStrip>
              <FoodsSheet
                foods={listedFoods}
                today={today}
                selected={selected}
                onSelect={select}
              />
              {status === "ready" && listedFoods.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  {archived
                    ? "No food is archived."
                    : "No saved foods yet. Tick “Save it for next time” when you add one, or make one here."}
                </p>
              ) : null}
            </>
          )
        }
        pane={
          <div className="min-h-0 flex-1 overflow-y-auto">
            {view === "day" ? (
              !day ? null : selected === "targets" ? (
                <TargetsPane
                  key={JSON.stringify(shown?.targets)}
                  targets={shown?.targets ?? NO_TARGETS}
                />
              ) : entry ? (
                <EntryPane key={entry.id} entry={entry} />
              ) : (
                <AddPanel key={day} day={day} />
              )
            ) : selected === "new" ? (
              <FoodPane key="new" food={null} />
            ) : food ? (
              <FoodPane key={food.id} food={food} />
            ) : (
              <div className="space-y-4 p-5">
                <p className="text-sm text-muted-foreground">
                  Select a food to change it, or make one to log in a tap.
                </p>
                <button
                  type="button"
                  onClick={() => select("new")}
                  className="er-brackets h-8 px-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors duration-150 hover:text-foreground"
                >
                  New food
                </button>
              </div>
            )}
          </div>
        }
      />
    </div>
  );
}

/** A day's totals against each target: what's eaten, what's set, what's left. */
function Meters({
  eaten,
  targets,
  onTargets,
}: {
  eaten: Macros;
  targets: Targets;
  onTargets: () => void;
}) {
  const left = leftOf(eaten, targets);
  return (
    <div className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-4">
      {MACROS.map((m) => (
        <Meter
          key={m}
          macro={m}
          eaten={eaten[m]}
          target={targets[m]}
          left={left[m]}
          onTargets={onTargets}
        />
      ))}
    </div>
  );
}

function Meter({
  macro,
  eaten,
  target,
  left,
  onTargets,
}: {
  macro: Macro;
  eaten: number;
  target: number | null;
  left: number | null;
  onTargets: () => void;
}) {
  const unit = MACRO_UNITS[macro];
  const share = target ? Math.min(1, eaten / target) : 0;
  // Past a ceiling (calories, carbs, fat) is worth noticing; past protein isn't.
  const over = left != null && left < 0 && macro !== "protein";
  return (
    <div className="space-y-1.5 bg-background px-3 py-2.5">
      <p className="er-label">{MACRO_NAMES[macro]}</p>
      <p className="text-[13px] tabular-nums text-foreground">
        {amount(eaten)}
        {target != null ? (
          <span className="text-muted-foreground">
            {" "}
            / {amount(target)} {unit}
          </span>
        ) : (
          <span className="text-muted-foreground"> {unit}</span>
        )}
      </p>
      <div className="h-1 bg-line" aria-hidden>
        {target ? (
          <div
            className={cn("h-full", over ? "bg-warning" : "bg-foreground")}
            style={{ width: `${share * 100}%` }}
          />
        ) : null}
      </div>
      {left != null ? (
        <p
          className={cn(
            "font-mono text-[11px] uppercase tracking-wide",
            over ? "text-warning" : "text-muted-foreground"
          )}
        >
          {leftLabel(macro, left)}
        </p>
      ) : (
        <button
          type="button"
          onClick={onTargets}
          className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          Set a target
        </button>
      )}
    </div>
  );
}

function SheetHead({ columns }: { columns: Column[] }) {
  return (
    <>
      <colgroup>
        {columns.map((c) => (
          <col key={c.label} style={c.width ? { width: c.width } : undefined} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={c.label}
              scope="col"
              className={cn(ROW, HEAD, c.right && "text-right")}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
    </>
  );
}

const TABLE =
  "min-w-full table-fixed border-separate border-spacing-0 text-[13px]";

function DaySheet({
  entries,
  selected,
  onSelect,
}: {
  entries: EntryRow[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <table className={TABLE}>
      <SheetHead columns={DAY_COLUMNS} />
      <tbody>
        {entries.map((e, i) => {
          const active = e.id === selected;
          const cell = cellClass(active);
          const total = entryMacros(e);
          const number = cn(cell, "text-right tabular-nums");
          return (
            <tr
              key={e.id}
              onClick={() => onSelect(e.id)}
              aria-selected={active}
              data-active-row={active || undefined}
              className="group cursor-default"
            >
              <td className={gutterClass(active)}>{i + 1}</td>
              <td
                className={cn(
                  cell,
                  titleCellClass(active),
                  "font-medium text-foreground"
                )}
              >
                {e.name}
              </td>
              <td className={cn(cell, "text-muted-foreground")}>
                {servingsText(e.servings, e.serving)}
              </td>
              <td className={cn(number, "text-foreground")}>
                {amount(total.calories)}
              </td>
              <td className={cn(number, "text-muted-foreground")}>
                {amount(total.protein)}
              </td>
              <td className={cn(number, "text-muted-foreground")}>
                {amount(total.carbs)}
              </td>
              <td className={cn(number, "text-muted-foreground")}>
                {amount(total.fat)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** "today", "yesterday", "12 days ago", "never". */
function eatenLabel(at: string | null, today: string): string {
  if (!at) return "never";
  const days = daysBetween(localDay(new Date(at)), today);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function FoodsSheet({
  foods,
  today,
  selected,
  onSelect,
}: {
  foods: FoodRow[];
  today: string;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <table className={TABLE}>
      <SheetHead columns={FOOD_COLUMNS} />
      <tbody>
        {foods.map((f, i) => {
          const active = f.id === selected;
          const cell = cellClass(active);
          const number = cn(cell, "text-right tabular-nums");
          return (
            <tr
              key={f.id}
              onClick={() => onSelect(f.id)}
              aria-selected={active}
              data-active-row={active || undefined}
              className="group cursor-default"
            >
              <td className={gutterClass(active)}>{i + 1}</td>
              <td
                className={cn(
                  cell,
                  titleCellClass(active),
                  "font-medium text-foreground"
                )}
              >
                {f.name}
              </td>
              <td className={cn(cell, "text-muted-foreground")}>{f.serving}</td>
              <td className={cn(number, "text-foreground")}>
                {amount(f.calories)}
              </td>
              <td className={cn(number, "text-muted-foreground")}>
                {amount(f.protein)}
              </td>
              <td className={cn(number, "text-muted-foreground")}>
                {amount(f.carbs)}
              </td>
              <td className={cn(number, "text-muted-foreground")}>
                {amount(f.fat)}
              </td>
              <td className={cn(cell, "tabular-nums text-muted-foreground")}>
                {eatenLabel(f.lastUsedAt, today)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
