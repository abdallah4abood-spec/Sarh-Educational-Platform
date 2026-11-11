import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  checkRateLimit,
  clearFailures,
  recordFailure,
  resetRateLimits,
  RATE_LIMIT_MAX_FAILURES,
  RATE_LIMIT_WINDOW_MS,
} from "@/lib/rate-limit";

/**
 * The throttle is deliberately in-process. These tests pin its contract:
 * ten failures block the eleventh, a success clears the key, a server-side
 * decision never consumes quota, and the window is driven by an injected clock
 * so nothing sleeps.
 */
describe("in-process failed-attempt throttle", () => {
  beforeEach(() => resetRateLimits());

  it("allows ten failures and blocks the eleventh with Retry-After", () => {
    const start = 1_000_000;
    for (let attempt = 0; attempt < RATE_LIMIT_MAX_FAILURES; attempt += 1) {
      const status = checkRateLimit("account-1", start + attempt);
      assert.equal(status.allowed, true);
      assert.equal(status.remaining, RATE_LIMIT_MAX_FAILURES - attempt);
      assert.equal(status.retryAfterSeconds, 0);
      recordFailure("account-1", start + attempt);
    }

    const blocked = checkRateLimit("account-1", start + 20);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfterSeconds > 0);
    assert.ok(blocked.retryAfterSeconds <= RATE_LIMIT_WINDOW_MS / 1000);

    // The hint shrinks as the window advances.
    const later = checkRateLimit("account-1", start + 60_000);
    assert.ok(later.retryAfterSeconds < blocked.retryAfterSeconds);
  });

  it("never consumes quota just by checking", () => {
    const start = 2_000_000;
    for (let i = 0; i < 25; i += 1) {
      assert.equal(checkRateLimit("account-2", start + i).allowed, true);
    }
    assert.equal(checkRateLimit("account-2", start + 25).remaining, 10);
  });

  it("clears the counter after a success", () => {
    const start = 3_000_000;
    for (let i = 0; i < 9; i += 1) recordFailure("account-3", start + i);
    assert.equal(checkRateLimit("account-3", start + 10).remaining, 1);

    clearFailures("account-3");
    assert.equal(checkRateLimit("account-3", start + 11).allowed, true);
    assert.equal(checkRateLimit("account-3", start + 11).remaining, 10);
  });

  it("reopens after the window expires", () => {
    const start = 4_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX_FAILURES; i += 1) {
      recordFailure("account-4", start + i);
    }
    assert.equal(checkRateLimit("account-4", start + 100).allowed, false);
    assert.equal(
      checkRateLimit("account-4", start + RATE_LIMIT_WINDOW_MS + 1).allowed,
      true
    );
  });

  it("keeps accounts independent", () => {
    const start = 5_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX_FAILURES; i += 1) {
      recordFailure("account-a", start + i);
    }
    assert.equal(checkRateLimit("account-a", start + 50).allowed, false);
    assert.equal(checkRateLimit("account-b", start + 50).allowed, true);
  });
});
