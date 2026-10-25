"use client";

import { useEffect, useMemo, useRef } from "react";

import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";

import { agoLabel, cadenceLabel, dueLabel } from "@/modules/people/cadence";
import { PersonPane } from "@/modules/people/components/PersonPane";
import { peopleInView, usePeopleStore } from "@/modules/people/store";
import type { PersonRow } from "@/modules/people/types";

const ROW = "h-[26px]";

const COLUMNS = [
  { label: "#", width: 44 },
  { label: "Name", width: 180 },
  { label: "Org", width: 160 },
  { label: "Role", width: undefined },
  { label: "Every", width: 96 },
  { label: "Last talked", width: 120 },
  { label: "Next", width: 136 },
] as const;

/**
 * The People page: everyone as a datasheet, soonest check-in first, with the
 * selected person whole in the pane beside it — the task sheet's reading
 * model. Arrow keys move the selection.
 */
export function PeoplePage() {
  const view = usePeopleStore((s) => s.view);
  const people = usePeopleStore((s) => s.people);
  const archived = usePeopleStore((s) => s.archived);
  const status = usePeopleStore((s) => s.status);
  const selected = usePeopleStore((s) => s.selected);
  const select = usePeopleStore((s) => s.select);
  const load = usePeopleStore((s) => s.load);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // "Now" moves with the data, so labels refresh whenever anything reloads.
  const now = useMemo(() => new Date(), [people, archived]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(
    () => peopleInView(view, people, archived, now),
    [view, people, archived, now]
  );
  const person: PersonRow | undefined =
    selected && selected !== "new"
      ? [...people, ...archived].find((p) => p.id === selected)
      : undefined;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = rows.findIndex((r) => r.id === selected);
    const next = rows[i < 0 ? 0 : i + (e.key === "ArrowDown" ? 1 : -1)];
    if (next) select(next.id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div
        ref={tableRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="People"
        className="min-h-0 min-w-0 flex-1 overflow-auto outline-none"
      >
        <table className="min-w-full table-fixed border-separate border-spacing-0 text-[13px]">
          <colgroup>
            {COLUMNS.map((c) => (
              <col
                key={c.label}
                style={c.width ? { width: c.width } : undefined}
              />
            ))}
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.map((c, i) => (
                <th
                  key={c.label}
                  scope="col"
                  className={cn(
                    ROW,
                    "sticky top-0 z-10 border-b border-r border-border bg-muted px-2 text-left",
                    "font-mono text-[10px] font-normal uppercase tracking-wide text-muted-foreground",
                    i === 0 && "text-right"
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <PersonSheetRow
                key={p.id}
                index={i + 1}
                person={p}
                now={now}
                active={p.id === selected}
                onSelect={() => {
                  select(p.id);
                  tableRef.current?.focus();
                }}
              />
            ))}
          </tbody>
        </table>
        {status === "ready" && rows.length === 0 ? (
          <EmptyState view={view} onAdd={() => select("new")} />
        ) : null}
        {status === "error" ? (
          <p className="p-6 text-sm text-destructive">
            People couldn&apos;t load. Try again in a moment.
          </p>
        ) : null}
      </div>

      <aside
        aria-label="Person"
        className="flex-none overflow-y-auto border-t border-border lg:w-[420px] lg:border-l lg:border-t-0"
      >
        {selected === "new" ? (
          <PersonPane key="new" person={null} />
        ) : person ? (
          <PersonPane key={person.id} person={person} />
        ) : (
          <p className="p-5 text-sm text-muted-foreground">
            Select someone to see them here.
          </p>
        )}
      </aside>
    </div>
  );
}

function PersonSheetRow({
  index,
  person: p,
  now,
  active,
  onSelect,
}: {
  index: number;
  person: PersonRow;
  now: Date;
  active: boolean;
  onSelect: () => void;
}) {
  const next = p.nextCheckIn ? new Date(p.nextCheckIn) : null;
  const overdue = next != null && next.getTime() < now.getTime();
  const cell = cn(
    ROW,
    "truncate border-b border-r border-border/60 px-2",
    active ? "bg-rust/5" : "group-hover:bg-muted/40"
  );
  return (
    <tr
      onClick={onSelect}
      aria-selected={active}
      className="group cursor-default"
    >
      <td
        className={cn(
          ROW,
          "border-b border-r border-border px-2 text-right font-mono text-[10px] tabular-nums",
          active
            ? "bg-accent text-accent-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        {index}
      </td>
      <td className={cn(cell, "font-medium text-foreground")}>{p.name}</td>
      <td className={cn(cell, "text-muted-foreground")}>{p.org}</td>
      <td className={cn(cell, "text-muted-foreground")}>{p.role}</td>
      <td className={cn(cell, "text-muted-foreground")}>
        {p.cadenceDays ? cadenceLabel(p.cadenceDays) : ""}
      </td>
      <td className={cn(cell, "tabular-nums text-muted-foreground")}>
        {agoLabel(p.lastContactAt ? new Date(p.lastContactAt) : null, now)}
      </td>
      <td
        className={cn(
          cell,
          "tabular-nums",
          overdue ? "font-medium text-destructive" : "text-muted-foreground"
        )}
      >
        {dueLabel(next, now)}
      </td>
    </tr>
  );
}

function EmptyState({
  view,
  onAdd,
}: {
  view: "all" | "due" | "archived";
  onAdd: () => void;
}) {
  if (view === "due") {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        No one is due a check-in this week.
      </p>
    );
  }
  if (view === "archived") {
    return (
      <p className="p-6 text-sm text-muted-foreground">No one is archived.</p>
    );
  }
  return (
    <div className="max-w-xl space-y-5 p-6 md:p-10">
      <p className="er-label">No one here yet</p>
      <p className="text-lg leading-relaxed text-foreground">
        Add the people you want to keep in touch with. Give someone a cadence
        and Erwin puts a reach-out in Today when it&apos;s time.
      </p>
      <Button onClick={onAdd}>Add person</Button>
    </div>
  );
}
