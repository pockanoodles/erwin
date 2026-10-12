import { useCallback, useEffect, useState } from "react";

import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { logger } from "@/lib/logger";

import { useSettingsStore } from "@/store/settings";

import { AvailableCalendars } from "./AvailableCalendars";
import { CalDAVAccountForm } from "./CalDAVAccountForm";

const LOG_SOURCE = "AccountManager";

interface IntegrationStatus {
  google: { configured: boolean };
  outlook: { configured: boolean };
}

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
    // Fetch integration status
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
      console.error("Failed to remove account:", error);
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Connected Accounts</CardTitle>
          <CardDescription>
            Manage your connected calendar accounts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* A provider that is not set up is a choice, not an error, so these
              read as notes. Every install brings its own OAuth app. */}
          {!integrationStatus.google.configured && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Google Calendar is not set up</AlertTitle>
              <AlertDescription>
                Google needs an OAuth app first. Add its client ID and secret
                under System to connect it here.
              </AlertDescription>
            </Alert>
          )}

          {!integrationStatus.outlook.configured && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Outlook is not set up</AlertTitle>
              <AlertDescription>
                Outlook needs an app registration first. Add its client ID and
                secret under System to connect it here.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            {/* Three equal choices, so none of them is the screen's one rust
                plate: they are all secondary until one is picked. */}
            <Button
              variant="secondary"
              onClick={() => handleConnect("GOOGLE")}
              disabled={!integrationStatus.google.configured || isLoading}
            >
              Connect Google Calendar
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleConnect("OUTLOOK")}
              disabled={!integrationStatus.outlook.configured || isLoading}
            >
              Connect Outlook Calendar
            </Button>
            <Button onClick={() => setShowCalDAVForm(true)} variant="outline">
              Connect CalDAV Calendar
            </Button>
          </div>

          {showCalDAVForm && (
            <Card>
              <CardContent className="pt-6">
                <CalDAVAccountForm
                  onSuccess={handleCalDAVSuccess}
                  onCancel={() => setShowCalDAVForm(false)}
                />
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {accounts?.map((account) => (
              <div key={account.id} className="space-y-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            account.provider === "GOOGLE"
                              ? "default"
                              : account.provider === "OUTLOOK"
                                ? "secondary"
                                : "outline"
                          }
                          className="capitalize"
                        >
                          {account.provider.toLowerCase()}
                        </Badge>
                        <span className="text-sm font-medium">
                          {account.email}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {account.calendars.length} calendars
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleAvailableCalendars(account.id)}
                        >
                          {showAvailableFor === account.id ? "Hide" : "Show"}{" "}
                          Calendars
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRemove(account.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                {showAvailableFor === account.id && (
                  <Card>
                    <CardContent className="pt-6">
                      <AvailableCalendars
                        accountId={account.id}
                        provider={account.provider}
                      />
                    </CardContent>
                  </Card>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
