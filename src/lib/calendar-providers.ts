export type CalendarMethod = "google" | "outlook" | "caldav" | "ical";

export interface CalendarProvider {
  id: string;
  name: string;
  method: CalendarMethod;
  domains: string[];
  caldav?: {
    serverUrl: string;
    passwordLabel: string;
    passwordHelpUrl?: string;
    passwordHelp: string;
  };
  icalHelp?: string;
  serverPrompt?: boolean;
}

const ACCOUNT_PASSWORD_HELP =
  "Use your account password, or an app password if your account has two-step sign-in.";

export const CALENDAR_PROVIDERS: readonly CalendarProvider[] = [
  {
    id: "google",
    name: "Google",
    method: "google",
    domains: ["gmail.com", "googlemail.com"],
  },
  {
    id: "microsoft",
    name: "Outlook / Microsoft 365",
    method: "outlook",
    domains: [
      "outlook.com",
      "hotmail.com",
      "live.com",
      "msn.com",
      "passport.com",
      "hotmail.co.uk",
      "hotmail.fr",
      "hotmail.de",
      "hotmail.it",
      "hotmail.es",
      "outlook.fr",
      "outlook.de",
      "outlook.jp",
      "live.co.uk",
      "live.fr",
      "live.jp",
    ],
  },
  {
    id: "icloud",
    name: "iCloud",
    method: "caldav",
    domains: ["icloud.com", "me.com", "mac.com"],
    caldav: {
      serverUrl: "https://caldav.icloud.com",
      passwordLabel: "App-specific password",
      passwordHelpUrl: "https://account.apple.com",
      passwordHelp:
        "Sign in at account.apple.com, open Sign-In and Security, then App-Specific Passwords, and make one for Sigwald.",
    },
  },
  {
    id: "yahoo",
    name: "Yahoo",
    method: "caldav",
    domains: [
      "yahoo.com",
      "ymail.com",
      "rocketmail.com",
      "yahoo.co.uk",
      "yahoo.co.jp",
      "yahoo.fr",
      "yahoo.de",
    ],
    caldav: {
      serverUrl: "https://caldav.calendar.yahoo.com",
      passwordLabel: "App-specific password",
      passwordHelpUrl: "https://login.yahoo.com/account/security",
      passwordHelp:
        "In your Yahoo account's Security page, generate an app password for Sigwald.",
    },
  },
  {
    id: "aol",
    name: "AOL",
    method: "caldav",
    domains: ["aol.com"],
    caldav: {
      serverUrl: "https://caldav.aol.com",
      passwordLabel: "App-specific password",
      passwordHelpUrl: "https://login.aol.com/account/security",
      passwordHelp:
        "In your AOL account's Security page, generate an app password for Sigwald.",
    },
  },
  {
    id: "fastmail",
    name: "Fastmail",
    method: "caldav",
    domains: ["fastmail.com", "fastmail.fm"],
    caldav: {
      serverUrl: "https://caldav.fastmail.com",
      passwordLabel: "App-specific password",
      passwordHelpUrl:
        "https://app.fastmail.com/settings/security/integrations",
      passwordHelp:
        "In Fastmail, open Settings, Privacy & Security, then Integrations, and make an app password with CalDAV access.",
    },
  },
  {
    id: "zoho",
    name: "Zoho",
    method: "caldav",
    domains: ["zoho.com", "zohomail.com"],
    caldav: {
      serverUrl: "https://calendar.zoho.com",
      passwordLabel: "App-specific password",
      passwordHelpUrl: "https://accounts.zoho.com/home#security/app_password",
      passwordHelp:
        "In Zoho Accounts, open Security, then App Passwords, and make one for Sigwald.",
    },
  },
  {
    id: "proton",
    name: "Proton",
    method: "ical",
    domains: ["proton.me", "protonmail.com", "pm.me"],
    icalHelp:
      "In Proton Calendar, open the calendar's settings, then Share outside Proton, and copy the full-view link.",
  },
  {
    id: "mailbox-org",
    name: "mailbox.org",
    method: "caldav",
    domains: ["mailbox.org"],
    caldav: {
      serverUrl: "https://dav.mailbox.org",
      passwordLabel: "Password",
      passwordHelp: ACCOUNT_PASSWORD_HELP,
    },
  },
  {
    id: "posteo",
    name: "Posteo",
    method: "caldav",
    domains: ["posteo.de", "posteo.net"],
    caldav: {
      serverUrl: "https://posteo.de:8443",
      passwordLabel: "Password",
      passwordHelp: ACCOUNT_PASSWORD_HELP,
    },
  },
  {
    id: "gmx",
    name: "GMX",
    method: "caldav",
    domains: ["gmx.net", "gmx.de", "gmx.com", "gmx.at", "gmx.ch"],
    caldav: {
      serverUrl: "https://caldav.gmx.net",
      passwordLabel: "Password",
      passwordHelp: ACCOUNT_PASSWORD_HELP,
    },
  },
  {
    id: "webde",
    name: "WEB.DE",
    method: "caldav",
    domains: ["web.de"],
    caldav: {
      serverUrl: "https://caldav.web.de",
      passwordLabel: "Password",
      passwordHelp: ACCOUNT_PASSWORD_HELP,
    },
  },
  {
    id: "yandex",
    name: "Yandex",
    method: "caldav",
    domains: ["yandex.ru", "yandex.com", "ya.ru"],
    caldav: {
      serverUrl: "https://caldav.yandex.ru",
      passwordLabel: "Password",
      passwordHelp: ACCOUNT_PASSWORD_HELP,
    },
  },
  {
    id: "naver",
    name: "Naver",
    method: "caldav",
    domains: ["naver.com"],
    caldav: {
      serverUrl: "https://caldav.calendar.naver.com",
      passwordLabel: "Password",
      passwordHelp: ACCOUNT_PASSWORD_HELP,
    },
  },
  {
    id: "nextcloud",
    name: "Nextcloud",
    method: "caldav",
    domains: [],
    serverPrompt: true,
    caldav: {
      serverUrl: "",
      passwordLabel: "App password",
      passwordHelp:
        "In Nextcloud, open Personal settings, Security, then Devices & sessions, and create an app password.",
    },
  },
  {
    id: "caldav",
    name: "Other CalDAV server",
    method: "caldav",
    domains: [],
    serverPrompt: true,
    caldav: {
      serverUrl: "",
      passwordLabel: "Password",
      passwordHelp:
        "Use an app-specific password if your provider offers one.",
    },
  },
  // Any calendar that publishes a feed, read-only. A pasted link is guessed,
  // and a feed with no telltale in its address guesses wrong, so this tile is
  // the way to say "it's an iCal link" outright.
  {
    id: "ical",
    name: "iCal link",
    method: "ical",
    domains: [],
  },
];

export function providerById(id: string): CalendarProvider | undefined {
  return CALENDAR_PROVIDERS.find((provider) => provider.id === id);
}

export function providerForEmail(email: string): CalendarProvider | undefined {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 0) return undefined;
  const domain = trimmed.slice(at + 1);
  if (!domain) return undefined;
  return CALENDAR_PROVIDERS.find((provider) =>
    provider.domains.includes(domain)
  );
}

function isIcalUrl(original: string, url: URL): boolean {
  const lowerOriginal = original.toLowerCase();
  if (
    lowerOriginal.startsWith("webcal://") ||
    lowerOriginal.startsWith("webcals://")
  ) {
    return true;
  }

  const path = url.pathname.toLowerCase();
  if (path.endsWith(".ics")) return true;
  if (path.includes("/ical/") || path.includes("/published/")) return true;
  if (url.searchParams.get("format")?.toLowerCase() === "ics") return true;
  if (url.href.toLowerCase().includes("format=ics")) return true;
  // Nextcloud's public-calendar export: `.../calendars/<id>?export`.
  if (url.searchParams.has("export")) return true;

  if (
    url.hostname.toLowerCase() === "calendar.google.com" &&
    path.includes("/ical/")
  ) {
    return true;
  }

  return false;
}

export function classifyPastedLink(
  input: string
):
  | { kind: "ical"; url: string }
  | { kind: "caldav"; url: string }
  | { kind: "invalid" } {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "invalid" };

  let normalized = trimmed;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("webcal://")) {
    normalized = `https://${trimmed.slice("webcal://".length)}`;
  } else if (lower.startsWith("webcals://")) {
    normalized = `https://${trimmed.slice("webcals://".length)}`;
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return { kind: "invalid" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { kind: "invalid" };
  }

  if (isIcalUrl(trimmed, url)) {
    return { kind: "ical", url: url.href };
  }

  return { kind: "caldav", url: url.href };
}
