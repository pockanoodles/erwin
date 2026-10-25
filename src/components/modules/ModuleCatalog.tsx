"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";

import { MODULES, isModuleId } from "@/modules";
import { CLIENT_MODULES } from "@/modules/client";
import type { ModuleId, ModuleManifest } from "@/modules/types";

import { useModulesStore } from "@/store/modules";

const ROW = "h-[26px]";

/**
 * The catalog: every module this build ships, as a datasheet, with the
 * selected one shown whole in the pane beside it — the same reading model as
 * the task sheet, where a cell truncates and the pane doesn't.
 *
 * Rows stay in catalog order whatever is on, so turning one on never moves
 * the row under your pointer. The rail order is set from the pane.
 */
export function ModuleCatalog() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const states = useModulesStore((s) => s.states);
  const known = useModulesStore((s) => s.known);
  const load = useModulesStore((s) => s.load);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void load({ force: true });
  }, [load]);

  const param = searchParams.get("module");
  const selectedId: ModuleId =
    param && isModuleId(param) ? param : MODULES[0].id;
  const selected = MODULES.find((m) => m.id === selectedId) ?? MODULES[0];

  const select = useCallback(
    (id: ModuleId) => {
      router.replace(`${pathname}?module=${id}`, { scroll: false });
    },
    [pathname, router]
  );

  const isOn = useCallback(
    (id: ModuleId) => known && states.some((s) => s.id === id && s.on),
    [known, states]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = MODULES.findIndex((m) => m.id === selectedId);
    const next = MODULES[i + (e.key === "ArrowDown" ? 1 : -1)];
    if (next) select(next.id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div
        ref={tableRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="Modules"
        className="min-h-0 min-w-0 flex-1 overflow-auto outline-none"
      >
        <table className="min-w-full table-fixed border-separate border-spacing-0 text-[13px]">
          <colgroup>
            <col style={{ width: 44 }} />
            <col style={{ width: 132 }} />
            <col />
            <col style={{ width: 220 }} />
            <col style={{ width: 96 }} />
          </colgroup>
          <thead>
            <tr>
              {["#", "Module", "Adds", "Sends data to", "State"].map(
                (label, i) => (
                  <th
                    key={label}
                    scope="col"
                    className={cn(
                      ROW,
                      "sticky top-0 z-10 border-b border-r border-border bg-muted px-2 text-left",
                      "font-mono text-[10px] font-normal uppercase tracking-wide text-muted-foreground",
                      i === 0 && "text-right"
                    )}
                  >
                    {label}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {MODULES.map((m, i) => (
              <CatalogRow
                key={m.id}
                index={i + 1}
                module={m}
                on={isOn(m.id)}
                known={known}
                active={m.id === selectedId}
                onSelect={() => {
                  select(m.id);
                  tableRef.current?.focus();
                }}
              />
            ))}
          </tbody>
        </table>
        <p className="max-w-2xl px-3 py-4 text-xs leading-relaxed text-muted-foreground">
          Today, Focus, Calendar and Tasks are always there. Modules add to
          them, and you can turn one off at any time: it leaves the rail and
          stops working, and nothing it stored is deleted.
        </p>
      </div>

      <aside
        aria-label={`${selected.name} module`}
        className="flex-none overflow-y-auto border-t border-border lg:w-[420px] lg:border-l lg:border-t-0"
      >
        <ModulePane module={selected} on={isOn(selected.id)} known={known} />
      </aside>
    </div>
  );
}

function CatalogRow({
  index,
  module: m,
  on,
  known,
  active,
  onSelect,
}: {
  index: number;
  module: ModuleManifest;
  on: boolean;
  known: boolean;
  active: boolean;
  onSelect: () => void;
}) {
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
      <td className={cn(cell, "font-medium text-foreground")}>{m.name}</td>
      <td className={cn(cell, "text-muted-foreground")}>{m.adds[0]}</td>
      <td className={cn(cell, "text-muted-foreground")}>
        {m.egress.length > 0
          ? m.egress.map((e) => e.to).join(", ")
          : "Nothing leaves Erwin"}
      </td>
      <td className={cell}>
        {known ? (
          <span
            className={cn(
              "er-bracketed font-mono text-[11px] uppercase tracking-[0.08em]",
              on ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {on ? "On" : "Off"}
          </span>
        ) : null}
      </td>
    </tr>
  );
}

function ModulePane({
  module: m,
  on,
  known,
}: {
  module: ModuleManifest;
  on: boolean;
  known: boolean;
}) {
  const setOn = useModulesStore((s) => s.setOn);
  const move = useModulesStore((s) => s.move);
  const states = useModulesStore((s) => s.states);
  const Settings = CLIENT_MODULES[m.id].Settings;

  const onIds = useMemo(
    () => states.filter((s) => s.on).map((s) => s.id),
    [states]
  );
  const railIndex = onIds.indexOf(m.id);

  const toggle = async (next: boolean) => {
    const ok = await setOn(m.id, next);
    if (!ok) {
      toast.error(`Couldn't turn ${m.name} ${next ? "on" : "off"}. Try again.`);
    }
  };

  return (
    <div className="space-y-6 p-5">
      <div className="space-y-2">
        <h2 className="er-display text-lg text-foreground">{m.name}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {m.summary}
        </p>
      </div>

      {known ? (
        <div className="flex flex-wrap items-center gap-3">
          {on ? (
            <>
              {m.page ? (
                <Button asChild>
                  <Link href={m.page.href}>Open {m.name}</Link>
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => void toggle(false)}>
                Turn off
              </Button>
            </>
          ) : (
            <Button onClick={() => void toggle(true)}>Turn on</Button>
          )}
        </div>
      ) : null}

      <PaneSection label="Adds">
        <ul className="space-y-1.5 text-sm text-foreground">
          {m.adds.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden className="text-muted-foreground">
                ·
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </PaneSection>

      <PaneSection label="Keeps">
        <p className="text-sm text-foreground">{m.keeps}</p>
      </PaneSection>

      <PaneSection label="Sends out of Erwin">
        {m.egress.length === 0 ? (
          <p className="text-sm text-foreground">
            Nothing. Everything it does stays in Erwin.
          </p>
        ) : (
          <ul className="space-y-3">
            {m.egress.map((e) => (
              <li key={e.to} className="text-sm">
                <p className="font-medium text-foreground">{e.to}</p>
                <p className="text-muted-foreground">
                  {e.sends}. {e.why}
                </p>
              </li>
            ))}
          </ul>
        )}
      </PaneSection>

      {on && railIndex >= 0 && onIds.length > 1 ? (
        <PaneSection label="Place in the rail">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {railIndex + 1} of {onIds.length}
            </span>
            <Button
              variant="quiet"
              disabled={railIndex === 0}
              onClick={() => void move(m.id, -1)}
            >
              Up
            </Button>
            <Button
              variant="quiet"
              disabled={railIndex === onIds.length - 1}
              onClick={() => void move(m.id, 1)}
            >
              Down
            </Button>
          </div>
        </PaneSection>
      ) : null}

      {Settings ? (
        <PaneSection label="Settings">
          {on ? (
            <Settings />
          ) : (
            <p className="text-sm text-muted-foreground">
              Turn {m.name} on to set it up.
            </p>
          )}
        </PaneSection>
      ) : null}
    </div>
  );
}

function PaneSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 border-t border-border pt-4">
      <h3 className="er-label">{label}</h3>
      {children}
    </section>
  );
}
