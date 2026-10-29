"use client";

import { useCallback, useEffect, useState } from "react";

import { format } from "date-fns";
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { logger } from "@/lib/logger";

import { useResource } from "@/hooks/use-resource";

import { useCalendarStore } from "@/store/calendar";
import { useSettingsStore } from "@/store/settings";

import { AvailableCalendars } from "./AvailableCalendars";
import { CalDAVAccountForm } from "./CalDAVAccountForm";
import { ICalCalendarForm } from "./ICalCalendarForm";
import { SettingRow, SettingsSection } from "./SettingsSection";

const LOG_SOURCE = "AccountManager";

/** `/api/integration-status`; the Settings page reads it too. */
export interface IntegrationStatus {
  google: { configured: boolean };
  outlook: { configured: boolean };
  desktop: boolean;
}

/** Connected calendar accounts and the ways to add another. */
export function AccountManager() {
  const { accounts, refreshAccounts, removeAccount } = useSettingsStore();
  const [showAvailableFor, setShowAvailableFor] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<"caldav" | "ical" | null>(null);
  const status = useResource<IntegrationStatus>("/api/integration-status");
  const isLoading = status.loading;
  const desktop = status.data?.desktop ?? false;
  const googleConfigured = status.data?.google.configured ?? false;
  const outlookConfigured = status.data?.outlook.configured ?? false;

  // iCal subscriptions are feeds, not accounts, so they list on their own.
  const feeds = useCalendarStore((state) => state.feeds);
  const refreshFeeds = useCalendarStore((state) => state.refreshFeeds);
  const removeFeed = useCalendarStore((state) => state.removeFeed);
  const subscriptions = feeds.filter((feed) => feed.type === "ICAL");

  useEffect(() => {
    refreshAccounts();
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
    setShowForm(null);
    refreshAccounts();
  };

  return (
    <SettingsSection
      title="Accounts"
      description={
        desktop
          ? "Add a calendar by its iCal link, or connect a CalDAV account, and Sigwald mirrors it locally."
          : "Connect Google, Outlook or CalDAV, or subscribe by iCal link, so Sigwald can mirror your calendars locally."
      }
    >
      {desktop ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Google and Outlook calendars come in by iCal link</AlertTitle>
          <AlertDescription>
            Both publish any calendar as an iCal link, which Sigwald reads every
            15 minutes. Changing their events from Sigwald, and Google Tasks or
            Microsoft To Do, needs a self-hosted Sigwald for now.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* A provider that is not set up is a choice, not an error, so these
          read as notes. Every server brings its own OAuth app. */}
      {!desktop && !isLoading && !googleConfigured ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Google Calendar is not set up</AlertTitle>
          <AlertDescription>
            Google needs an OAuth app first. Add its client ID and secret under
            System to connect it here.
          </AlertDescription>
        </Alert>
      ) : null}

      {!desktop && !isLoading && !outlookConfigured ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Outlook is not set up</AlertTitle>
          <AlertDescription>
            Outlook needs an app registration first. Add its client ID and
            secret under System to connect it here.
          </AlertDescription>
        </Alert>
      ) : null}

      <SettingRow
        label="Add a calendar"
        description="Pick the service your calendar lives on. iCloud, Fastmail and Nextcloud connect over CalDAV, and any calendar with an iCal link subscribes read-only."
      >
        <div className="flex flex-wrap gap-2">
          {!desktop ? (
            <>
              <Button
                variant="secondary"
                onClick={() => handleConnect("GOOGLE")}
                disabled={!googleConfigured || isLoading}
                className="font-mono text-[11px] uppercase tracking-[0.08em]"
              >
                Google
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleConnect("OUTLOOK")}
                disabled={!outlookConfigured || isLoading}
                className="font-mono text-[11px] uppercase tracking-[0.08em]"
              >
                Outlook
              </Button>
            </>
          ) : null}
          <Button
            onClick={() => setShowForm("ical")}
            variant="outline"
            className="font-mono text-[11px] uppercase tracking-[0.08em]"
          >
            iCal link
          </Button>
          <Button
            onClick={() => setShowForm("caldav")}
            variant="outline"
            className="font-mono text-[11px] uppercase tracking-[0.08em]"
          >
            CalDAV
          </Button>
        </div>
      </SettingRow>

      {showForm === "caldav" ? (
        <div className="border border-border bg-raised p-4">
          <CalDAVAccountForm
            onSuccess={handleCalDAVSuccess}
            onCancel={() => setShowForm(null)}
          />
        </div>
      ) : null}

      {showForm === "ical" ? (
        <div className="border border-border bg-raised p-4">
          <ICalCalendarForm
            onSuccess={() => setShowForm(null)}
            onCancel={() => setShowForm(null)}
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
