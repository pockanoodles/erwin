"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { Discovery } from "@/lib/calendar-discovery";
import {
  CALENDAR_PROVIDERS,
  classifyPastedLink,
  providerById,
  providerForEmail,
  type CalendarProvider,
} from "@/lib/calendar-providers";

export interface AddCalendarProps {
  googleAvailable: boolean;
  outlookAvailable: boolean;
  unavailableNote?: string;
  onConnect: (provider: "GOOGLE" | "OUTLOOK") => void;
  onCalDAV: (
    preset: CalendarProvider,
    email?: string,
    serverUrl?: string
  ) => void;
  onICal: (initial?: { url?: string; help?: string }) => void;
}

const TILE_CLASS =
  "font-mono text-[11px] uppercase tracking-[0.08em]";

function activateProvider(
  provider: CalendarProvider,
  email: string | undefined,
  callbacks: Pick<AddCalendarProps, "onConnect" | "onCalDAV" | "onICal">
) {
  if (provider.method === "google") {
    callbacks.onConnect("GOOGLE");
    return;
  }
  if (provider.method === "outlook") {
    callbacks.onConnect("OUTLOOK");
    return;
  }
  if (provider.method === "ical") {
    callbacks.onICal({ help: provider.icalHelp });
    return;
  }
  callbacks.onCalDAV(provider, email);
}

/**
 * Provider picker for "Add a calendar": email continue, tiles, and paste a link.
 */
export function AddCalendar({
  googleAvailable,
  outlookAvailable,
  unavailableNote,
  onConnect,
  onCalDAV,
  onICal,
}: AddCalendarProps) {
  const [email, setEmail] = useState("");
  const [unknownProvider, setUnknownProvider] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [pastedLink, setPastedLink] = useState("");
  const [invalidLink, setInvalidLink] = useState(false);

  const isAvailable = (provider: CalendarProvider) =>
    (provider.method !== "google" || googleAvailable) &&
    (provider.method !== "outlook" || outlookAvailable);

  /**
   * A domain Sigwald doesn't know asks the server, which reads its mail
   * records and CalDAV announcements (calendar-discovery.ts).
   */
  const discover = async (address: string): Promise<Discovery> => {
    try {
      const response = await fetch("/api/calendar/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address }),
      });
      return response.ok ? ((await response.json()) as Discovery) : { kind: "unknown" };
    } catch {
      return { kind: "unknown" };
    }
  };

  const handleEmailContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnknownProvider(false);
    setUnavailable(null);
    setInvalidLink(false);

    const address = email.trim();
    let provider = providerForEmail(address);
    if (!provider) {
      setLookingUp(true);
      const found = await discover(address);
      setLookingUp(false);
      if (found.kind === "caldav") {
        onCalDAV(providerById("caldav")!, address, found.serverUrl);
        return;
      }
      provider = found.kind === "provider" ? providerById(found.providerId) : undefined;
      if (!provider) {
        setUnknownProvider(true);
        return;
      }
      // A regional server (Zoho's EU accounts) overrides the preset's.
      if (found.kind === "provider" && found.serverUrl && provider.method === "caldav") {
        onCalDAV(provider, address, found.serverUrl);
        return;
      }
    }
    if (!isAvailable(provider)) {
      setUnavailable(
        `${provider.name} sign-in isn't set up here.${unavailableNote ? ` ${unavailableNote}` : ""}`
      );
      return;
    }

    activateProvider(provider, address, { onConnect, onCalDAV, onICal });
  };

  const handleTileClick = (provider: CalendarProvider) => {
    setUnknownProvider(false);
    setUnavailable(null);
    setInvalidLink(false);

    if (!isAvailable(provider)) return;

    activateProvider(provider, undefined, { onConnect, onCalDAV, onICal });
  };

  const handlePasteLink = (e: React.FormEvent) => {
    e.preventDefault();
    setUnknownProvider(false);
    setInvalidLink(false);

    const result = classifyPastedLink(pastedLink);
    if (result.kind === "invalid") {
      setInvalidLink(true);
      return;
    }
    if (result.kind === "ical") {
      onICal({ url: result.url });
      return;
    }
    const caldav = providerById("caldav");
    if (!caldav) return;
    onCalDAV(caldav, undefined, result.url);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleEmailContinue} className="space-y-2">
        <p className="er-label">Your email</p>
        <div className="flex flex-wrap gap-2">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (unknownProvider) setUnknownProvider(false);
            }}
            className="min-w-[12rem] flex-1"
            autoComplete="email"
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={lookingUp}
            className={TILE_CLASS}
          >
            {lookingUp ? "Looking up" : "Continue"}
          </Button>
        </div>
        {unknownProvider ? (
          <p className="text-[13px] text-muted-foreground">
            Sigwald couldn&apos;t tell where that address keeps its calendar.
            Pick the service below, or use Other CalDAV server.
          </p>
        ) : null}
        {unavailable ? (
          <p className="text-[13px] text-muted-foreground">{unavailable}</p>
        ) : null}
      </form>

      <div className="space-y-2">
        <p className="er-label">Or pick a provider</p>
        <div className="flex flex-wrap gap-2">
          {CALENDAR_PROVIDERS.map((provider) => {
            const disabled = !isAvailable(provider);
            return (
              <Button
                key={provider.id}
                type="button"
                variant={
                  provider.method === "google" || provider.method === "outlook"
                    ? "secondary"
                    : "outline"
                }
                disabled={disabled}
                onClick={() => handleTileClick(provider)}
                className={TILE_CLASS}
              >
                {provider.name}
              </Button>
            );
          })}
        </div>
        {unavailableNote && (!googleAvailable || !outlookAvailable) ? (
          <p className="text-[13px] text-muted-foreground">{unavailableNote}</p>
        ) : null}
      </div>

      <form onSubmit={handlePasteLink} className="space-y-2">
        <p className="er-label">Paste a link</p>
        <div className="flex flex-wrap gap-2">
          <Input
            type="text"
            inputMode="url"
            placeholder="https://… or webcal://…"
            value={pastedLink}
            onChange={(e) => {
              setPastedLink(e.target.value);
              if (invalidLink) setInvalidLink(false);
            }}
            className="min-w-[12rem] flex-1"
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit" variant="outline" className={TILE_CLASS}>
            Continue
          </Button>
        </div>
        {invalidLink ? (
          <p className="text-[13px] text-muted-foreground">
            That doesn&apos;t look like a calendar link.
          </p>
        ) : null}
      </form>
    </div>
  );
}
