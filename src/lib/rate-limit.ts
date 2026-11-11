/**
 * In-process failed-attempt throttle.
 *
 * Scope, stated plainly: this lives in **one Node process**. It is reset on
 * restart, is not shared between instances, and offers no protection against a
 * distributed attacker. It exists to blunt scripted guessing and accidental
 * retry loops on a single deployment — nothing here is an authorisation
 * decision, and nothing here is a security boundary.
 *
 * Only **failed** attempts consume quota: callers check before an attempt,
 * record a failure only for an input the user can correct, and clear the key
 * after a success. Server/database errors must never be recorded; otherwise an
 * outage would lock out every account.
 *
 * The clock is injected (`now` argument) so the window is testable without
 * sleeping. Keys are opaque server-side strings; no code, digest or child id is
 * ever used as a key by the caller.
 */

export const RATE_LIMIT_MAX_FAILURES = 10;
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Hard cap so a long-lived process cannot grow the map without limit. */
const MAX_TRACKED_KEYS = 5_000;

interface Bucket {
  windowStart: number;
  failures: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitStatus {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets; 0 while attempts remain. */
  retryAfterSeconds: number;
}

function isExpired(bucket: Bucket, now: number): boolean {
  return now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS;
}

/** Drop expired buckets, then the oldest entries if the map is over its cap. */
function prune(now: number): void {
  for (const [key, bucket] of buckets) {
    if (isExpired(bucket, now)) buckets.delete(key);
  }
  while (buckets.size > MAX_TRACKED_KEYS) {
    const oldest = buckets.keys().next();
    if (oldest.done) break;
    buckets.delete(oldest.value);
  }
}

/**
 * Read-only check: may this key attempt now?
 *
 * Never mutates state, so calling it twice (or from a read path) cannot consume
 * a quota. A blocked key keeps its window until it expires.
 */
export function checkRateLimit(
  key: string,
  now: number = Date.now()
): RateLimitStatus {
  const bucket = buckets.get(key);
  if (!bucket || isExpired(bucket, now)) {
    return {
      allowed: true,
      limit: RATE_LIMIT_MAX_FAILURES,
      remaining: RATE_LIMIT_MAX_FAILURES,
      retryAfterSeconds: 0,
    };
  }

  const remaining = Math.max(RATE_LIMIT_MAX_FAILURES - bucket.failures, 0);
  return {
    allowed: remaining > 0,
    limit: RATE_LIMIT_MAX_FAILURES,
    remaining,
    retryAfterSeconds:
      remaining > 0
        ? 0
        : Math.max(
            Math.ceil(
              (bucket.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000
            ),
            1
          ),
  };
}

/** Record one failed attempt. The first failure opens the window. */
export function recordFailure(key: string, now: number = Date.now()): void {
  prune(now);
  const bucket = buckets.get(key);
  if (!bucket || isExpired(bucket, now)) {
    buckets.set(key, { windowStart: now, failures: 1 });
    return;
  }
  bucket.failures += 1;
}

/** A successful attempt clears the key: success is not a failure. */
export function clearFailures(key: string): void {
  buckets.delete(key);
}

/** Test-only reset. Not exported from any route or page. */
export function resetRateLimits(): void {
  buckets.clear();
}
