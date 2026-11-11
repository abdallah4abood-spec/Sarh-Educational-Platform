import type { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { effectiveRoles } from "@/lib/roles";

/**
 * Teacher data scope (`/teacher/**`, decision D5).
 *
 * `User.role = TEACHER` and the `TEACHER` claim in the JWT say which portal an
 * account may open. Neither says **which centre** the account currently works
 * for, or whether it still works for one at all. That decision is made here,
 * from PostgreSQL, on every server render and before any teacher read.
 *
 * Authority is exactly one thing: an **ACTIVE** `StaffMember` row whose `role`
 * is `TEACHER`. `ON_LEAVE` and `INACTIVE` rows grant nothing, and every other
 * staff role (`SECRETARY`, `SUPERVISOR`, `STAFF`, `CENTER_ADMIN`) is not a
 * teaching grant.
 *
 * The result is deliberately three-valued rather than "pick something":
 *
 *   `scope`      exactly one institution is chosen and validated.
 *   `ambiguous`  the account works at more than one centre and no institution
 *                was requested. The caller renders a selector and **no data**;
 *                there is no "first membership" fallback, because silently
 *                choosing would put one centre's roster in front of a teacher
 *                who is thinking about another.
 *   `denied`     no usable membership, or an explicit request for an
 *                institution the account does not actively teach at. A denied
 *                request never falls back to a different institution.
 */
export interface TeacherScope {
  userId: string;
  institutionId: string;
  institutionName: string;
  /** The ACTIVE membership row that justified this scope. */
  membershipId: string;
}

export type TeacherScopeDenialReason =
  /** No such account row. */
  | "unknown-user"
  /** The account has no teaching membership at all and no stored TEACHER tier. */
  | "not-teacher"
  /** Every teaching membership is ON_LEAVE / INACTIVE. */
  | "no-membership"
  /** An explicit institution was requested that the account does not actively teach at. */
  | "institution-not-granted"
  /** The database could not be read; nothing is assumed. */
  | "lookup-failed";

export type TeacherScopeResult =
  | { kind: "scope"; scope: TeacherScope }
  | {
      kind: "ambiguous";
      institutions: { id: string; name: string }[];
    }
  | { kind: "denied"; reason: TeacherScopeDenialReason };

/**
 * Resolve the caller's teacher scope.
 *
 * `requestedInstitutionId` is the `?institution=` selector. It is honoured only
 * when it matches an ACTIVE teaching membership; anything else is
 * `institution-not-granted` (no fallback).
 */
export async function resolveTeacherScope(
  userId: string,
  requestedInstitutionId?: string | null
): Promise<TeacherScopeResult> {
  if (!userId) return { kind: "denied", reason: "unknown-user" };

  let user: { role: Role; roles: Role[] } | null;
  let memberships: {
    id: string;
    institution: { id: string; name: string };
  }[];

  try {
    const [row, rows] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, roles: true },
      }),
      prisma.staffMember.findMany({
        where: { userId, status: "ACTIVE", role: "TEACHER" },
        // Deterministic order, so a multi-centre selector renders the same
        // list on every request.
        orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          institution: { select: { id: true, name: true } },
        },
      }),
    ]);
    user = row;
    memberships = rows;
  } catch {
    return { kind: "denied", reason: "lookup-failed" };
  }

  if (!user) return { kind: "denied", reason: "unknown-user" };

  if (memberships.length === 0) {
    const storedTier = effectiveRoles(user.role, user.roles).includes(
      "TEACHER"
    );
    // No live membership means no scope, whether or not the account still
    // stores the TEACHER tier.
    return {
      kind: "denied",
      reason: storedTier ? "no-membership" : "not-teacher",
    };
  }

  const requested = requestedInstitutionId?.trim();
  if (requested) {
    const match = memberships.find(
      (row) => row.institution.id === requested
    );
    if (!match) return { kind: "denied", reason: "institution-not-granted" };

    return {
      kind: "scope",
      scope: {
        userId,
        institutionId: match.institution.id,
        institutionName: match.institution.name,
        membershipId: match.id,
      },
    };
  }

  if (memberships.length === 1) {
    const only = memberships[0];
    return {
      kind: "scope",
      scope: {
        userId,
        institutionId: only.institution.id,
        institutionName: only.institution.name,
        membershipId: only.id,
      },
    };
  }

  return {
    kind: "ambiguous",
    institutions: memberships.map((row) => ({
      id: row.institution.id,
      name: row.institution.name,
    })),
  };
}
