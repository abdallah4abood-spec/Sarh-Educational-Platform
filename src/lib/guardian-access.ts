import { prisma } from "@/lib/prisma";
import { effectiveRoles } from "@/lib/roles";

/**
 * Guardian access policy (`/parent/**`) — phase 4.3.
 *
 * `StudentGuardianGrant` with `status = APPROVED` is the **only** source of
 * access to a child's institutional records. The grant names both the child
 * and the institution, so approving a guardian at centre A can never open
 * centre B's logs, grades, announcements or staff rosters.
 *
 * `StudentGuardian` remains the family relationship (and the home of
 * `isPrimary`). Its `status` is a synchronised summary for display, never an
 * authorisation gate. `Student.parentId` is still never consulted.
 *
 * Two account checks remain: a live `PARENT` tier and a verified email. Both
 * are read from the database on every call, so a stale JWT cannot outlive a
 * removed role or an unverified account.
 */

/** One (child, institution) pair the account may read. */
export interface GuardianGrantScope {
  studentId: string;
  institutionId: string;
}

export interface GuardianAccess {
  userId: string;
  /** Approved (child, institution) scopes. */
  grants: readonly GuardianGrantScope[];
  /**
   * Students with at least one approved grant. Kept as a convenience for
   * callers that only need "is this a granted child?"; it is derived from
   * `grants` and never from `StudentGuardian.status`.
   */
  studentIds: readonly string[];
  /**
   * Children with an APPROVED family link, even when no grant exists yet.
   * Identity only: shows a "not enrolled" card, never institutional data.
   */
  linkedStudentIds: readonly string[];
}

export type GuardianAccessDenial =
  | "NO_SESSION"
  | "ACCOUNT_MISSING"
  | "NOT_PARENT"
  | "EMAIL_UNVERIFIED";

export type GuardianAccessResult =
  | { ok: true; access: GuardianAccess }
  | { ok: false; reason: GuardianAccessDenial };

/**
 * Resolve whether `userId` may read parent-portal child data right now.
 *
 * Returns `{ ok: false }` rather than throwing so a page can render an
 * explicit "your access changed" notice instead of a 500.
 */
export async function resolveGuardianAccess(
  userId: string | null | undefined
): Promise<GuardianAccessResult> {
  if (!userId) return { ok: false, reason: "NO_SESSION" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, roles: true, emailVerified: true },
  });
  if (!user) return { ok: false, reason: "ACCOUNT_MISSING" };

  if (!effectiveRoles(user.role, user.roles).includes("PARENT")) {
    return { ok: false, reason: "NOT_PARENT" };
  }
  if (!user.emailVerified) return { ok: false, reason: "EMAIL_UNVERIFIED" };

  const [links, grants] = await Promise.all([
    prisma.studentGuardian.findMany({
      where: { userId, status: "APPROVED" },
      select: { studentId: true },
      orderBy: [{ approvedAt: "asc" }, { studentId: "asc" }],
    }),
    prisma.studentGuardianGrant.findMany({
      where: { status: "APPROVED", link: { userId } },
      select: {
        institutionId: true,
        link: { select: { studentId: true } },
      },
      orderBy: [{ approvedAt: "asc" }, { institutionId: "asc" }],
    }),
  ]);

  const scopes: GuardianGrantScope[] = [];
  const seen = new Set<string>();
  for (const grant of grants) {
    const studentId = grant.link.studentId;
    const key = `${studentId}:${grant.institutionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    scopes.push({ studentId, institutionId: grant.institutionId });
  }

  const studentIds = [...new Set(scopes.map((scope) => scope.studentId))];
  const linkedStudentIds = [
    ...new Set(links.map((link) => link.studentId)),
  ];

  return {
    ok: true,
    access: { userId, grants: scopes, studentIds, linkedStudentIds },
  };
}

/** True when the account has an approved grant for this child. */
export function isApprovedStudent(
  access: GuardianAccess,
  studentId: string
): boolean {
  return access.studentIds.includes(studentId);
}

/** True when the account has an approved grant for this exact pair. */
export function hasGrant(
  access: GuardianAccess,
  studentId: string,
  institutionId: string
): boolean {
  return access.grants.some(
    (scope) =>
      scope.studentId === studentId && scope.institutionId === institutionId
  );
}

/** The institution ids the account may read for one child. */
export function grantedInstitutionIds(
  access: GuardianAccess,
  studentId?: string
): string[] {
  return [
    ...new Set(
      access.grants
        .filter((scope) => !studentId || scope.studentId === studentId)
        .map((scope) => scope.institutionId)
    ),
  ];
}

/** Approved scopes for one child, ready for a Prisma OR filter. */
export function grantsForStudent(
  access: GuardianAccess,
  studentId: string
): GuardianGrantScope[] {
  return access.grants.filter((scope) => scope.studentId === studentId);
}

/** True when the family link exists, even without any institutional grant. */
export function isLinkedStudent(
  access: GuardianAccess,
  studentId: string
): boolean {
  return access.linkedStudentIds.includes(studentId);
}

/**
 * Display name of the guardian to contact at **one institution**.
 *
 * Only a guardian holding an APPROVED grant at that institution is eligible.
 * The per-student `isPrimary` designation wins when that guardian has a grant
 * there; otherwise the oldest approved grant is used. A primary link whose
 * grant was revoked is therefore skipped, and no read ever rewrites
 * `isPrimary`.
 */
export async function loadGuardianContactNames(
  studentIds: readonly string[],
  institutionId: string
): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>();
  for (const studentId of studentIds) names.set(studentId, null);
  if (studentIds.length === 0) return names;
  const unique = [...new Set(studentIds)];

  const rows = await prisma.studentGuardianGrant.findMany({
    where: {
      institutionId,
      status: "APPROVED",
      link: { studentId: { in: unique } },
    },
    select: {
      approvedAt: true,
      link: {
        select: {
          studentId: true,
          isPrimary: true,
          user: { select: { fullName: true } },
        },
      },
    },
    orderBy: [
      { link: { isPrimary: "desc" } },
      { approvedAt: "asc" },
      { id: "asc" },
    ],
  });

  for (const row of rows) {
    const studentId = row.link.studentId;
    if (names.get(studentId) === null) {
      names.set(studentId, row.link.user.fullName);
    }
  }
  return names;
}
