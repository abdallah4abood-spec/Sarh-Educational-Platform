import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";

import {
  authOptions,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/auth";

/**
 * NextAuth catch-all handler.
 *
 * The only behaviour added on top of the library is "remember me". Cookie
 * lifetime is an HTTP concern that the sign-in payload cannot influence, so the
 * login form first drops a plain, script-readable hint cookie and this wrapper
 * reads it while building the options for that one request:
 *
 *   sarh-remember=1  → persistent cookie (`maxAge` = 30 days) — the default
 *   sarh-remember=0  → no `maxAge`, so the browser discards it on close
 *
 * The JWT keeps its own 30-day ceiling either way; only the browser's decision
 * to keep the cookie changes. Nothing else about the options is altered, and
 * a request without the hint gets `authOptions` untouched.
 */
const handler = NextAuth(authOptions);

/** Plain hint cookie written by the sign-in form (see REMEMBER_COOKIE). */
const REMEMBER_HINT_COOKIE = "sarh-remember";

function rememberRequested(request: Request): boolean {
  const header = request.headers.get("cookie");
  if (!header) return true;

  const match = new RegExp(`(?:^|;\\s*)${REMEMBER_HINT_COOKIE}=([^;]*)`).exec(
    header
  );

  // Missing hint keeps the historical behaviour: stay signed in.
  if (!match) return true;
  return decodeURIComponent(match[1] ?? "1") !== "0";
}

function optionsForRequest(request: Request): NextAuthOptions {
  if (rememberRequested(request)) return authOptions;

  return {
    ...authOptions,
    cookies: {
      ...authOptions.cookies,
      sessionToken: {
        name: SESSION_COOKIE_NAME,
        // `maxAge: undefined` serialises to a cookie with no Max-Age.
        options: { ...SESSION_COOKIE_OPTIONS, maxAge: undefined },
      },
    },
  };
}

/**
 * Strips the persistence attributes from the session cookie.
 *
 * Dropping `maxAge` from the cookie options is not enough on its own: the
 * sign-in callback also passes an explicit `expires`, which wins over the base
 * options because per-write values are merged last. Rather than fight the
 * library, the one header that decides this is rewritten on the way out — an
 * `Expires` or `Max-Age` on the session cookie is precisely what "remember me"
 * is supposed to remove.
 */
function stripSessionCookiePersistence(response: Response): Response {
  const readAll = (
    response.headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie;
  const cookies = readAll ? readAll.call(response.headers) : [];
  if (cookies.length === 0) return response;

  let touched = false;
  const rewritten = cookies.map((cookie) => {
    const name = cookie.slice(0, cookie.indexOf("="));
    // Chunked cookies carry a numeric suffix, so match on the prefix.
    if (!name.startsWith(SESSION_COOKIE_NAME)) return cookie;
    touched = true;
    return cookie
      .split("; ")
      .filter((part) => !/^Max-Age=/i.test(part) && !/^Expires=/i.test(part))
      .join("; ");
  });

  if (!touched) return response;

  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  for (const cookie of rewritten) headers.append("set-cookie", cookie);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function GET(
  request: Request,
  context: { params: { nextauth: string[] } }
) {
  return handler(request, context);
}

export async function POST(
  request: Request,
  context: { params: { nextauth: string[] } }
) {
  const response = await NextAuth(optionsForRequest(request))(request, context);

  return rememberRequested(request)
    ? response
    : stripSessionCookiePersistence(response);
}
