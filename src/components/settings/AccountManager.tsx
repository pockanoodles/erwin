"use client";

import { useCallback, useEffect, useState } from "react";

import { format } from "date-fns";
import { Button } from "@/components/ui/button";

import type { CalendarProvider } from "@/lib/calendar-providers";
import { logger } from "@/lib/logger";

import { useResource } from "@/hooks/use-resource";

import { useCalendarStore } from "@/store/calendar";
import { useSettingsStore } from "@/store/settings";

import { AddCalendar } from "./AddCalendar";
import { AvailableCalendars } from "./AvailableCalendars";
import { CalDAVAccountForm } from "./CalDAVAccountForm";
import { ICalCalendarForm } from "./ICalCalendarForm";
import { SettingRow, SettingsSection } from "./SettingsSection";

const LOG_SOURCE = "AccountManager";

/** `/api/integration-status`; the Settings page reads it too. */
export interface IntegrationStatus {
  /** The app a new connection signs in through, null when there's none. */
  google: { app: "sigwald" | "custom" | null };
  outlook: { app: "sigwald" | "custom" | null };
  desktop: boolean;
  /** Sigwald serves from this machine, where its own sign-in apps work. */
  loopback: boolean;
}

type OpenForm =
  | { kind: "caldav"; preset: CalendarProvider; email?: string; serverUrl?: string }
  | { kind: "ical"; url?: string; help?: string };

/** Connected calendar accounts and the ways to add another. */
export function AccountManager() {
  const { accounts, refreshAccounts, removeAccount } = useSettingsStore();
  const [showAvailableFor, setShowAvailableFor] = useState<string | null>(null);
  const [form, setForm] = useState<OpenForm | null>(null);
  const status = useResource<IntegrationStatus>("/api/integration-status");
  const isLoading = status.loading;
  const desktop = status.data?.desktop ?? false;
  const googleAvailable = !!status.data?.google.app;
  const outlookAvailable = !!status.data?.outlook.app;

  // iCal subscriptions are feeds, not accounts, so they list on their own.
  const feeds = useCalendarStore((state) => state.feeds);
  const refreshFeeds = useCalendarStore((state) => state.refreshFeeds);
  const removeFeed = useCalendarStore((state) => state.removeFeed);
  const subscriptions = feeds.filter((feed) => feed.type === "ICAL");

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  // The desktop app finishes Google and Microsoft sign-in in the system
  // browser, so a new account shows up when the user switches back.
  useEffect(() => {
    const onFocus = () => refreshAccounts();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshAccounts]);

  useEffect(() => {
    void refreshFeeds();
  }, [refreshFeeds]);

  useEffect(() => {
    if (status.error) {
      logger.error(
        "Failed to fetch integration status",
        { error: status.error },
        LOG_SOURCE
      );
    }
  }, [status.error]);

  const handleConnect = (provider: "GOOGLE" | "OUTLOOK") => {
    if (provider === "GOOGLE") {
      window.location.href = `/api/calendar/google/auth`;
    } else if (provider === "OUTLOOK") {
      window.location.href = `/api/calendar/outlook/auth`;
    }
  };

  const handleRemove = async (accountId: string) => {
    try {
      await removeAccount(accountId);
    } catch (error) {
      logger.error(
        "Failed to remove account",
        { error: error instanceof Error ? error.message : "Unknown error" },
        LOG_SOURCE
      );
    }
  };

  const toggleAvailableCalendars = useCallback((accountId: string) => {
    setShowAvailableFor((current) =>
      current === accountId ? null : accountId
    );
  }, []);

  const handleCalDAVSuccess = () => {
    setForm(null);
    refreshAccounts();
  };

  // Sigwald's own sign-in apps only redirect to this machine, so a server at
  // its own domain needs one registered under System. The desktop app has no
  // System page, and there a missing app is a build without one.
  const unavailableNote = isLoading
    ? undefined
    : desktop
      ? "This build doesn't include Sigwald's sign-in apps. Add the calendar by its iCal link instead."
      : status.data?.loopback
        ? "Add an OAuth app under System to connect it, or add the calendar by its iCal link."
        : "A server at its own domain needs its own OAuth app: add one under System, or add the calendar by its iCal link.";

  return (
    <SettingsSection
      title="Accounts"
      description="Connect the calendars you already use, and Sigwald mirrors them locally."
    >
      <SettingRow
        label="Add a calendar"
        description="Enter your email and Sigwald picks the way in, or pick where the calendar lives. Any calendar with an iCal link subscribes read-only."
      >
        <AddCalendar
          googleAvailable={googleAvailable && !isLoading}
          outlookAvailable={outlookAvailable && !isLoading}
          unavailableNote={unavailableNote}
          onConnect={handleConnect}
          onCalDAV={(preset, email, serverUrl) =>
            setForm({ kind: "caldav", preset, email, serverUrl })
          }
          onICal={(initial) => setForm({ kind: "ical", ...initial })}
        />
      </SettingRow>

      {form?.kind === "caldav" ? (
        <div className="border border-border bg-raised p-4">
          <CalDAVAccountForm
            // A new preset is a new form, not the old one's typing.
            key={`${form.preset.id}:${form.serverUrl ?? ""}`}
            preset={form.preset}
            email={form.email}
            serverUrl={form.serverUrl}
            onSuccess={handleCalDAVSuccess}
            onCancel={() => setForm(null)}
          />
        </div>
      ) : null}

      {form?.kind === "ical" ? (
        <div className="border border-border bg-raised p-4">
          <ICalCalendarForm
            key={form.url ?? form.help ?? "ical"}
            initialUrl={form.url}
            help={form.help}
            onSuccess={() => setForm(null)}
            onCancel={() => setForm(null)}
          />
        </div>
      ) : null}

      {subscriptions.length > 0 ? (
        <div className="space-y-3">
          <p className="er-label">Subscribed</p>
          {subscriptions.map((feed) => (
            <div
              key={feed.id}
              className="flex flex-wrap items-center justify-between gap-3 border border-border bg-surface/40 p-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="er-bracketed font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    ical
                  </span>
                  <span className="truncate text-sm font-medium">
                    {feed.name}
                  </span>
                </div>
                <p
                  className={
                    feed.error
                      ? "text-[12px] text-destructive"
                      : "font-mono text-[11px] tabular-nums text-muted-foreground"
                  }
                >
                  {feed.error
                    ? `Last read failed: ${feed.error}`
                    : feed.lastSync
                      ? `Read ${format(new Date(feed.lastSync), "MMM d, h:mm a")}`
                      : "Not read yet"}
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void removeFeed(feed.id)}
                className="flex-none font-mono text-[11px] uppercase tracking-[0.08em]"
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-3">
        <p className="er-label">Connected</p>
        {accounts && accounts.length > 0 ? (
          accounts.map((account) => (
            <div
              key={account.id}
              className="space-y-3 border border-border bg-surface/40 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="er-bracketed font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      {account.provider.toLowerCase()}
                    </span>
                    <span className="truncate text-sm font-medium">
                      {account.email}
                    </span>
                  </div>
                  <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {account.calendars.length} calendars
                  </p>
                </div>
                <div className="flex flex-none gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleAvailableCalendars(account.id)}
                    className="font-mono text-[11px] uppercase tracking-[0.08em]"
                  >
                    {showAvailableFor === account.id ? "Hide" : "Show"}{" "}
                    calendars
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void handleRemove(account.id)}
                    className="font-mono text-[11px] uppercase tracking-[0.08em]"
                  >
                    Remove
                  </Button>
                </div>
              </div>
              {showAvailableFor === account.id ? (
                <div className="border-t border-border pt-3">
                  <AvailableCalendars
                    accountId={account.id}
                    provider={account.provider}
                  />
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <p className="text-[13px] text-muted-foreground">
            No calendars connected yet.
          </p>
        )}
      </div>
    </SettingsSection>
  );
}
