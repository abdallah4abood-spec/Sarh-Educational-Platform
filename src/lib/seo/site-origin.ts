/**
 * Resolves the public origin used by `/sitemap.xml` and `/robots.txt`.
 *
 * Server-only on purpose: it reads a runtime environment variable, and the value
 * must be the same one a crawler will actually request — not a build-time
 * constant baked into a client bundle.
 *
 * Resolution order (first hit wins):
 *   1. `SITE_URL`               — explicit, runtime, the recommended setting;
 *   2. `NEXT_PUBLIC_APP_URL`    — already used for links inside emails;
 *   3. `NEXTAUTH_URL`           — the existing origin fallback.
 *
 * The result is deliberately `null` when the configured value cannot be a real
 * public origin. Publishing `http://localhost:3000` in production XML would
 * invite crawlers to an address that only exists on a developer machine, so an
 * unusable origin yields no absolute URLs at all instead of a fake sitemap.
 */

/** Hosts that can never be reached by a crawler. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function isUnreachableHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (LOOPBACK_HOSTS.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  // RFC 1918 ranges, in case someone points the app at a LAN address.
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;

  return false;
}

/**
 * Absolute origin (`https://sarh.ps`) or `null` when none is usable.
 *
 * Loopback and LAN hosts are rejected in every environment except development:
 * `next dev` on a laptop must still be able to serve a working sitemap, while a
 * production build must never publish one pointing at localhost.
 */
export function publicSiteOrigin(): string | null {
  const raw = (
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    ""
  ).trim();

  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  // Credentials in a public URL are a configuration leak, not a valid origin.
  if (parsed.username || parsed.password) return null;

  const development = process.env.NODE_ENV === "development";
  if (!development && isUnreachableHost(parsed.hostname)) return null;

  return `${parsed.protocol}//${parsed.host}`;
}
