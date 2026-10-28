"use client";

import { useState } from "react";

import { signOut, useSession } from "next-auth/react";
import Image from "next/image";

import { useTheme } from "@/components/providers/ThemeProvider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { cn } from "@/lib/utils";

import { useSettingsStore } from "@/store/settings";

import { ThemeMode, TimeFormat, WeekStartDay } from "@/types/settings";

import { SettingRow, SettingsSection } from "./SettingsSection";

const THEMES: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function UserSettings() {
  const { data: session } = useSession();
  const { user, updateUserSettings } = useSettingsStore();
  const { theme, setTheme } = useTheme();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const timeFormats: { value: TimeFormat; label: string }[] = [
    { value: "12h", label: "12-hour" },
    { value: "24h", label: "24-hour" },
  ];

  const weekStarts: { value: WeekStartDay; label: string }[] = [
    { value: "sunday", label: "Sunday" },
    { value: "monday", label: "Monday" },
  ];

  const timeZones = [
    "UTC",
    "America/Anchorage",
    "America/Chicago",
    "America/Denver",
    "America/Edmonton",
    "America/Halifax",
    "America/Los_Angeles",
    "America/Mexico_City",
    "America/Montreal",
    "America/New_York",
    "America/Phoenix",
    "America/Toronto",
    "America/Vancouver",
    "America/Winnipeg",
    "America/Bogota",
    "America/Buenos_Aires",
    "America/Caracas",
    "America/Lima",
    "America/Santiago",
    "America/Sao_Paulo",
    "Europe/Amsterdam",
    "Europe/Athens",
    "Europe/Berlin",
    "Europe/Brussels",
    "Europe/Budapest",
    "Europe/Copenhagen",
    "Europe/Dublin",
    "Europe/Helsinki",
    "Europe/Istanbul",
    "Europe/Lisbon",
    "Europe/London",
    "Europe/Madrid",
    "Europe/Moscow",
    "Europe/Oslo",
    "Europe/Paris",
    "Europe/Prague",
    "Europe/Rome",
    "Europe/Stockholm",
    "Europe/Vienna",
    "Europe/Warsaw",
    "Europe/Zurich",
    "Asia/Bangkok",
    "Asia/Dubai",
    "Asia/Hong_Kong",
    "Asia/Jakarta",
    "Asia/Jerusalem",
    "Asia/Karachi",
    "Asia/Kolkata",
    "Asia/Kuala_Lumpur",
    "Asia/Manila",
    "Asia/Riyadh",
    "Asia/Seoul",
    "Asia/Shanghai",
    "Asia/Singapore",
    "Asia/Taipei",
    "Asia/Tokyo",
    "Africa/Cairo",
    "Africa/Casablanca",
    "Africa/Johannesburg",
    "Africa/Lagos",
    "Africa/Nairobi",
    "Australia/Adelaide",
    "Australia/Brisbane",
    "Australia/Darwin",
    "Australia/Melbourne",
    "Australia/Perth",
    "Australia/Sydney",
    "Pacific/Auckland",
    "Pacific/Fiji",
    "Pacific/Honolulu",
  ];

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await signOut({ callbackUrl: "/auth/signin" });
  };

  return (
    <div className="space-y-10">
      <SettingsSection
        title="User"
        description="How times read on your calendar, and which theme the window uses."
      >
        {session?.user ? (
          <SettingRow label="Profile" description="Signed in as this account">
            <div className="flex items-center gap-3">
              {session.user.image ? (
                <Image
                  src={session.user.image}
                  alt={session.user.name || ""}
                  width={40}
                  height={40}
                  className="rounded-sm"
                />
              ) : null}
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {session.user.name}
                </div>
                <div className="truncate text-[13px] text-muted-foreground">
                  {session.user.email}
                </div>
              </div>
            </div>
          </SettingRow>
        ) : null}

        <SettingRow label="Theme" description="Light, dark, or follow the system">
          <div
            role="radiogroup"
            aria-label="Theme"
            className="grid grid-cols-3 gap-1 border border-border p-1"
          >
            {THEMES.map((option) => {
              const active = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    "h-8 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors duration-150",
                    active
                      ? "er-brackets bg-selected text-foreground [--bracket:var(--er-ink)]"
                      : "text-muted-foreground hover:bg-hover hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </SettingRow>

        <SettingRow
          label="Time format"
          description="How times are written in the calendar and tasks"
        >
          <Select
            value={user.timeFormat}
            onValueChange={(value) =>
              updateUserSettings({ timeFormat: value as TimeFormat })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timeFormats.map((format) => (
                <SelectItem key={format.value} value={format.value}>
                  {format.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          label="Week starts on"
          description="First day of the week in month and week views"
        >
          <Select
            value={user.weekStartDay}
            onValueChange={(value) =>
              updateUserSettings({ weekStartDay: value as WeekStartDay })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weekStarts.map((day) => (
                <SelectItem key={day.value} value={day.value}>
                  {day.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow label="Time zone" description="Used for due dates and the day boundary">
          <Select
            value={user.timeZone}
            onValueChange={(value) => updateUserSettings({ timeZone: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {timeZones.map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingsSection>

      {session?.user ? (
        <SettingsSection
          title="Session"
          description="Sign out of this browser. Your data stays on this machine."
        >
          <SettingRow
            label="Sign out"
            description="Ends the session on this device"
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleLogout()}
              disabled={isLoggingOut}
              className="font-mono text-[11px] uppercase tracking-[0.08em]"
            >
              {isLoggingOut ? "Signing out…" : "Sign out"}
            </Button>
          </SettingRow>
        </SettingsSection>
      ) : null}
    </div>
  );
}
