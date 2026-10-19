import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import type { Role } from "@prisma/client";

import {
  PORTALS,
  ROLE_HOME,
  canEnterPortal,
  effectiveRoles,
  homeForRoles,
  portalForPath,
} from "@/lib/roles";

/**
 * SARH (صَرْح) — RBAC route guard.
 *
 * Every rule here comes from `src/lib/roles.ts`, the one registry that maps a
 * tier to the portal it owns. Nothing in this file hard-codes a route → role
 * pair, so adding a tier or renaming a route cannot leave a hole: the guard,
 * the sign-in redirect, the navbar switcher and the dashboard sidebar all read
 * the same table.
 *
 * Four gates, in order:
 *
 *   1. legacy aliases  — old URLs are forwarded (308) to their new homes;
 *   2. API guards      — JSON 401/403, never a redirect;
 *   3. auth pages      — a signed-in user is bounced to their own portal;
 *   4. portal guards   — tier isolation for /parent, /teacher, /supervisor,
 *                        /institution and /admin.
 *
 * Tier isolation is strict: a tier reaches its own portal and nothing else,
 * except `SUPER_ADMIN`, which is the platform role and may enter every portal
 * to inspect or unblock it (see `canEnterPortal`).
 *
 * A second gate sits in front of every portal: an account whose email is not
 * verified yet (`emailVerified === false` in the JWT) is bounced to
 * /auth/signin?unverified=1 instead of entering a dashboard. Google accounts
 * are stamped verified on first sign-in, so only fresh credential signups are
 * affected, and they can always reach /auth/signin to resend the link.
 */

/** `/api/parent/**`, `/api/teacher/**`, … — one guard per portal. */
const API_GUARDS = PORTALS.map((portal) => ({
  prefix: `/api${portal.prefix}`,
  portal,
}));

/** Canonical auth pages that a signed-in user should never sit on. */
const AUTH_PAGES = ["/auth/signin", "/auth/signup"];

/**
 * Legacy routes from the previous information architecture.
 *
 * Handled here rather than in next.config so there is exactly one place that
 * decides where an unauthenticated visitor lands — and so the query string
 * (callbackUrl, ?unverified) survives the hop.
 */
const LEGACY_REDIRECTS: Record<string, string> = {
  "/login": "/auth/signin",
  "/signup": "/auth/signup",
  // The teacher dashboard moved from a single deep page into the teacher
  // portal; the academy and old bookmarks still point at the old URL.
  "/teacher/dashboard": "/teacher",
  "/parent/feed/dashboard": "/parent",
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const legacyTarget = LEGACY_REDIRECTS[pathname];
  if (legacyTarget) {
    const url = request.nextUrl.clone();
    url.pathname = legacyTarget;
    return NextResponse.redirect(url, 308);
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const isAuthenticated = Boolean(token);
  // Every tier the account holds. A token minted before the multi-tier claim
  // existed still yields its single primary role, so older cookies keep
  // working instead of locking their owner out.
  const roles = effectiveRoles(
    token?.role as Role | undefined,
    token?.roles as Role[] | undefined
  );
  const activeRole = (token?.activeRole as Role | undefined) ?? roles[0];
  // Strict equality: a token that predates the claim (undefined) counts as
  // unverified, so an old cookie can never bypass the gate.
  const emailVerified = token?.emailVerified === true;

  // ---- 1. API guards: answer with JSON status codes, never redirect. ----
  const apiGuard = API_GUARDS.find(({ prefix }) => pathname.startsWith(prefix));
  if (apiGuard) {
    if (!isAuthenticated || roles.length === 0) {
      return NextResponse.json(
        { success: false, message: "يجب تسجيل الدخول أولاً" },
        { status: 401 }
      );
    }
    if (!emailVerified) {
      return NextResponse.json(
        {
          success: false,
          code: "EMAIL_NOT_VERIFIED",
          message: "يجب تأكيد بريدك الإلكتروني قبل استخدام هذه الخدمة",
        },
        { status: 403 }
      );
    }
    if (!canEnterPortal(apiGuard.portal, roles)) {
      return NextResponse.json(
        { success: false, message: "لا تملك صلاحية الوصول لهذا المورد" },
        { status: 403 }
      );
    }
    return NextResponse.next();
  }

  // ---- 2. Auth pages: bounce already-verified users to their portal. ----
  if (AUTH_PAGES.includes(pathname)) {
    if (isAuthenticated && roles.length > 0 && emailVerified) {
      return NextResponse.redirect(
        new URL(ROLE_HOME[activeRole ?? roles[0]], request.url)
      );
    }
    // An unverified session stays on /auth/signin (and /auth/signup) so the
    // notice and the resend action are reachable — redirecting would loop
    // forever.
    return NextResponse.next();
  }

  // ---- 3. Portal guards (tier isolation). ----
  const portal = portalForPath(pathname);
  if (portal) {
    if (!isAuthenticated) {
      const loginUrl = new URL("/auth/signin", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (!emailVerified) {
      const loginUrl = new URL("/auth/signin", request.url);
      loginUrl.searchParams.set("unverified", "1");
      loginUrl.searchParams.set("email", token?.email ?? "");
      return NextResponse.redirect(loginUrl);
    }

    if (!canEnterPortal(portal, roles)) {
      // Authenticated but this is not their tier → send them to the portal
      // their account actually owns instead of a dead end. A role with no
      // portal at all is sent to the public site.
      const fallback = activeRole
        ? ROLE_HOME[activeRole]
        : homeForRoles(roles);
      return NextResponse.redirect(new URL(fallback || "/", request.url));
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/parent/:path*",
    "/teacher/:path*",
    "/supervisor/:path*",
    "/institution/:path*",
    "/admin/:path*",
    "/api/parent/:path*",
    "/api/teacher/:path*",
    "/api/supervisor/:path*",
    "/api/institution/:path*",
    "/api/admin/:path*",
    "/auth/signin",
    "/auth/signup",
    // Legacy aliases stay matched so the redirects above always fire.
    "/login",
    "/signup",
    // The pre-portal teacher dashboard URL.
    "/teacher/dashboard",
  ],
};
