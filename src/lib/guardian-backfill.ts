import { Prisma, type GuardianLinkStatus } from "@prisma/client";

/**
 * Legacy guardianship backfill (`Student.parentId` → `StudentGuardian`).
 *
 * Kept as a module (not only a CLI) so the migration rule is testable against
 * fixture students and so the runbook can re-run it without editing SQL.
 *
 * The rules are deliberately narrow:
 *
 *   • a `(studentId, parentId)` pair with **no** link becomes one APPROVED,
 *     primary link plus a `LEGACY_IMPORTED` audit row;
 *   • a pair that is already APPROVED is left untouched (re-running is a
 *     no-op, and the write path never rewrites `isPrimary`);
 *   • a pair in PENDING / REJECTED / REVOKED is a **conflict**: the legacy
 *     column must not be used to overrule an explicit decision, so the run
 *     stops and reports instead of guessing;
 *   • a student with **no** `parentId` (created by an institution before any
 *     guardian was linked) is skipped: there is no legacy relationship to
 *     migrate, and it is not a conflict;
 *   • an account that does not hold the PARENT tier, a non-null `parentId`
 *     pointing at a missing account, or a second approved primary guardian
 *     are conflicts too — the backfill never "fixes" them by assuming intent.
 *
 * No function here touches `Student.parentId`, `User.role`, `User.roles` or
 * any `Enrollment`.
 */

/** A writable Prisma handle: the client itself or a transaction. */
export type BackfillDb = Prisma.TransactionClient;

export interface LegacyLinkPair {
  studentId: string;
  guardianId: string;
  studentName: string;
  guardianEmail: string;
}

export type LegacyBackfillConflict =
  | {
      kind: "MISSING_PARENT";
      studentId: string;
      studentName: string;
    }
  | {
      kind: "NON_PARENT_ACCOUNT";
      studentId: string;
      studentName: string;
      guardianId: string;
      guardianEmail: string;
    }
  | {
      kind: "CONFLICTING_LINK";
      studentId: string;
      studentName: string;
      guardianId: string;
      guardianEmail: string;
      status: GuardianLinkStatus;
    }
  | {
      kind: "DUPLICATE_LINK";
      studentId: string;
      studentName: string;
      guardianId: string;
      guardianEmail: string;
    }
  | {
      kind: "DUPLICATE_PRIMARY";
      studentId: string;
      studentName: string;
      guardianId: string;
      guardianEmail: string;
      existingGuardianId: string;
    };

export interface LegacyBackfillPlan {
  /** Students examined. */
  scanned: number;
  /** Students with no `parentId` at all — nothing to migrate. */
  withoutLegacyParent: number;
  /** Pairs that need a new APPROVED primary link. */
  toCreate: LegacyLinkPair[];
  /** Pairs already APPROVED — nothing to write. */
  alreadyApproved: LegacyLinkPair[];
  /** Anything that makes the run unsafe. Non-empty means "do not write". */
  conflicts: LegacyBackfillConflict[];
}

/** Raised by `applyLegacyGuardianBackfill` when the plan is not clean. */
export class LegacyBackfillConflictError extends Error {
  constructor(readonly conflicts: readonly LegacyBackfillConflict[]) {
    super(
      `Legacy guardian backfill refused: ${conflicts.length} conflict(s)`
    );
    this.name = "LegacyBackfillConflictError";
  }
}

/** Stable audit key: one `LEGACY_IMPORTED` row per (student, account). */
export function legacyEventKey(studentId: string, guardianId: string): string {
  return `legacy:${studentId}:${guardianId}`;
}

const EMPTY_PLAN: LegacyBackfillPlan = {
  scanned: 0,
  withoutLegacyParent: 0,
  toCreate: [],
  alreadyApproved: [],
  conflicts: [],
};

/**
 * Read-only: inspect the legacy relationships and decide what would change.
 *
 * `studentIds` narrows the scan (used by the tests); omitting it scans every
 * student, which is what the CLI does.
 */
export async function planLegacyGuardianBackfill(
  db: BackfillDb,
  options: { studentIds?: readonly string[] } = {}
): Promise<LegacyBackfillPlan> {
  const scope = options.studentIds;
  if (scope && scope.length === 0) return { ...EMPTY_PLAN };

  const ids = scope ? [...new Set(scope)] : null;

  // A non-null `parentId` that points at no account can only exist with a
  // broken foreign key; it is reported rather than assumed away. A null value
  // is legitimate (institution intake) and is skipped instead.
  const orphanFilter = ids
    ? Prisma.sql`AND s."id" IN (${Prisma.join(ids)})`
    : Prisma.empty;
  const orphans = await db.$queryRaw<{ id: string; fullName: string }[]>`
    SELECT s."id", s."fullName"
    FROM "Student" s
    LEFT JOIN "User" u ON u."id" = s."parentId"
    WHERE s."parentId" IS NOT NULL AND u."id" IS NULL
    ${orphanFilter}
  `;

  const conflicts: LegacyBackfillConflict[] = orphans.map((row) => ({
    kind: "MISSING_PARENT",
    studentId: row.id,
    studentName: row.fullName,
  }));

  const students = await db.student.findMany({
    where: ids ? { id: { in: ids } } : {},
    select: {
      id: true,
      fullName: true,
      parentId: true,
      parent: {
        select: { id: true, email: true, role: true, roles: true },
      },
      guardians: {
        select: { id: true, userId: true, status: true, isPrimary: true },
      },
    },
    orderBy: { id: "asc" },
  });

  const plan: LegacyBackfillPlan = {
    scanned: students.length,
    withoutLegacyParent: 0,
    toCreate: [],
    alreadyApproved: [],
    conflicts,
  };

  for (const student of students) {
    const guardian = student.parent;
    if (!guardian) {
      // Institution-created student: no legacy relationship exists, so there
      // is nothing to migrate. A broken non-null `parentId` is already in
      // `conflicts` from the raw query above.
      plan.withoutLegacyParent += 1;
      continue;
    }

    const tiers = [guardian.role, ...(guardian.roles ?? [])];
    if (!tiers.includes("PARENT")) {
      plan.conflicts.push({
        kind: "NON_PARENT_ACCOUNT",
        studentId: student.id,
        studentName: student.fullName,
        guardianId: guardian.id,
        guardianEmail: guardian.email,
      });
      continue;
    }

    const legacyLinks = student.guardians.filter(
      (link) => link.userId === guardian.id
    );
    if (legacyLinks.length > 1) {
      plan.conflicts.push({
        kind: "DUPLICATE_LINK",
        studentId: student.id,
        studentName: student.fullName,
        guardianId: guardian.id,
        guardianEmail: guardian.email,
      });
      continue;
    }

    const existing = legacyLinks[0];
    const pair: LegacyLinkPair = {
      studentId: student.id,
      guardianId: guardian.id,
      studentName: student.fullName,
      guardianEmail: guardian.email,
    };

    if (existing) {
      if (existing.status !== "APPROVED") {
        plan.conflicts.push({
          kind: "CONFLICTING_LINK",
          studentId: student.id,
          studentName: student.fullName,
          guardianId: guardian.id,
          guardianEmail: guardian.email,
          status: existing.status,
        });
        continue;
      }
      plan.alreadyApproved.push(pair);
      continue;
    }

    const otherPrimary = student.guardians.find(
      (link) => link.status === "APPROVED" && link.isPrimary
    );
    if (otherPrimary) {
      plan.conflicts.push({
        kind: "DUPLICATE_PRIMARY",
        studentId: student.id,
        studentName: student.fullName,
        guardianId: guardian.id,
        guardianEmail: guardian.email,
        existingGuardianId: otherPrimary.userId,
      });
      continue;
    }

    plan.toCreate.push(pair);
  }

  return plan;
}

export interface LegacyBackfillResult {
  created: number;
  alreadyApproved: number;
  eventsWritten: number;
}

/**
 * Apply a clean plan. Refuses to write anything when the plan carries a
 * conflict, so a single bad row cannot leave the table half-migrated.
 *
 * Call this inside one transaction (the CLI does): the link and its audit row
 * are then all-or-nothing, and `dedupeKey` makes a re-run a no-op even if two
 * operators start the script at the same time.
 */
export async function applyLegacyGuardianBackfill(
  db: BackfillDb,
  plan: LegacyBackfillPlan,
  now: Date = new Date()
): Promise<LegacyBackfillResult> {
  if (plan.conflicts.length > 0) {
    throw new LegacyBackfillConflictError(plan.conflicts);
  }

  let created = 0;
  let eventsWritten = 0;

  for (const pair of plan.toCreate) {
    const link = await db.studentGuardian.create({
      data: {
        studentId: pair.studentId,
        userId: pair.guardianId,
        status: "APPROVED",
        isPrimary: true,
        requestedAt: now,
        approvedAt: now,
      },
      select: { id: true },
    });
    created += 1;

    await db.studentGuardianEvent.upsert({
      where: { dedupeKey: legacyEventKey(pair.studentId, pair.guardianId) },
      update: { linkId: link.id },
      create: {
        studentId: pair.studentId,
        linkId: link.id,
        guardianId: pair.guardianId,
        action: "LEGACY_IMPORTED",
        dedupeKey: legacyEventKey(pair.studentId, pair.guardianId),
        note: "ترحيل علاقة parentId الموجودة إلى StudentGuardian",
      },
    });
    eventsWritten += 1;
  }

  return {
    created,
    alreadyApproved: plan.alreadyApproved.length,
    eventsWritten,
  };
}
