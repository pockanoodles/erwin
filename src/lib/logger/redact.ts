/**
 * Strips credentials out of log entries on the way to storage.
 *
 * The point is to make a leak structurally impossible rather than merely
 * absent. Nothing in the tree deliberately logs a secret today, but the logger
 * writes whatever a caller hands it into an unencrypted `Log` table *and* to
 * stdout, which launchd captures to a file on disk. One route already came
 * close: it logged `JSON.stringify(feed)` where the feed was loaded with its
 * account included, so a live CalDAV password would have gone to both. That
 * call site is fixed, but a redaction pass means the next one like it is
 * harmless.
 *
 * Two independent mechanisms, because credentials arrive in two shapes:
 *
 * 1. **By key** — `{ accessToken: "..." }`, at any depth.
 * 2. **By pattern inside a string** — an `Authorization` header value, or a
 *    whole record that a caller already serialized to JSON, where the key is
 *    no longer a key. This is what the `JSON.stringify(feed)` case looked
 *    like, so pattern matching is the half that would actually have caught it.
 *
 * Deliberately not redacted: `syncToken` and `ctag` are sync cursors, not
 * credentials, and blanking them would make sync debugging much harder.
 */

export const REDACTED = "[redacted]";

/**
 * Key names whose values are always secret. Compared with separators and case
 * removed, so `access_token`, `accessToken` and `Access-Token` all match.
 */
const SENSITIVE_KEYS = new Set([
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "sessiontoken",
  "csrftoken",
  "password",
  "passwordhash",
  "secret",
  "clientsecret",
  "googleclientsecret",
  "outlookclientsecret",
  "apikey",
  "resendapikey",
  "authorization",
  "cookie",
  "credentials",
  "privatekey",
  "erwinsecretkey",
  "nextauthsecret",
]);

/** Suffixes that mark a secret regardless of prefix, e.g. `stripeApiKey`. */
const SENSITIVE_SUFFIXES = ["secret", "password", "apikey", "accesstoken", "refreshtoken"];

function normalizeKey(key: string): string {
  return key.replace(/[_\-\s]/g, "").toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (SENSITIVE_KEYS.has(normalized)) return true;
  return SENSITIVE_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

/**
 * Patterns for secrets embedded in a string, where there is no key to match.
 * Each keeps the recognizable prefix so the log still says what was removed.
 */
const STRING_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  // Authorization header values.
  { pattern: /\b(Basic|Bearer)\s+[A-Za-z0-9+/=._~-]{8,}/gi, replacement: `$1 ${REDACTED}` },
  // A credential inside an already-serialized JSON blob.
  {
    pattern:
      /("(?:[A-Za-z_-]*)(?:access_?token|refresh_?token|id_?token|password|secret|api_?key)"\s*:\s*)"(?:\\.|[^"\\])*"/gi,
    replacement: `$1"${REDACTED}"`,
  },
  // Credentials embedded in a URL: https://user:pass@host
  {
    pattern: /(\b[a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^/\s@]+)@/gi,
    replacement: `$1$2:${REDACTED}@`,
  },
];

/** Applies the string patterns. Exported for the message path. */
export function redactString(value: string): string {
  let result = value;
  for (const { pattern, replacement } of STRING_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Depth cap so a pathological or cyclic structure cannot spin. Prisma JSON
 * columns do not hold cycles, but log metadata is caller-supplied.
 */
const MAX_DEPTH = 12;

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return REDACTED;

  if (seen.has(value as object)) return REDACTED;
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, depth + 1, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    result[key] = isSensitiveKey(key)
      ? REDACTED
      : redactValue(entry, depth + 1, seen);
  }
  return result;
}

/** Redacts a metadata object. Returns a new object; the input is untouched. */
export function redactMetadata<T>(metadata: T): T {
  if (metadata === null || metadata === undefined) return metadata;
  return redactValue(metadata, 0, new WeakSet()) as T;
}
