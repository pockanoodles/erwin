"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * The Courses sheets' shared grammar — the Tasks sheet's, too: 26px ruled
 * rows, a sticky numbered gutter, mono column heads, and a rust frame around
 * the active cell. Every view (Activity, Grades, News, Library) is built from
 * these so they read as one tool.
 */

export const ROW = "h-[26px]";

export const HEAD =
  "sticky top-0 z-20 border-b border-r border-border bg-muted px-2 text-left font-mono text-[10px] font-normal uppercase tracking-wide text-muted-foreground";

export function gutterClass(active: boolean): string {
  return cn(
    ROW,
    "sticky left-0 z-10 border-b border-r border-border px-2 text-right font-mono text-[10px] tabular-nums",
    active ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
  );
}

export function cellClass(active: boolean): string {
  return cn(ROW, "max-w-0 truncate border-b border-r border-border/60 px-2 align-middle", active && "bg-rust/5");
}

/** The active row's title cell: framed in rust, the keyboard focus. */
export function titleCellClass(active: boolean): string {
  return active ? "outline outline-2 -outline-offset-2 outline-rust" : "group-hover:bg-muted/40";
}

/** A band row's full-width cell: a module, an assignment group, a course. */
export const BAND = cn(ROW, "border-b border-border bg-muted/50 px-2 align-middle");

/** Unseen: a lume pip, the watch's own mark for "look here" (rust is reserved for "now"). */
export function UnseenPip({ className }: { className?: string }) {
  return (
    <span
      aria-label="unseen"
      title="Not seen yet"
      className={cn("inline-block h-1.5 w-1.5 flex-none rounded-full bg-lume", className)}
    />
  );
}

/** Mono caps tag for a row's kind or state, optionally coloured by meaning. */
export function Tag({ children, tone }: { children: React.ReactNode; tone?: "danger" | "warn" | "ok" }) {
  return (
    <span
      className={cn(
        "font-mono text-[10px] uppercase tracking-wide",
        tone === "danger"
          ? "text-destructive"
          : tone === "warn"
            ? "text-warning"
            : tone === "ok"
              ? "text-ok"
              : "text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

/** The filter strip above every sheet — same height and padding in every view. */
export function FilterStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[45px] flex-none flex-wrap items-center gap-2 border-b border-border px-2 py-1.5">
      {children}
    </div>
  );
}

export function StripToggle({
  pressed,
  onClick,
  title,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-8 flex-none items-center border border-border px-2 font-mono text-xs uppercase tracking-wide transition-colors duration-150",
        pressed ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function StripCount({ children }: { children: React.ReactNode }) {
  return <span className="px-1 font-mono text-xs tabular-nums text-muted-foreground">{children}</span>;
}

/** Sheet on the left, reading pane on the right (stacked on a phone). */
export function SheetLayout({
  sheet,
  pane,
  label,
  onKeyDown,
}: {
  sheet: React.ReactNode;
  pane: React.ReactNode;
  label: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div
        ref={ref}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label={label}
        className="min-h-0 min-w-0 flex-1 overflow-auto outline-none"
      >
        {sheet}
      </div>
      <section
        aria-label="Reading pane"
        className="flex h-1/2 min-h-0 flex-none flex-col border-t border-border md:h-auto md:w-[46%] md:max-w-[720px] md:border-l md:border-t-0"
      >
        {pane}
      </section>
    </div>
  );
}

/** Keeps the active row in view as the selection moves. */
export function useScrollActiveIntoView(deps: unknown[]): void {
  useEffect(() => {
    document.querySelector("[data-active-row]")?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller names what moves the selection
  }, deps);
}

/**
 * j/k and arrows step through selectable rows, Home/End jump, Enter/o opens.
 * `selectable` lists row indexes in order; `open` handles Enter/o.
 */
export function sheetKeyHandler(options: {
  count: number;
  active: number;
  isSelectable: (i: number) => boolean;
  select: (i: number) => void;
  open?: () => void;
}): (e: React.KeyboardEvent) => boolean {
  const { count, active, isSelectable, select, open } = options;
  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < count; i += dir) if (isSelectable(i)) return i;
    return from;
  };
  return (e) => {
    const go = (i: number) => {
      e.preventDefault();
      if (i >= 0 && i < count && i !== active) select(i);
      return true;
    };
    switch (e.key) {
      case "ArrowDown":
      case "j":
        return go(step(active, 1));
      case "ArrowUp":
      case "k":
        return go(step(active, -1));
      case "Home":
        return go(step(-1, 1));
      case "End":
        return go(step(count, -1));
      case "Enter":
      case "o":
        if (!open) return false;
        e.preventDefault();
        open();
        return true;
      default:
        return false;
    }
  };
}
