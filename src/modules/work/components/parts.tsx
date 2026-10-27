"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { formatEventTime } from "@/lib/calendar-event-display";
import { localDay, shiftDay } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import { formatHours } from "@/modules/work/hours";
import type { ContactRow, JobLink, ShiftRow } from "@/modules/work/types";

import { useSettingsStore } from "@/store/settings";

import type { TimeFormat } from "@/types/settings";

/**
 * What the Work page's sheets and panes share: how times, days, hours and
 * money read, and the few controls every pane uses.
 */

/** The person's 12h/24h choice, as the calendar reads it. */
export function useTimeFormat(): TimeFormat {
  return useSettingsStore((s) => s.user.timeFormat);
}

export const timeText = (at: string, format: TimeFormat) =>
  formatEventTime(new Date(at), format);

/** "8:45 PM – 12:15 AM": when it ran where that was changed, else as scheduled. */
export function spanText(
  s: Pick<ShiftRow, "start" | "end" | "workedStart" | "workedEnd">,
  format: TimeFormat
): string {
  return `${timeText(s.workedStart ?? s.start, format)} – ${timeText(
    s.workedEnd ?? s.end,
    format
  )}`;
}

/** "7.5 h". */
export const hoursText = (hours: number) => `${formatHours(hours)} h`;

const dateOf = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** "Mon, Oct 27" for a "yyyy-MM-dd" day. */
export const dayText = (day: string) =>
  dateOf(day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

/** "Mon, Oct 27" for a moment, on its local day. */
export const momentDayText = (at: string) => dayText(localDay(new Date(at)));

/** "Oct 13 – 26", "Oct 27 – Nov 9". */
export const rangeText = (first: string, last: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).formatRange(dateOf(first), dateOf(last));

/** Pay in the job's own currency, before tax. */
export function moneyText(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** A currency code Intl knows, so pay can be shown in it. */
export function isCurrency(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat(undefined, { style: "currency", currency: code });
    return true;
  } catch {
    return false;
  }
}

/** The job's links with its timesheet first: the one a pay period needs. */
export function linksInOrder(links: JobLink[]): JobLink[] {
  const timesheet = (l: JobLink) => /time\s?sheet/i.test(l.label);
  return [...links.filter(timesheet), ...links.filter((l) => !timesheet(l))];
}

/**
 * Where a saved link goes: as typed when it's a web address, with https
 * added when it has no scheme, and nowhere for any other scheme.
 */
export function linkHref(url: string): string | null {
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null;
  return `https://${u}`;
}

export const linkName = (l: JobLink) =>
  l.label.trim() || l.url.replace(/^https?:\/\//i, "").split("/")[0];

/** A phone number as tel: and sms: links take it. */
export const dialable = (phone: string) => phone.replace(/[^\d+]/g, "");

// ── Typing times ──────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

/** "20:45": a moment's time here, as a time field holds it. */
export const clockOf = (at: string) => {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const CLOCK = /^\d{2}:\d{2}$/;

const momentOf = (day: string, clock: string) => new Date(`${day}T${clock}:00`);

/** A day and a time of day here, as a moment; null until both are whole. */
export function atOn(day: string, clock: string): Date | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && CLOCK.test(clock)
    ? momentOf(day, clock)
    : null;
}

/** The moment at a time of day nearest `near`: a clock-in a little before midnight stays the day before. */
export function nearestAt(clock: string, near: Date): Date | null {
  if (!CLOCK.test(clock)) return null;
  const day = localDay(near);
  return [-1, 0, 1]
    .map((by) => momentOf(shiftDay(day, by), clock))
    .reduce((best, c) =>
      Math.abs(c.getTime() - near.getTime()) <
      Math.abs(best.getTime() - near.getTime())
        ? c
        : best
    );
}

/** The first moment at a time of day after `after`: an end past midnight is the next morning. */
export function nextAt(clock: string, after: Date): Date | null {
  if (!CLOCK.test(clock)) return null;
  const same = momentOf(localDay(after), clock);
  return same > after ? same : momentOf(shiftDay(localDay(after), 1), clock);
}

// ── Controls ──────────────────────────────────────────────────────────────

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

/** A labelled field in a pane's form. */
export function Field({
  id,
  label,
  hint,
  children,
}: {
  id?: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? (
        <p className="text-[13px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** The chip a pane uses for a pick-one choice (the job, the pay period). */
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
        "flex h-7 items-center gap-1.5 px-2.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors duration-150",
        on
          ? "er-brackets text-foreground [--bracket:var(--er-ink)]"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

/** A job's colour, the same mark the calendar puts beside its shifts. */
export function JobDot({
  color,
  className,
}: {
  color: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-2 w-2 flex-none rounded-full", className)}
      style={{ backgroundColor: color }}
    />
  );
}

export const LINK =
  "text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-rust-text";

/** Call, text and email, for whichever a contact has. */
export function ReachLinks({
  contact,
  className,
}: {
  contact: Pick<ContactRow, "phone" | "email">;
  className?: string;
}) {
  const phone = contact.phone ? dialable(contact.phone) : "";
  if (!phone && !contact.email) return null;
  return (
    <p className={cn("flex flex-wrap gap-x-4 gap-y-1 text-sm", className)}>
      {phone ? (
        <>
          <a href={`tel:${phone}`} className={LINK}>
            Call {contact.phone}
          </a>
          <a href={`sms:${phone}`} className={LINK}>
            Text
          </a>
        </>
      ) : null}
      {contact.email ? (
        <a href={`mailto:${contact.email}`} className={LINK}>
          {contact.email}
        </a>
      ) : null}
    </p>
  );
}

/** Delete, asking twice: the first press only arms it. */
export function DeleteButton({
  onDelete,
  disabled,
}: {
  onDelete: () => Promise<unknown>;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="quiet"
      disabled={disabled || busy}
      onClick={async () => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setBusy(true);
        await onDelete();
        setBusy(false);
        setArmed(false);
      }}
      onBlur={() => setArmed(false)}
      className={cn(armed && "text-destructive hover:text-destructive")}
    >
      {armed ? "Delete it" : "Delete"}
    </Button>
  );
}
