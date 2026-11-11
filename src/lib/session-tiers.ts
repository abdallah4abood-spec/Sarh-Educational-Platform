import type { Role } from "@prisma/client";

import { userHasInstitutionPortalGrant } from "@/lib/institution-access";
import { prisma } from "@/lib/prisma";
import { effectiveRoles } from "@/lib/roles";

/**
 * Live session tiers (decision D5).
 *
 * A JWT is a snapshot. The claims inside it were true when it was written and
 * stay in the cookie for up to 30 days, so any authorisation tier that comes
 * from a *membership* must be rebuilt from PostgreSQL whenever the token is
 * touched — not only at sign-in.
 *
 * This module is that one rebuild, and the **database row is the only input**:
 * neither `role` nor `roles` is read from the token. That is what lets a
 * membership-derived `TEACHER` tier disappear after the membership lapses,
 * instead of being copied forward from the cookie that still carries it.
 *
 * Rules, all additive to the stored tiers:
 *
 *   User.role / User.roles   Read from PostgreSQL, never written here.
 *   TEACHER                  Added by an ACTIVE StaffMember row whose role is
 *                            TEACHER. `ON_LEAVE` / `INACTIVE` / every other
 *                            staff role contributes nothing. SECRETARY is
 *                            deliberately not a teaching tier and has no portal
 *                            of its own yet.
 *   INSTITUTION_TEACHER      Existing behaviour, preserved: ownership or an
 *                            ACTIVE CENTER_ADMIN membership (see
 *                            `userHasInstitutionPortalGrant`).
 *
 * The result is only a *portal* key. It never grants tenant data: every
 * teacher read re-checks a live ACTIVE membership through
 * `resolveTeacherScope`, so revoking a membership denies data on the next
 * request even while a stale cookie still carries the TEACHER tier.
 */

/** The tier set PostgreSQL says this account holds right now. */
export interface LiveTiers {
  /** The account's primary tier (`User.role`). */
  role: Role;
  /** Primary tier plus every tier the account currently qualifies for. */
  roles: Role[];
}

export type LiveTiersResult =
  | { kind: "ok"; tiers: LiveTiers }
  /** No such account: it holds no tiers at all. */
  | { kind: "unknown-user" }
  /**
   * The database could not be read. Callers must keep whatever they already
   * had and must **not** add a membership-derived tier: a failed lookup is not
   * evidence of authority.
   */
  | { kind: "unavailable" };

export async function loadLiveTiers(
  userId: string
): Promise<LiveTiersResult> {
  if (!userId) return { kind: "unknown-user" };

  let user: { role: Role; roles: Role[] } | null;
  try {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, roles: true },
    });
  } catch {
    return { kind: "unavailable" };
  }

  if (!user) return { kind: "unknown-user" };

  const tiers = effectiveRoles(user.role, user.roles);

  try {
    const [teacherMembership, institutionGrant] = await Promise.all([
      tiers.includes("TEACHER")
        ? Promise.resolve(true)
        : prisma.staffMember
            .findFirst({
              where: { userId, status: "ACTIVE", role: "TEACHER" },
              select: { id: true },
            })
            .then((row) => Boolean(row)),
      tiers.includes("INSTITUTION_TEACHER")
        ? Promise.resolve(true)
        : userHasInstitutionPortalGrant(userId),
    ]);

    if (teacherMembership && !tiers.includes("TEACHER")) tiers.push("TEACHER");
    if (institutionGrant && !tiers.includes("INSTITUTION_TEACHER")) {
      tiers.push("INSTITUTION_TEACHER");
    }
  } catch {
    // Fail closed: only the tiers the account itself stores.
    return { kind: "ok", tiers: { role: user.role, roles: effectiveRoles(user.role, user.roles) } };
  }

  return { kind: "ok", tiers: { role: user.role, roles: tiers } };
}
