"use client";

import { useCallback, useEffect, useState } from "react";

import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { logger } from "@/lib/logger";

import { useSettingsStore } from "@/store/settings";

import { AvailableCalendars } from "./AvailableCalendars";
import { CalDAVAccountForm } from "./CalDAVAccountForm";
import { SettingRow, SettingsSection } from "./SettingsSection";

const LOG_SOURCE = "AccountManager";

interface IntegrationStatus {
  google: { configured: boolean };
  outlook: { configured: boolean };
}

/** Connected calendar accounts and the ways to add another. */
export function AccountManager() {
  const { accounts, refreshAccounts, removeAccount } = useSettingsStore();
  const [showAvailableFor, setShowAvailableFor] = useState<string | null>(null);
  const [showCalDAVForm, setShowCalDAVForm] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus>(
    {
      google: { configured: false },
      outlook: { configured: false },
    }
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  useEffect(() => {
    fetch("/api/integration-status")
      .then((res) => res.json())
      .then((data) => {
        setIntegrationStatus(data);
        setIsLoading(false);
      })
      .catch((error) => {
        logger.error(
          "Failed to fetch integration status",
          { error: error instanceof Error ? error.message : "Unknown error" },
          LOG_SOURCE
        );
        setIsLoading(false);
      });
  }, []);

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
    setShowCalDAVForm(false);
    refreshAccounts();
  };

  return (
    <SettingsSection
      title="Accounts"
      description="Connect Google, Outlook or CalDAV so Erwin can mirror your calendars locally."
    >
      {/* A provider that is not set up is a choice, not an error, so these
          read as notes. Every install brings its own OAuth app. */}
      {!integrationStatus.google.configured ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Google Calendar is not set up</AlertTitle>
          <AlertDescription>
            Google needs an OAuth app first. Add its client ID and secret under
            System to connect it here.
          </AlertDescription>
        </Alert>
      ) : null}

      {!integrationStatus.outlook.configured ? (
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
        description="Pick the service your calendar lives on. iCloud, Fastmail and Nextcloud connect over CalDAV."
      >
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => handleConnect("GOOGLE")}
            disabled={!integrationStatus.google.configured || isLoading}
            className="font-mono text-[11px] uppercase tracking-[0.08em]"
          >
            Google
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleConnect("OUTLOOK")}
            disabled={!integrationStatus.outlook.configured || isLoading}
            className="font-mono text-[11px] uppercase tracking-[0.08em]"
          >
            Outlook
          </Button>
          <Button
            onClick={() => setShowCalDAVForm(true)}
            variant="outline"
            className="font-mono text-[11px] uppercase tracking-[0.08em]"
          >
            CalDAV
          </Button>
        </div>
      </SettingRow>

      {showCalDAVForm ? (
        <div className="border border-border bg-raised p-4">
          <CalDAVAccountForm
            onSuccess={handleCalDAVSuccess}
            onCancel={() => setShowCalDAVForm(false)}
          />
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
