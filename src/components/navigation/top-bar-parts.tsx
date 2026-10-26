"use client";

import type { ButtonHTMLAttributes, ComponentType } from "react";

import { HiChevronDown } from "react-icons/hi";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  icon: Icon,
  ...rest
}: {
  onClick: () => void;
  /** The button's words; with an icon, also its name on a phone. */
  children: string;
  title?: string;
  /** `loud` is for the page's one primary action, e.g. Create Task. */
  emphasis?: "quiet" | "loud";
  /**
   * Below desktop width the button shows only this, so a page's actions
   * leave room in a narrow bar for the page's views.
   */
  icon?: ComponentType<{ className?: string }>;
} & BarPassthrough) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? (Icon ? children : undefined)}
      aria-label={Icon ? children : undefined}
      className={cn(
        CONTROL_HEIGHT,
        LABEL,
        "flex flex-none items-center transition-colors duration-150",
        Icon ? "px-2 lg:px-3" : "px-3",
        emphasis === "loud"
          ? "er-plate text-rust-foreground hover:[--plate:var(--er-accent-text)]"
          : "er-brackets text-muted-foreground hover:text-foreground",
        // Unavailable here, not gone: it keeps its place and reads as such.
        "aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:text-muted-foreground aria-disabled:hover:[--bracket:var(--er-muted)]"
      )}
      {...rest}
    >
      {Icon ? <Icon aria-hidden className="h-4 w-4 lg:hidden" /> : null}
      <span className={Icon ? "hidden lg:inline" : undefined}>{children}</span>
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

/**
 * A view switcher. Below desktop width it's one menu in the same place,
 * showing the view you're on: a row of segments doesn't fit a phone's bar,
 * and a strip that scrolls sideways hides whatever is past its edge.
 */
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
  const current = segments.find((s) => s.id === value) ?? segments[0];
  const CurrentIcon = current?.icon;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${label}: ${current?.label ?? ""}`}
            className={cn(
              CONTROL_HEIGHT,
              LABEL,
              "er-plate er-plate-sm flex flex-none items-center gap-1.5 px-2.5 text-background [--plate:var(--er-ink)] lg:hidden"
            )}
          >
            {CurrentIcon ? <CurrentIcon className="h-3.5 w-3.5" /> : null}
            {current?.label}
            <HiChevronDown aria-hidden className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="rounded-none">
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={(id) => onChange(id as T)}
          >
            {segments.map(({ id, label: text }) => (
              <DropdownMenuRadioItem key={id} value={id} className={LABEL}>
                {text}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <BarSegmentRow
        segments={segments}
        value={value}
        onChange={onChange}
        label={label}
      />
    </>
  );
}

function BarSegmentRow<T extends string>({
  segments,
  value,
  onChange,
  label,
}: {
  segments: ReadonlyArray<BarSegment<T>>;
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="hidden flex-none items-center gap-1 lg:flex"
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
