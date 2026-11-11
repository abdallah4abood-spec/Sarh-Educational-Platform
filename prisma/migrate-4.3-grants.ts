import { randomUUID } from "node:crypto";

import { Prisma, PrismaClient } from "@prisma/client";

import { acquireAdvisoryLock } from "../src/lib/db/advisory-lock";

/**
 * Phase 4.3 data migration — run while `SubjectPerformance.institutionId` is
 * still nullable (stage 1), then push the final schema to make it NOT NULL.
 *
 * Rules:
 *   • One APPROVED grant per approved guardian link × the institutions where
 *     the child has an ACTIVE enrollment. No grant is invented for a prior,
 *     inactive institution.
 *   • Every one of the 32 score rows must be attributable to exactly one
 *     ACTIVE institution. Anything else aborts before a single write.
 *   • The whole write is one transaction. `--fail-after=grants` rolls back on
 *     purpose so the recovery test can prove that.
 *   • Re-running is a no-op: grants are unique per (link, institution) and the
 *     MIGRATED event carries `migrate:<linkId>:<institutionId>`.
 */

const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const failAfter = readFlag("--fail-after");
const expectedApproved = numberFlag("--expect-approved");
const expectedPerf = numberFlag("--expect-perf");

function readFlag(name: string): string | null {
  const entry = argv.find((value) => value.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : null;
}

function numberFlag(name: string): number | null {
  const raw = readFlag(name);
  if (raw === null) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return value;
}

interface ApprovedLink {
  id: string;
  studentId: string;
  approvedAt: Date | null;
  requestedAt: Date;
}

interface ActiveEnrollment {
  studentId: string;
  institutionId: string;
}

interface PerformanceRow {
  id: string;
  studentId: string;
  subject: string;
  term: string;
}

interface PlannedGrant {
  id: string;
  linkId: string;
  institutionId: string;
  studentId: string;
  approvedAt: Date;
  requestedAt: Date;
}

interface PlannedPerfUpdate {
  id: string;
  studentId: string;
  institutionId: string;
}

interface Plan {
  approvedLinks: number;
  activeEnrollments: number;
  performanceRows: number;
  nullPerformanceRows: number;
  plannedGrants: PlannedGrant[];
  newGrants: PlannedGrant[];
  existingGrants: number;
  skippedLinks: { linkId: string; studentId: string }[];
  performanceUpdates: PlannedPerfUpdate[];
}

async function buildPlan(
  db: Prisma.TransactionClient | PrismaClient
): Promise<Plan> {
  const links = await db.studentGuardian.findMany({
    where: { status: "APPROVED" },
    select: {
      id: true,
      studentId: true,
      approvedAt: true,
      requestedAt: true,
    },
    orderBy: [{ studentId: "asc" }, { id: "asc" }],
  });

  const active = await db.enrollment.findMany({
    where: { enrollmentStatus: "ACTIVE" },
    select: { studentId: true, institutionId: true },
    orderBy: [{ studentId: "asc" }, { institutionId: "asc" }],
  });

  const activeByStudent = new Map<string, string[]>();
  for (const row of active as ActiveEnrollment[]) {
    const list = activeByStudent.get(row.studentId) ?? [];
    if (!list.includes(row.institutionId)) list.push(row.institutionId);
    activeByStudent.set(row.studentId, list);
  }

  const performanceRows = await db.$queryRaw<PerformanceRow[]>`
    SELECT id, "studentId", subject, term
    FROM "SubjectPerformance"
    ORDER BY id
  `;
  const nullPerformanceRows = await db.$queryRaw<PerformanceRow[]>`
    SELECT id, "studentId", subject, term
    FROM "SubjectPerformance"
    WHERE "institutionId" IS NULL
    ORDER BY id
  `;

  if (expectedApproved !== null && links.length !== expectedApproved) {
    throw new Error(
      `Expected ${expectedApproved} approved links, found ${links.length}`
    );
  }
  if (expectedPerf !== null && performanceRows.length !== expectedPerf) {
    throw new Error(
      `Expected ${expectedPerf} performance rows, found ${performanceRows.length}`
    );
  }

  const plannedGrants: PlannedGrant[] = [];
  const skippedLinks: Plan["skippedLinks"] = [];

  for (const link of links as ApprovedLink[]) {
    const institutions = activeByStudent.get(link.studentId) ?? [];
    if (institutions.length === 0) {
      skippedLinks.push({ linkId: link.id, studentId: link.studentId });
      continue;
    }
    if (institutions.length > 1) {
      throw new Error(
        `AMBIGUOUS_ACTIVE_ENROLLMENTS link=${link.id} student=${link.studentId} institutions=${institutions.join(",")}`
      );
    }
    plannedGrants.push({
      id: randomUUID(),
      linkId: link.id,
      institutionId: institutions[0],
      studentId: link.studentId,
      approvedAt: link.approvedAt ?? new Date(),
      requestedAt: link.requestedAt,
    });
  }

  const existingKeys = new Set(
    (
      await db.studentGuardianGrant.findMany({
        where: {
          OR: plannedGrants.map((grant) => ({
            linkId: grant.linkId,
            institutionId: grant.institutionId,
          })),
        },
        select: { linkId: true, institutionId: true },
      })
    ).map((row) => `${row.linkId}:${row.institutionId}`)
  );

  const newGrants = plannedGrants.filter(
    (grant) => !existingKeys.has(`${grant.linkId}:${grant.institutionId}`)
  );

  const plannedPerfKeys = new Set<string>();
  const performanceUpdates: PlannedPerfUpdate[] = [];
  for (const row of nullPerformanceRows) {
    const institutions = activeByStudent.get(row.studentId) ?? [];
    if (institutions.length !== 1) {
      throw new Error(
        `UNATTRIBUTABLE_PERFORMANCE id=${row.id} student=${row.studentId} activeInstitutions=${institutions.join(",") || "0"}`
      );
    }
    const key = `${row.studentId}:${institutions[0]}:${row.subject}:${row.term}`;
    if (plannedPerfKeys.has(key)) {
      throw new Error(`DUPLICATE_AFTER_ATTRIBUTION ${key}`);
    }
    plannedPerfKeys.add(key);
    performanceUpdates.push({
      id: row.id,
      studentId: row.studentId,
      institutionId: institutions[0],
    });
  }

  return {
    approvedLinks: links.length,
    activeEnrollments: active.length,
    performanceRows: performanceRows.length,
    nullPerformanceRows: nullPerformanceRows.length,
    plannedGrants,
    newGrants,
    existingGrants: plannedGrants.length - newGrants.length,
    skippedLinks,
    performanceUpdates,
  };
}

function summary(plan: Plan) {
  return {
    approvedLinks: plan.approvedLinks,
    activeEnrollments: plan.activeEnrollments,
    performanceRows: plan.performanceRows,
    nullPerformanceRows: plan.nullPerformanceRows,
    plannedGrants: plan.plannedGrants.length,
    newGrants: plan.newGrants.length,
    existingGrants: plan.existingGrants,
    skippedLinks: plan.skippedLinks.length,
    performanceUpdates: plan.performanceUpdates.length,
  };
}

async function verifyInside(tx: Prisma.TransactionClient) {
  const nullRows = await tx.$queryRaw<{ count: bigint }[]>`
    SELECT count(*)::bigint AS count
    FROM "SubjectPerformance"
    WHERE "institutionId" IS NULL
  `;
  if (Number(nullRows[0]?.count ?? 0) !== 0) {
    throw new Error("VERIFY_FAILED: performance rows still have no institution");
  }

  const missing = await tx.$queryRaw<{ count: bigint }[]>`
    SELECT count(*)::bigint AS count
    FROM "StudentGuardian" sg
    JOIN "Enrollment" e
      ON e."studentId" = sg."studentId"
     AND e."enrollmentStatus" = 'ACTIVE'
    WHERE sg.status = 'APPROVED'
      AND NOT EXISTS (
        SELECT 1
        FROM "StudentGuardianGrant" g
        WHERE g."linkId" = sg.id
          AND g."institutionId" = e."institutionId"
          AND g.status = 'APPROVED'
      )
  `;
  if (Number(missing[0]?.count ?? 0) !== 0) {
    throw new Error("VERIFY_FAILED: an approved link has no grant for an active seat");
  }
}

async function main() {
  const preview = await buildPlan(prisma);
  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", ...summary(preview) }, null, 2));
    if (preview.skippedLinks.length > 0) {
      console.log(
        JSON.stringify({ skippedLinks: preview.skippedLinks }, null, 2)
      );
    }
    return;
  }

  const result = await prisma.$transaction(
    async (tx) => {
      await acquireAdvisoryLock(tx, "phase-4.3-grants");
      const plan = await buildPlan(tx);

      if (plan.newGrants.length > 0) {
        await tx.studentGuardianGrant.createMany({
          data: plan.newGrants.map((grant) => ({
            id: grant.id,
            linkId: grant.linkId,
            institutionId: grant.institutionId,
            status: "APPROVED" as const,
            requestedAt: grant.requestedAt,
            approvedAt: grant.approvedAt,
            approvedById: null,
            revokedAt: null,
            revokedById: null,
          })),
        });

        await tx.studentGuardianEvent.createMany({
          data: plan.newGrants.map((grant) => ({
            id: randomUUID(),
            studentId: grant.studentId,
            linkId: grant.linkId,
            guardianId: null,
            institutionId: grant.institutionId,
            action: "MIGRATED" as const,
            dedupeKey: `migrate:${grant.linkId}:${grant.institutionId}`,
            note: "ترحيل 4.3 — اعتماد تاريخي سابق، فاعله غير معروف",
          })),
          skipDuplicates: true,
        });
      }

      if (failAfter === "grants") {
        throw new Error("SIMULATED_FAILURE_AFTER_GRANTS");
      }

      for (const update of plan.performanceUpdates) {
        await tx.$executeRaw`
          UPDATE "SubjectPerformance"
          SET "institutionId" = ${update.institutionId}
          WHERE id = ${update.id}
            AND "institutionId" IS NULL
        `;
      }

      await verifyInside(tx);
      return summary(plan);
    },
    { timeout: 30_000, maxWait: 10_000 }
  );

  console.log(JSON.stringify({ mode: "applied", ...result }, null, 2));
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
