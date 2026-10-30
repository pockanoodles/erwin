import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { CalendarProvider } from "@/lib/calendar-providers";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "CalDAVAccountForm";

// Define types for test results
interface TestStep {
  step: string;
  status: "pending" | "success" | "failed";
  error?: string;
  calendars?: number;
  calendarNames?: string[];
}

interface TestResult {
  steps: TestStep[];
  success: boolean;
  error: string | null;
  details: string | null;
}

interface CalDAVAccountFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  preset?: CalendarProvider;
  email?: string;
  /** A server the user pasted, which wins over the preset's. */
  serverUrl?: string;
}

/**
 * Form component for adding a new CalDAV account
 * Collects server URL, username, password, and optional path
 */
export function CalDAVAccountForm({
  onSuccess,
  onCancel,
  preset,
  email,
  serverUrl: pastedServerUrl,
}: CalDAVAccountFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [formData, setFormData] = useState({
    serverUrl: pastedServerUrl ?? preset?.caldav?.serverUrl ?? "",
    username: email ?? "",
    password: "",
    path: "", // Optional path for some CalDAV servers
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<TestResult | null>(null);

  const showServerUrl =
    !preset?.caldav || preset.caldav.serverUrl === "";
  const passwordLabel = preset?.caldav?.passwordLabel ?? "Password";
  const title = preset ? `Connect ${preset.name}` : "Connect CalDAV Account";

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear error when user makes changes
    if (errorMessage) {
      setErrorMessage(null);
    }

    // Clear test results when form changes
    if (testResults) {
      setTestResults(null);
    }
  };

  const handleTest = async () => {
    // Validate form
    if (!formData.serverUrl || !formData.username || !formData.password) {
      setErrorMessage("Please fill in all required fields");
      return;
    }

    try {
      setIsTesting(true);
      setErrorMessage(null);
      setTestResults(null);

      // Ensure the server URL has the correct format
      let serverUrl = formData.serverUrl;
      if (
        !serverUrl.startsWith("http://") &&
        !serverUrl.startsWith("https://")
      ) {
        serverUrl = `https://${serverUrl}`;
      }

      // Remove trailing slash if present
      if (serverUrl.endsWith("/")) {
        serverUrl = serverUrl.slice(0, -1);
      }

      const response = await fetch("/api/calendar/caldav/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serverUrl,
          username: formData.username,
          password: formData.password,
          path: formData.path || undefined,
        }),
      });

      const data = await response.json();
      setTestResults(data as TestResult);

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to connect to CalDAV server");
      }

      logger.info(
        "CalDAV test connection successful",
        { serverUrl, username: formData.username },
        LOG_SOURCE
      );
    } catch (error) {
      logger.error(
        "CalDAV test connection failed",
        {
          error: error instanceof Error ? error.message : "Unknown error",
        },
        LOG_SOURCE
      );
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to connect to CalDAV server"
      );
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validate form
    if (!formData.serverUrl || !formData.username || !formData.password) {
      setErrorMessage("Please fill in all required fields");
      return;
    }

    try {
      setIsSubmitting(true);

      // Ensure the server URL has the correct format
      let serverUrl = formData.serverUrl;
      if (
        !serverUrl.startsWith("http://") &&
        !serverUrl.startsWith("https://")
      ) {
        serverUrl = `https://${serverUrl}`;
      }

      // Remove trailing slash if present
      if (serverUrl.endsWith("/")) {
        serverUrl = serverUrl.slice(0, -1);
      }

      const response = await fetch("/api/calendar/caldav/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serverUrl,
          username: formData.username,
          password: formData.password,
          path: formData.path || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "Failed to connect to CalDAV server"
        );
      }

      await response.json();

      alert(`Successfully connected to CalDAV server for ${formData.username}`);

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      logger.error(
        "Failed to connect CalDAV account",
        {
          error: error instanceof Error ? error.message : "Unknown error",
        },
        LOG_SOURCE
      );
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to connect to CalDAV server"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render test results
  const renderTestResults = () => {
    if (!testResults) return null;

    return (
      <div className="mt-4 rounded-md border bg-muted p-4">
        <h3 className="mb-2 font-medium">Connection Test Results</h3>

        {testResults.steps &&
          testResults.steps.map((step, index) => (
            <div key={index} className="mb-2">
              <div className="flex items-center">
                <span
                  className={`mr-2 ${
                    step.status === "success"
                      ? "text-ok"
                      : step.status === "failed"
                        ? "text-destructive"
                        : "text-rust-text"
                  }`}
                >
                  {step.status === "success"
                    ? "✓"
                    : step.status === "failed"
                      ? "✗"
                      : "⟳"}
                </span>
                <span className="font-medium">{step.step}</span>
                {step.status === "success" && step.calendars !== undefined && (
                  <span className="ml-2 text-sm text-muted-foreground">
                    ({step.calendars} calendars found)
                  </span>
                )}
              </div>

              {step.error && (
                <div className="ml-6 mt-1 whitespace-pre-wrap text-sm text-destructive">
                  Error: {step.error}
                </div>
              )}

              {step.calendarNames && step.calendarNames.length > 0 && (
                <div className="ml-6 mt-1 text-sm text-muted-foreground">
                  Calendars: {step.calendarNames.join(", ")}
                </div>
              )}
            </div>
          ))}

        {testResults.error && !testResults.steps?.some((s) => s.error) && (
          <div className="mt-2 text-destructive">
            <div className="font-medium">Error:</div>
            <div className="whitespace-pre-wrap text-sm">
              {testResults.error}
            </div>
          </div>
        )}

        {testResults.success && (
          <div className="mt-2 font-medium text-ok">
            Connection successful! You can now connect your account.
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {!preset ? (
          <CardDescription>
            Add your CalDAV calendar account from services like Fastmail, iCloud,
            or other CalDAV providers
          </CardDescription>
        ) : null}
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {errorMessage && (
            <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {errorMessage}
            </div>
          )}

          {showServerUrl ? (
            <fieldset className="mb-4">
              <Label
                className="mb-2.5 text-[15px] leading-normal"
                htmlFor="serverUrl"
              >
                Server URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="serverUrl"
                name="serverUrl"
                placeholder="https://caldav.example.com"
                value={formData.serverUrl}
                onChange={handleChange}
                required
              />
              {!preset ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  For Fastmail: https://caldav.fastmail.com
                </p>
              ) : null}
            </fieldset>
          ) : null}

          <fieldset className="mb-4">
            <Label
              className="mb-2.5 text-[15px] leading-normal"
              htmlFor="username"
            >
              Username <span className="text-destructive">*</span>
            </Label>
            <Input
              id="username"
              name="username"
              placeholder="your.email@example.com"
              value={formData.username}
              onChange={handleChange}
              required
            />
            {!preset ? (
              <p className="mt-1 text-sm text-muted-foreground">
                For Fastmail: Use your full email address
              </p>
            ) : null}
          </fieldset>

          <fieldset className="mb-4">
            <Label
              className="mb-2.5 text-[15px] leading-normal"
              htmlFor="password"
            >
              {passwordLabel} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              required
            />
            {preset?.caldav ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {preset.caldav.passwordHelpUrl ? (
                  <>
                    <a
                      href={preset.caldav.passwordHelpUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      {preset.caldav.passwordHelp}
                    </a>
                  </>
                ) : (
                  preset.caldav.passwordHelp
                )}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                For Fastmail: Use an app-specific password from Settings →
                Password & Security
              </p>
            )}
          </fieldset>

          <fieldset className="mb-4">
            <Label className="mb-2.5 text-[15px] leading-normal" htmlFor="path">
              Path (Optional)
            </Label>
            <Input
              id="path"
              name="path"
              placeholder="/dav/calendars/user/username@fastmail.com"
              value={formData.path}
              onChange={handleChange}
            />
            {!preset ? (
              <p className="mt-1 text-sm text-muted-foreground">
                For Fastmail: /dav/calendars/user/youremail@fastmail.com
              </p>
            ) : null}
          </fieldset>

          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={isTesting || isSubmitting}
              className="w-full"
            >
              {isTesting ? "Testing Connection..." : "Test Connection"}
            </Button>
          </div>

          {renderTestResults()}
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting || isTesting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || isTesting}>
            {isSubmitting ? "Connecting..." : "Connect"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
