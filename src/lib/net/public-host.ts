import { lookup } from "dns/promises";
import net from "net";

/*
 * The SSRF guard for every request Sigwald makes to a host a user typed or
 * pasted: an iCal link, or the domain of an email address being looked up.
 * Such a request must never reach this machine, its network or a cloud
 * metadata endpoint.
 */

/**
 * Extracts the embedded IPv4 dotted address from an IPv4-mapped IPv6 literal
 * (`::ffff:a.b.c.d`), returning `null` if the input is not such a literal.
 *
 * Node/WHATWG-URL canonicalizes the bracketed dotted form to the compressed
 * HEX form (`::ffff:127.0.0.1` -> `::ffff:7f00:1`), so a dotted-only check let a
 * mapped loopback/metadata address slip past the SSRF guard. We normalize both
 * the dotted (`::ffff:127.0.0.1`) and the two-group hex (`::ffff:7f00:1`) forms
 * back to dotted IPv4 so the v4 classifier can vet them.
 */
function mappedIpv4(lowerIp: string): string | null {
  const match = lowerIp.match(/^::ffff:(.+)$/);
  if (!match) return null;

  const rest = match[1];
  // Already dotted (::ffff:127.0.0.1).
  if (/^\d+\.\d+\.\d+\.\d+$/.test(rest)) return rest;

  // Compressed hex form: two 16-bit groups encoding the 32-bit v4 address.
  const groups = rest.split(":");
  if (groups.length !== 2) return null;
  const hi = parseInt(groups[0], 16);
  const lo = parseInt(groups[1], 16);
  if (Number.isNaN(hi) || Number.isNaN(lo)) return null;
  return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff].join(".");
}

/**
 * Returns true if an IP address string is in a loopback, private, link-local,
 * or otherwise non-public range that we must not let a user-supplied URL reach.
 */
export function isPrivateIp(ip: string): boolean {
  const type = net.isIP(ip);

  if (type === 4) {
    const parts = ip.split(".").map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  if (type === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local
    // IPv4-mapped IPv6 (::ffff:a.b.c.d or its compressed hex form) - validate
    // the embedded v4 so a mapped private/loopback address can't slip through.
    const mapped = mappedIpv4(lower);
    if (mapped) return isPrivateIp(mapped);
    return false;
  }

  // Not a recognizable IP literal.
  return false;
}

/**
 * Rejects URLs whose host is loopback, a literal private/link-local IP, a
 * cloud metadata endpoint, or an internal-only hostname. This is the
 * synchronous, hostname-level SSRF guard; `assertResolvesPublic` adds a
 * DNS-resolution check for hostnames that resolve into private space.
 *
 * @throws If the host must not be fetched
 */
export function assertPublicHost(parsed: URL): void {
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (!host) {
    throw new Error("URL has no host");
  }

  // Obvious internal names.
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    throw new Error(`Refusing to fetch internal host: ${host}`);
  }

  // Literal IP host in a non-public range.
  if (net.isIP(host) && isPrivateIp(host)) {
    throw new Error(`Refusing to fetch private address: ${host}`);
  }
}

/**
 * Resolves the host and rejects if any resolved address is in private space.
 * Catches public hostnames that point at internal IPs (a common SSRF vector).
 * Best-effort: if resolution fails we let the fetch surface the network error.
 *
 * Known residual risk (DNS rebinding): this check resolves the host, but the
 * subsequent `fetch` resolves it again, so a hostile domain could return a
 * public IP here and a private/metadata IP at connect time (TOCTOU). Fully
 * closing this requires pinning the vetted address into the connection via a
 * custom dispatcher/lookup.
 * //todo: pin the resolved IP into the fetch (undici dispatcher with a `lookup`
 * that returns the pre-vetted address) to defeat DNS rebinding.
 */
export async function assertResolvesPublic(parsed: URL): Promise<void> {
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // Literal IPs are already covered by assertPublicHost.
  if (net.isIP(host)) return;

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    // DNS failure: let the actual fetch report the connection error.
    return;
  }

  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new Error(
        `Refusing to fetch host that resolves to a private address: ${host}`
      );
    }
  }
}

