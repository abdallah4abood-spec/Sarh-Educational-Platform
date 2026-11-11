import { PrismaClient } from "@prisma/client";

import {
  applyLegacyGuardianBackfill,
  planLegacyGuardianBackfill,
  type LegacyBackfillPlan,
} from "../src/lib/guardian-backfill";

/**
 * Legacy guardian backfill — CLI.
 *
 *   npx tsx prisma/backfill-guardians.ts           # dry run (default)
 *   npx tsx prisma/backfill-guardians.ts --apply   # write
 *
 * Converts every valid `Student.parentId` into an APPROVED, primary
 * `StudentGuardian` plus one `LEGACY_IMPORTED` audit row. Safe to re-run: an
 * already-approved pair is skipped and the audit row is keyed by
 * `legacy:<studentId>:<userId>`.
 *
 * It is a *dry run by default* because it touches real relationships. It
 * refuses to write when the scan finds a conflict, and it never changes
 * `Student.parentId`, `User.role`, `User.roles` or any `Enrollment`.
 *
 * Never point this at production without a backup: the repository's migration
 * strategy keeps production on reviewed SQL, not on scripts run from a laptop.
 */

const APPLY = process.argv.includes("--apply");

const prisma = new PrismaClient();

interface Snapshot {
  students: number;
  enrollments: number;
  links: number;
  events: number;
  parentIds: Map<string, string | null>;
}

async function snapshot(): Promise<Snapshot> {
  const [students, enrollments, links, events, rows] = await Promise.all([
    prisma.student.count(),
    prisma.enrollment.count(),
    prisma.studentGuardian.count(),
    prisma.studentGuardianEvent.count(),
    prisma.student.findMany({ select: { id: true, parentId: true } }),
  ]);
  return {
    students,
    enrollments,
    links,
    events,
    parentIds: new Map(rows.map((row) => [row.id, row.parentId])),
  };
}

function printPlan(plan: LegacyBackfillPlan) {
  console.log(`  students scanned      : ${plan.scanned}`);
  console.log(`  without a parentId    : ${plan.withoutLegacyParent}`);
  console.log(`  links to create       : ${plan.toCreate.length}`);
  console.log(`  already APPROVED      : ${plan.alreadyApproved.length}`);
  console.log(`  conflicts             : ${plan.conflicts.length}`);
  if (plan.conflicts.length > 0) {
    console.log("\n✗ conflicts (nothing was written):");
    for (const conflict of plan.conflicts) {
      console.log(`  - ${JSON.stringify(conflict)}`);
    }
  }
}

/** Every assertion the acceptance criteria name, checked after the write. */
async function verify(
  before: Snapshot,
  guard: { created: number; eventsWritten: number }
) {
  const after = await snapshot();
  const problems: string[] = [];

  if (after.students !== before.students) {
    problems.push(`students ${before.students} → ${after.students}`);
  }
  if (after.enrollments !== before.enrollments) {
    problems.push(`enrollments ${before.enrollments} → ${after.enrollments}`);
  }
  let movedParentId = 0;
  for (const [studentId, parentId] of before.parentIds) {
    if (after.parentIds.get(studentId) !== parentId) movedParentId += 1;
  }
  if (movedParentId > 0) problems.push(`parentId changed on ${movedParentId} student(s)`);

  if (after.links !== before.links + guard.created) {
    problems.push(
      `links ${before.links} + ${guard.created} ≠ ${after.links}`
    );
  }
  if (after.events !== before.events + guard.eventsWritten) {
    problems.push(
      `events ${before.events} + ${guard.eventsWritten} ≠ ${after.events}`
    );
  }

  const approved = await prisma.studentGuardian.count({
    where: { status: "APPROVED" },
  });
  // Only students that actually carried a legacy `parentId` are in scope. A
  // student created by an institution has no legacy relationship to migrate,
  // so "no APPROVED guardian" is its normal, legitimate state — not a failed
  // backfill. Counting it here made the tool exit non-zero as soon as a centre
  // added its first student.
  const uncovered = await prisma.student.count({
    where: {
      parentId: { not: null },
      guardians: { none: { status: "APPROVED" } },
    },
  });
  if (uncovered > 0) {
    problems.push(
      `${uncovered} student(s) with a legacy parentId still have no APPROVED guardian`
    );
  }
  const awaitingGuardian = await prisma.student.count({
    where: { parentId: null, guardians: { none: { status: "APPROVED" } } },
  });

  console.log(`\nafter:`);
  console.log(`  students              : ${after.students}`);
  console.log(`  enrollments           : ${after.enrollments}`);
  console.log(`  guardian links        : ${after.links} (${approved} APPROVED)`);
  console.log(`  guardian events       : ${after.events}`);
  console.log(`  legacy students w/o link : ${uncovered}`);
  console.log(
    `  awaiting a guardian link : ${awaitingGuardian} (institution intake — expected)`
  );

  if (problems.length > 0) {
    console.error("\n✗ verification failed:");
    for (const problem of problems) console.error(`  - ${problem}`);
    return false;
  }
  console.log("\n✓ verification passed");
  return true;
}

async function main() {
  await prisma.$connect();
  console.log(`legacy guardian backfill — ${APPLY ? "APPLY" : "dry run"}\n`);

  const before = await snapshot();
  console.log("before:");
  console.log(`  students              : ${before.students}`);
  console.log(`  enrollments           : ${before.enrollments}`);
  console.log(`  guardian links        : ${before.links}`);
  console.log(`  guardian events       : ${before.events}\n`);

  const plan = await planLegacyGuardianBackfill(prisma);
  printPlan(plan);

  if (plan.conflicts.length > 0) {
    console.error(
      "\n✗ refusing to write. Resolve the rows above by hand; the script does not guess."
    );
    process.exitCode = 1;
    return;
  }

  if (!APPLY) {
    console.log("\n(dry run — re-run with --apply to write)");
    return;
  }

  if (plan.toCreate.length === 0) {
    console.log("\n✓ nothing to create; the legacy relationships are already migrated");
  }

  const guard = await prisma.$transaction(
    (tx) => applyLegacyGuardianBackfill(tx, plan),
    { timeout: 120_000 }
  );
  console.log(
    `\n✓ created ${guard.created} link(s), ${guard.eventsWritten} audit row(s)`
  );

  const ok = await verify(before, guard);
  if (!ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("\n✗ backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
