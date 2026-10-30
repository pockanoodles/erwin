import dns from "dns/promises";

import { providerForEmail } from "./calendar-providers";
import { assertPublicHost, assertResolvesPublic } from "./net/public-host";

/**
 * Works out where the calendar for an email address lives when the domain
 * isn't one of the known ones in calendar-providers.ts: a company on Google
 * Workspace or Microsoft 365, a custom domain at Fastmail or iCloud, or a
 * server that announces its own CalDAV address.
 *
 * Only the domain ever leaves Sigwald, never the address. The DNS lookups go to
 * the machine's resolver, and the last step sends one unauthenticated PROPFIND
 * to the domain's `/.well-known/caldav` (RFC 6764). Every host probed passes the
 * public-host guard first. This is the one place discovery reaches out.
 */
export type Discovery =
  | { kind: "provider"; providerId: string; serverUrl?: string; via: "domain" | "mx" }
  | { kind: "caldav"; serverUrl: string; via: "srv" | "well-known" }
  | { kind: "unknown" };

export interface DiscoveryDeps {
  resolveMx: (domain: string) => Promise<{ exchange: string; priority: number }[]>;
  resolveSrv: (
    name: string
  ) => Promise<{ name: string; port: number; priority: number; weight: number }[]>;
  resolveTxt: (name: string) => Promise<string[][]>;
  fetch: typeof fetch;
  /** Vets a host before Sigwald sends it anything. */
  assertPublic: (url: URL) => Promise<void>;
}

const PROBE_TIMEOUT_MS = 5_000;

const defaultDeps: DiscoveryDeps = {
  resolveMx: (domain) => dns.resolveMx(domain),
  resolveSrv: (name) => dns.resolveSrv(name),
  resolveTxt: (name) => dns.resolveTxt(name),
  fetch: (...args) => fetch(...args),
  assertPublic: async (url) => {
    assertPublicHost(url);
    await assertResolvesPublic(url);
  },
};

/** `host` is `suffix` or a subdomain of it, so `notzoho.com` isn't Zoho. */
function under(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

/**
 * Mail hosts that say which service a domain is on. A domain whose mail a
 * service handles almost always keeps its calendar there too.
 */
const MX_RULES: { suffix: string; providerId: string; serverUrl?: string }[] = [
  { suffix: "google.com", providerId: "google" },
  { suffix: "googlemail.com", providerId: "google" },
  { suffix: "protection.outlook.com", providerId: "microsoft" },
  { suffix: "mail.icloud.com", providerId: "icloud" },
  { suffix: "messagingengine.com", providerId: "fastmail" },
  { suffix: "zoho.com", providerId: "zoho" },
  // Zoho keeps each region's accounts, calendar included, in that region.
  { suffix: "zoho.eu", providerId: "zoho", serverUrl: "https://calendar.zoho.eu" },
  { suffix: "zoho.in", providerId: "zoho", serverUrl: "https://calendar.zoho.in" },
  { suffix: "zoho.com.au", providerId: "zoho", serverUrl: "https://calendar.zoho.com.au" },
  { suffix: "protonmail.ch", providerId: "proton" },
  { suffix: "mailbox.org", providerId: "mailbox-org" },
];

/** The domain of an address, or null when it isn't a plausible public one. */
export function emailDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 1) return null;
  const domain = trimmed.slice(at + 1).replace(/\.$/, "");
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    return null;
  }
  return domain;
}

async function byMx(domain: string, deps: DiscoveryDeps): Promise<Discovery | null> {
  let records: { exchange: string; priority: number }[];
  try {
    records = await deps.resolveMx(domain);
  } catch {
    return null;
  }
  const ordered = [...records].sort((a, b) => a.priority - b.priority);
  for (const { exchange } of ordered) {
    const host = exchange.toLowerCase().replace(/\.$/, "");
    // The longest matching suffix wins, so a narrower rule beats a broader one.
    const rule = MX_RULES.filter((r) => under(host, r.suffix)).sort(
      (a, b) => b.suffix.length - a.suffix.length
    )[0];
    if (rule) {
      return {
        kind: "provider",
        providerId: rule.providerId,
        ...(rule.serverUrl ? { serverUrl: rule.serverUrl } : {}),
        via: "mx",
      };
    }
  }
  return null;
}

/** RFC 6764: `_caldavs._tcp` names the server, and its TXT `path=` the path. */
async function bySrv(domain: string, deps: DiscoveryDeps): Promise<Discovery | null> {
  const name = `_caldavs._tcp.${domain}`;
  let records: { name: string; port: number; priority: number; weight: number }[];
  try {
    records = await deps.resolveSrv(name);
  } catch {
    return null;
  }
  const best = [...records]
    // A target of "." says the service is deliberately not offered.
    .filter((r) => r.name && r.name !== ".")
    .sort((a, b) => a.priority - b.priority || b.weight - a.weight)[0];
  if (!best) return null;

  const host = best.name.replace(/\.$/, "");
  const url = new URL(`https://${host}${best.port && best.port !== 443 ? `:${best.port}` : ""}`);
  try {
    const txt = await deps.resolveTxt(name);
    const path = txt
      .map((chunks) => chunks.join(""))
      .find((entry) => entry.startsWith("path="))
      ?.slice("path=".length);
    if (path && path.startsWith("/")) url.pathname = path;
  } catch {
    // No TXT record: the client discovers the path from the root.
  }
  try {
    await deps.assertPublic(url);
  } catch {
    return null;
  }
  return { kind: "caldav", serverUrl: url.href.replace(/\/$/, ""), via: "srv" };
}

/**
 * A server that answers PROPFIND on `/.well-known/caldav` with a redirect, a
 * multistatus or a demand for credentials is a CalDAV server. A plain web
 * server answers 404, 405 or a page.
 */
async function byWellKnown(domain: string, deps: DiscoveryDeps): Promise<Discovery | null> {
  for (const host of [domain, `caldav.${domain}`]) {
    const url = new URL(`https://${host}/.well-known/caldav`);
    try {
      await deps.assertPublic(url);
    } catch {
      continue;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const response = await deps.fetch(url, {
        method: "PROPFIND",
        headers: { Depth: "0" },
        redirect: "manual",
        signal: controller.signal,
      });
      const redirected =
        response.status >= 301 && response.status <= 308 && !!response.headers.get("location");
      if (response.status === 207 || response.status === 401 || redirected) {
        return { kind: "caldav", serverUrl: `https://${host}`, via: "well-known" };
      }
    } catch {
      // Unreachable or too slow: try the next host.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export async function discoverCalendar(
  email: string,
  deps: DiscoveryDeps = defaultDeps
): Promise<Discovery> {
  const known = providerForEmail(email);
  if (known) return { kind: "provider", providerId: known.id, via: "domain" };

  const domain = emailDomain(email);
  if (!domain) return { kind: "unknown" };
  try {
    assertPublicHost(new URL(`https://${domain}`));
  } catch {
    return { kind: "unknown" };
  }

  return (
    (await byMx(domain, deps)) ??
    (await bySrv(domain, deps)) ??
    (await byWellKnown(domain, deps)) ?? { kind: "unknown" }
  );
}
