"use client";

import type { ButtonHTMLAttributes, ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The vocabulary every page uses to furnish the app top bar.
 *
 * The point of these is consistency, not convenience: before the bar existed
 * each page drew its own switcher and its own buttons, so Calendar's segmented
 * control was sentence-case cobalt at one height and Tasks' was mono-uppercase
 * inverted at another. They sit side by side in the same 44px strip now and
 * any difference between them reads as a bug. Pages compose these; pages do
 * not style bar controls themselves.
 *
 * The field kit (brand/BRAND.md) sets the parts: the page's one primary action
 * is a rust plate with two corners cut, because rust means "now" and that
 * button is what you do now. Everything else is quiet: secondary actions sit
 * in corner brackets, and an active segment is an ink plate, which is louder
 * than hover and quieter than the accent.
 */

/** Every interactive control in the bar. 28px inside a 44px bar. */
const CONTROL_HEIGHT = "h-7";

/** Chivo Mono caps, the label voice. 12px is the readability floor. */
const LABEL = "font-mono text-xs font-semibold uppercase tracking-[0.08em]";

/** Escape hatch for `data-*` test hooks and ARIA the wrappers don't name. */
type BarPassthrough = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "title" | "children" | "className" | "type"
>;

export function BarDivider() {
  return <span aria-hidden className="h-4 w-px flex-none bg-border" />;
}

export function BarButton({
  onClick,
  children,
  title,
  emphasis = "quiet",
  ...rest
}: {
  onClick: () => void;
  children: ReactNode;
  title?: string;
  /** `loud` is for the page's one primary action, e.g. Create Task. */
  emphasis?: "quiet" | "loud";
} & BarPassthrough) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        CONTROL_HEIGHT,
        LABEL,
        "flex flex-none items-center px-3 transition-colors duration-150",
        emphasis === "loud"
          ? "er-plate text-rust-foreground hover:[--plate:var(--er-accent-text)]"
          : "er-brackets text-muted-foreground hover:text-foreground",
        // Unavailable here, not gone: it keeps its place and reads as such.
        "aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:text-muted-foreground aria-disabled:hover:[--bracket:var(--er-muted)]"
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function BarIconButton({
  onClick,
  icon: Icon,
  label,
  title,
  pressed,
  ...rest
}: {
  onClick: () => void;
  icon: ComponentType<{ className?: string }>;
  /** Accessible name — these are icon-only. */
  label: string;
  title?: string;
  pressed?: boolean;
} & Omit<BarPassthrough, "aria-label" | "aria-pressed">) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={title ?? label}
      className={cn(
        CONTROL_HEIGHT,
        "flex w-7 flex-none items-center justify-center text-muted-foreground transition-colors duration-150 hover:text-foreground"
      )}
      {...rest}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export interface BarSegment<T extends string> {
  id: T;
  label: string;
  icon?: ComponentType<{ className?: string }>;
}

export function BarSegmented<T extends string>({
  segments,
  value,
  onChange,
  label,
}: {
  segments: ReadonlyArray<BarSegment<T>>;
  value: T;
  onChange: (id: T) => void;
  /** Names the group for screen readers, e.g. "Calendar view". */
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-none items-center gap-1"
    >
      {segments.map(({ id, label: text, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={value === id}
          className={cn(
            CONTROL_HEIGHT,
            LABEL,
            "er-plate er-plate-sm flex items-center gap-1.5 px-2.5 transition-colors duration-150",
            value === id
              ? "text-background [--plate:var(--er-ink)]"
              : "text-muted-foreground [--plate:var(--er-surface)] hover:text-foreground hover:[--plate:var(--er-hover)]"
          )}
        >
          {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
          {text}
        </button>
      ))}
    </div>
  );
}
