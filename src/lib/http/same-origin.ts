/**
 * Same-origin gate for state-changing requests.
 *
 * A browser sends `Origin` on every cross-origin POST/DELETE and on same-origin
 * form/fetch submissions, so comparing it with the request's own origin is the
 * cheapest CSRF defence that needs no token state. Anything that is not an
 * exact origin match — including a missing header — is rejected, which means a
 * server-to-server call has to be made deliberately from the app itself.
 *
 * Scope, stated plainly: this runs per route, not globally; it complements the
 * SameSite cookie policy configured in `src/lib/auth.ts` and does not replace
 * authentication. `Origin: null` (sandboxed iframes, some redirects) is denied.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;

  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return false;
  }

  try {
    return new URL(origin).origin === requestOrigin;
  } catch {
    return false;
  }
}

/** The JSON answer every rejected cross-origin write gets. */
export function crossOriginRejection() {
  return {
    success: false as const,
    code: "CROSS_ORIGIN_REJECTED",
    message: "طلب غير مصرح به من مصدر آخر",
  };
}

export const CROSS_ORIGIN_STATUS = 403;
