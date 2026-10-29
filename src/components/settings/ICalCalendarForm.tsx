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

import { logger } from "@/lib/logger";

import { useCalendarStore } from "@/store/calendar";

const LOG_SOURCE = "ICalCalendarForm";

interface ICalCalendarFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

/**
 * Subscribes to a calendar by its iCal address, as a read-only feed. This is
 * how a Google, Outlook or Apple calendar reaches the desktop app without an
 * OAuth app: each of them publishes a calendar as an iCal link. Ported from
 * upstream FluidCalendar's iCal subscriptions (dotnetfactory/fluid-calendar#212).
 */
export function ICalCalendarForm({
  onSuccess,
  onCancel,
}: ICalCalendarFormProps) {
  const addFeed = useCalendarStore((state) => state.addFeed);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    color: "#3b82f6",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errorMessage) {
      setErrorMessage(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!formData.name.trim() || !formData.url.trim()) {
      setErrorMessage("Give the calendar a name and paste its iCal link.");
      return;
    }

    try {
      setIsSubmitting(true);
      await addFeed(
        formData.name.trim(),
        formData.url.trim(),
        "ICAL",
        formData.color
      );
      onSuccess?.();
    } catch (error) {
      logger.error(
        "Failed to subscribe to iCal calendar",
        { error: error instanceof Error ? error.message : "Unknown error" },
        LOG_SOURCE
      );
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Couldn't subscribe to that calendar."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscribe by iCal link</CardTitle>
        <CardDescription>
          Any calendar with an iCal link shows up here, read-only, and Sigwald
          reads it again every 15 minutes. Changes you make to it happen in
          the calendar it comes from.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {errorMessage && (
            <div
              className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          <fieldset className="mb-4">
            <Label
              className="mb-2.5 text-[15px] leading-normal"
              htmlFor="ical-name"
            >
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ical-name"
              name="name"
              placeholder="Classes"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </fieldset>

          <fieldset className="mb-4">
            <Label
              className="mb-2.5 text-[15px] leading-normal"
              htmlFor="ical-url"
            >
              iCal link <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ical-url"
              name="url"
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              value={formData.url}
              onChange={handleChange}
              autoComplete="off"
              spellCheck={false}
              required
            />
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>
                <span className="text-foreground">Google:</span> Settings, the
                calendar, Integrate calendar, then Secret address in iCal format.
              </li>
              <li>
                <span className="text-foreground">Outlook:</span> Settings,
                Calendar, Shared calendars, Publish a calendar, then the ICS
                link.
              </li>
              <li>
                <span className="text-foreground">Apple:</span> share the
                calendar as a Public Calendar and copy its link.
              </li>
            </ul>
            <p className="mt-2 text-sm text-muted-foreground">
              A secret address lets anyone who has it read that calendar, so
              keep it to yourself.
            </p>
          </fieldset>

          <fieldset className="mb-4">
            <Label
              className="mb-2.5 text-[15px] leading-normal"
              htmlFor="ical-color"
            >
              Color
            </Label>
            <Input
              id="ical-color"
              name="color"
              type="color"
              value={formData.color}
              onChange={handleChange}
              className="h-10 w-16 p-1"
            />
          </fieldset>
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Subscribing…" : "Subscribe"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
