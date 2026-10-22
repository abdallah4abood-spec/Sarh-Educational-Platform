import type { Role } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { PLATFORM_ADMIN_ROLE, effectiveRoles } from "@/lib/roles";

/**
 * Live authorisation for platform administration.
 *
 * The session/JWT is accepted only as an identity hint. The decision is made
 * from the current `User` row, because a 30-day JWT can otherwise keep a
 * removed `SUPER_ADMIN` working after the database has already demoted them.
 *
 * Both the `/admin/**` layout and the sensitive admin API routes call this
 * module. On any lookup failure the answer is `false`: administration fails
 * closed rather than trusting stale claims.
 */
export interface AdminSessionUser {
  id?: string;
  role?: Role;
  roles?: Role[];
}

export interface AdminSessionLike {
  user?: AdminSessionUser;
}

/**
 * A broken database must not leave an admin page hanging indefinitely. The
 * check is local and normally resolves in milliseconds; this bound only exists
 * so the guard can fail closed promptly when PostgreSQL is unreachable.
 */
const LIVE_ADMIN_CHECK_TIMEOUT_MS = 2_500;

/**
 * True only when the current database row still holds platform administration.
 *
 * `role` and `roles` are intentionally not read from the argument; they are
 * present in the type so callers may pass a full NextAuth session without
 * discarding the claims. The stored row is the source of truth.
 */
export async function hasLiveSuperAdmin(
  sessionUser: AdminSessionUser | null | undefined
): Promise<boolean> {
  const userId = sessionUser?.id;
  if (!userId) return false;

  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const user = await Promise.race([
      prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, roles: true },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("admin role check timed out")),
          LIVE_ADMIN_CHECK_TIMEOUT_MS
        );
      }),
    ]);
    if (!user) return false;

    return effectiveRoles(user.role, user.roles).includes(PLATFORM_ADMIN_ROLE);
  } catch {
    // A database outage must not turn a stale token into an admin grant.
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * API guard shared by every sensitive admin route.
 *
 * Returns `null` when the caller may proceed, otherwise the JSON response the
 * route should return. Unauthenticated callers get 401; a signed-in account
 * whose live row no longer holds `SUPER_ADMIN` gets 403.
 */
export async function requireLiveSuperAdmin(
  session: AdminSessionLike | null | undefined
): Promise<NextResponse | null> {
  if (!session?.user) {
    return NextResponse.json(
      {
        success: false,
        code: "UNAUTHENTICATED",
        message: "يجب تسجيل الدخول أولاً",
      },
      { status: 401 }
    );
  }

  if (!(await hasLiveSuperAdmin(session.user))) {
    return NextResponse.json(
      {
        success: false,
        code: "FORBIDDEN",
        message: "لا تملك صلاحية إدارة المنصة",
      },
      { status: 403 }
    );
  }

  return null;
}
