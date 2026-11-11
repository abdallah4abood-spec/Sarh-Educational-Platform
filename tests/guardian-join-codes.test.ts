import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  issueJoinCodeResponse,
  revokeJoinCodeResponse,
} from "@/app/api/institution/students/[id]/join-code/handler";
import { redeemJoinCodeResponse } from "@/app/api/parent/guardians/redeem/handler";
import { resolveGuardianAccess } from "@/lib/guardian-access";
import { decideGuardianLink } from "@/lib/db/guardian-approvals";
import {
  InstitutionAccessDeniedError,
  resolveInstitutionAccess,
} from "@/lib/institution-access";
import {
  formatJoinCode,
  hashJoinCode,
  normalizeJoinCode,
} from "@/lib/join-codes";
import {
  issueStudentJoinCode,
  JoinCodeError,
  loadActiveJoinCode,
  redeemStudentJoinCode,
  revokeStudentJoinCodes,
  type JoinCodeErrorCode,
} from "@/lib/db/student-join-codes";
import { acquireAdvisoryLock } from "@/lib/db/advisory-lock";
import { prisma } from "@/lib/prisma";

/**
 * Phase 4.0 / 4.1 — guardian linking by join code.
 *
 * Real PostgreSQL fixtures: two centres, an owner and a CENTER_ADMIN for the
 * first, a secretary and a teacher who must be refused, two verified parents, an
 * unverified parent, and students in both centres.
 *
 * What is asserted: only the owner/director may issue; the code is stored as a
 * digest; issuing again or revoking kills the previous code; a valid code opens
 * a PENDING request with exactly one REQUESTED audit row and no access; an
 * authorised centre decision is what grants access; a replay is idempotent; two
 * guardians racing on one code produce one link; a previously revoked/rejected
 * pair goes
 * back to PENDING without access; a withdrawn student, a foreign centre or a
 * stale account cannot redeem; and `Student.parentId` is never an authority.
 *
 * The concurrency block runs on real PostgreSQL (not a mock): while the test
 * holds the per-student advisory key, it waits until every contender is visibly
 * queued on that same key in `pg_locks`, then releases it. A missing lock shows
 * up as an empty queue — deterministically, with no fixed sleeps — and the final
 * assertions still require exactly one live code with no earlier code
 * redeemable.
 */

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "guardian join-code tests write fixtures; refusing to run with NODE_ENV=production"
  );
}

const PREFIX = "gjc-test-";
const id = (name: string) => `${PREFIX}${name}`;

const ids = {
  ownerA: id("owner-a"),
  adminA: id("admin-a"),
  secretaryA: id("secretary-a"),
  teacherA: id("teacher-a"),
  ownerB: id("owner-b"),
  parent1: id("parent-1"),
  parent2: id("parent-2"),
  parentUnverified: id("parent-unverified"),
  instA: id("inst-a"),
  instB: id("inst-b"),
  studentA1: id("stu-a1"),
  studentA2: id("stu-a2"),
  studentA3: id("stu-a3"),
  studentA4: id("stu-a4"),
  studentA5: id("stu-a5"),
  studentA6: id("stu-a6"),
  studentA7: id("stu-a7"),
  studentA8: id("stu-a8"),
  studentA9: id("stu-a9"),
  studentA10: id("stu-a10"),
  studentB1: id("stu-b1"),
  studentWithdrawn: id("stu-withdrawn"),
  studentC1: id("stu-c1"),
  studentC2: id("stu-c2"),
  studentC3: id("stu-c3"),
  studentC4: id("stu-c4"),
  studentC5: id("stu-c5"),
  studentC6: id("stu-c6"),
} as const;

const IN_A = [
  ids.studentA1,
  ids.studentA2,
  ids.studentA3,
  ids.studentA4,
  ids.studentA5,
  ids.studentA6,
  ids.studentA7,
  ids.studentA8,
  ids.studentA9,
  ids.studentA10,
  ids.studentC1,
  ids.studentC2,
  ids.studentC3,
  ids.studentC4,
  ids.studentC5,
  ids.studentC6,
  ids.studentWithdrawn,
];

/**
 * Hold the key `issueStudentJoinCode` is expected to take, and let the test
 * release it explicitly.
 *
 * This is the first half of making the race deterministic: while the holder owns
 * the key, every contender must queue on it. The test waits for that queue to be
 * visible in `pg_locks` (see `issueLockWaiters`) instead of sleeping, so "the
 * requests really are serialised" is an observed fact. The second half is the
 * outcome: releasing the key lets every contender run, and exactly one live code
 * may remain, with no earlier code redeemable.
 *
 * The key literal mirrors `issueLockKey()` in `src/lib/db/student-join-codes.ts`.
 */
async function beginHoldingIssueLock(
  studentId: string
): Promise<() => Promise<void>> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let ready!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });

  const holder = prisma
    .$transaction(
      async (tx) => {
        await acquireAdvisoryLock(
          tx,
          `join-code-issue:${ids.instA}:${studentId}`
        );
        ready();
        await released;
      },
      { timeout: 20_000, maxWait: 20_000 }
    )
    .catch(() => undefined);

  await started;
  return async () => {
    release();
    await holder;
  };
}

/**
 * How many join-code requests are blocked on the per-student issue lock.
 *
 * Reads PostgreSQL's own lock table, so the test observes a fact instead of
 * sleeping. `pg_advisory_xact_lock(hashtext(key))` widens the int4 hash to
 * bigint, which `pg_locks` stores as high/low 32-bit halves (`objsubid = 1`).
 */
async function issueLockWaiters(
  institutionId: string,
  studentId: string
): Promise<number> {
  const key = `join-code-issue:${institutionId}:${studentId}`;
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM pg_locks AS l
    WHERE l.locktype = 'advisory'
      AND NOT l.granted
      AND l.classid::bigint = ((hashtext(${key})::bigint >> 32) & 4294967295)
      AND l.objid::bigint = (hashtext(${key})::bigint & 4294967295)
  `;
  return rows[0]?.count ?? 0;
}

/**
 * Wait until every contender is either queued on the issue lock or finished.
 *
 * Returns the queued count instead of asserting, so a failure names both the
 * missing serialisation and the rows it produced. Returning as soon as the
 * promises settle is what keeps the "lock was removed" case fast: the requests
 * finish immediately and the caller's assertion fails on `0` instead of waiting
 * out a timeout.
 */
async function waitForIssueQueue(args: {
  institutionId: string;
  studentId: string;
  expected: number;
  settled: () => boolean;
  label: string;
}): Promise<number> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const queued = await issueLockWaiters(args.institutionId, args.studentId);
    if (queued === args.expected || args.settled()) return queued;
    if (Date.now() > deadline) {
      assert.fail(
        `${args.label}: expected ${args.expected} request(s) queued on the issue lock, saw ${queued}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/**
 * Count settlements without consuming the promises the test still awaits.
 *
 * `then` with both handlers returns a promise that always fulfils, so a rejected
 * contender cannot surface as an unhandled rejection while the test waits.
 */
function trackSettlements(pending: Promise<unknown>[]): () => boolean {
  let settled = 0;
  for (const promise of pending) {
    void promise.then(
      () => {
        settled += 1;
      },
      () => {
        settled += 1;
      }
    );
  }
  return () => settled === pending.length;
}

/** Fail instead of hanging when the code under test serialises too much. */
async function withDeadline<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Open pooled connections up front: a contender that has to wait ~200 ms for a
 * connection can drift past the one ahead of it, which hides an overlap the
 * lock is supposed to make impossible.
 */
async function warmPool(size = 4) {
  await Promise.all(
    Array.from({ length: size }, () => prisma.$queryRaw`SELECT 1 AS warm`)
  );
}

function expectJoinCodeError(code: JoinCodeErrorCode) {
  return (error: unknown) => {
    assert.ok(error instanceof JoinCodeError, `expected JoinCodeError, got ${error}`);
    assert.equal(error.code, code);
    return true;
  };
}

async function clearFixtures() {
  const institutions = [ids.instA, ids.instB];
  await prisma.studentGuardianEvent.deleteMany({
    where: {
      OR: [
        { studentId: { startsWith: PREFIX } },
        { id: { startsWith: PREFIX } },
      ],
    },
  });
  await prisma.studentGuardian.deleteMany({
    where: { studentId: { startsWith: PREFIX } },
  });
  await prisma.studentJoinCode.deleteMany({
    where: {
      OR: [
        { studentId: { startsWith: PREFIX } },
        { institutionId: { in: institutions } },
      ],
    },
  });
  await prisma.enrollment.deleteMany({
    where: { institutionId: { in: institutions } },
  });
  await prisma.student.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.staffMember.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.institution.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

function jsonRequest(body: unknown, method = "POST") {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("guardian linking by join code", () => {
  before(async () => {
    await clearFixtures();

    const baseUser = {
      passwordHash: "unused-in-this-suite",
      emailVerified: new Date(),
      termsAcceptedAt: new Date(),
    };

    await prisma.user.createMany({
      data: [
        { ...baseUser, id: ids.ownerA, email: "gjc-owner-a@test.local", fullName: "مالك أ", role: "INSTITUTION_TEACHER" },
        { ...baseUser, id: ids.adminA, email: "gjc-admin-a@test.local", fullName: "مدير أ", role: "INSTITUTION_TEACHER" },
        { ...baseUser, id: ids.secretaryA, email: "gjc-secretary-a@test.local", fullName: "سكرتير أ", role: "INSTITUTION_TEACHER" },
        { ...baseUser, id: ids.teacherA, email: "gjc-teacher-a@test.local", fullName: "معلم أ", role: "TEACHER" },
        { ...baseUser, id: ids.ownerB, email: "gjc-owner-b@test.local", fullName: "مالك ب", role: "INSTITUTION_TEACHER" },
        { ...baseUser, id: ids.parent1, email: "gjc-parent-1@test.local", fullName: "ولي أمر أول", role: "PARENT" },
        { ...baseUser, id: ids.parent2, email: "gjc-parent-2@test.local", fullName: "ولي أمر ثانٍ", role: "PARENT" },
        {
          ...baseUser,
          id: ids.parentUnverified,
          email: "gjc-parent-unverified@test.local",
          fullName: "ولي أمر غير موثّق",
          role: "PARENT",
          emailVerified: null,
        },
      ],
    });

    await prisma.institution.createMany({
      data: [
        { id: ids.instA, name: "مركز الرموز أ", type: "EDUCATIONAL_CENTER", address: "عنوان", zone: "غزة", ownerId: ids.ownerA },
        { id: ids.instB, name: "مركز الرموز ب", type: "EDUCATIONAL_CENTER", address: "عنوان", zone: "غزة", ownerId: ids.ownerB },
      ],
    });

    await prisma.staffMember.createMany({
      data: [
        { id: id("staff-admin"), userId: ids.adminA, institutionId: ids.instA, title: "مدير", role: "CENTER_ADMIN", status: "ACTIVE" },
        { id: id("staff-secretary"), userId: ids.secretaryA, institutionId: ids.instA, title: "سكرتير", role: "SECRETARY", status: "ACTIVE" },
        { id: id("staff-teacher"), userId: ids.teacherA, institutionId: ids.instA, title: "معلم", role: "TEACHER", status: "ACTIVE" },
      ],
    });

    await prisma.student.createMany({
      data: [
        ...IN_A.map((studentId, index) => ({
          id: studentId,
          fullName: `طفل ربط ${index + 1}`,
          dateOfBirth: new Date("2015-03-04T00:00:00.000Z"),
          parentId: null,
        })),
        { id: ids.studentB1, fullName: "طفل المركز ب", dateOfBirth: new Date("2015-03-04T00:00:00.000Z"), parentId: null },
      ],
    });

    await prisma.enrollment.createMany({
      data: [
        ...IN_A.map((studentId) => ({
          studentId,
          institutionId: ids.instA,
          gradeLevel: "الصف الرابع",
          commissionFee: 0,
          enrollmentStatus:
            studentId === ids.studentWithdrawn
              ? ("WITHDRAWN" as const)
              : ("ACTIVE" as const),
        })),
        {
          studentId: ids.studentB1,
          institutionId: ids.instB,
          gradeLevel: "الصف الخامس",
          commissionFee: 0,
          enrollmentStatus: "ACTIVE" as const,
        },
      ],
    });
  });

  after(async () => {
    await clearFixtures();
    await prisma.$disconnect();
  });

  it("stores only a digest and returns the code once", async () => {
    const access = await resolveInstitutionAccess(ids.ownerA);
    assert.ok(access);

    const issued = await issueStudentJoinCode(access, ids.studentA1);

    assert.equal(issued.code.length, 10);
    assert.equal(issued.displayCode, formatJoinCode(issued.code));
    assert.equal(normalizeJoinCode(issued.displayCode), issued.code);

    const row = await prisma.studentJoinCode.findUniqueOrThrow({
      where: { id: issued.codeId },
    });
    assert.match(row.code, /^sha256:[0-9a-f]{64}$/);
    assert.equal(row.code, hashJoinCode(issued.code));
    assert.equal(row.code.includes(issued.code), false, "the plaintext is not stored");
    assert.equal(row.institutionId, ids.instA);
    assert.equal(row.createdById, ids.ownerA);
    assert.ok(row.expiresAt.getTime() > Date.now());
    assert.equal(row.redeemedAt, null);
  });

  it("lets the owner and the centre director issue, and nobody else", async () => {
    const owner = await resolveInstitutionAccess(ids.ownerA);
    const director = await resolveInstitutionAccess(ids.adminA);
    assert.ok(owner);
    assert.ok(director);

    const fromOwner = await issueStudentJoinCode(owner, ids.studentA1);
    const fromDirector = await issueStudentJoinCode(director, ids.studentA1);
    assert.ok(fromOwner.code);
    assert.ok(fromDirector.code);

    // A secretary and a teacher hold no institution token at all.
    assert.equal(await resolveInstitutionAccess(ids.secretaryA), null);
    assert.equal(await resolveInstitutionAccess(ids.teacherA), null);

    // A token stripped of its capabilities must fail even with a valid centre.
    const readOnly = { ...owner, capabilities: [] as const };
    await assert.rejects(
      () => issueStudentJoinCode(readOnly, ids.studentA1),
      (error: unknown) => error instanceof InstitutionAccessDeniedError
    );
  });

  it("refuses a student from another centre", async () => {
    const access = await resolveInstitutionAccess(ids.ownerA);
    assert.ok(access);

    await assert.rejects(
      () => issueStudentJoinCode(access, ids.studentB1),
      expectJoinCodeError("STUDENT_NOT_IN_INSTITUTION")
    );
    await assert.rejects(
      () => issueStudentJoinCode(access, id("unknown-student")),
      expectJoinCodeError("STUDENT_NOT_IN_INSTITUTION")
    );
  });

  it("expires the previous code when a new one is issued", async () => {
    const access = await resolveInstitutionAccess(ids.ownerA);
    assert.ok(access);

    const first = await issueStudentJoinCode(access, ids.studentA2);
    const second = await issueStudentJoinCode(access, ids.studentA2);
    assert.notEqual(first.code, second.code);

    await assert.rejects(
      () => redeemStudentJoinCode(ids.parent1, first.code),
      expectJoinCodeError("CODE_EXPIRED")
    );
    // The newest one still works (and opens the request for approval).
    const redeemed = await redeemStudentJoinCode(ids.parent1, second.code);
    assert.equal(redeemed.status, "PENDING");
  });

  it("makes a revoked code unusable", async () => {
    const access = await resolveInstitutionAccess(ids.ownerA);
    assert.ok(access);

    const issued = await issueStudentJoinCode(access, ids.studentA2);
    const revoked = await revokeStudentJoinCodes(access, ids.studentA2);
    assert.equal(revoked, 1);

    await assert.rejects(
      () => redeemStudentJoinCode(ids.parent2, issued.code),
      expectJoinCodeError("CODE_EXPIRED")
    );
    // Revoking again is a no-op, not an error.
    assert.equal(await revokeStudentJoinCodes(access, ids.studentA2), 0);
  });

  it("leaves exactly one live code after two simultaneous issues", async () => {
    const access = await resolveInstitutionAccess(ids.ownerA);
    assert.ok(access);

    // The UI disables its button, but the API is reachable by any client that
    // holds the capability — so the guarantee has to come from the database.
    await warmPool();
    const release = await beginHoldingIssueLock(ids.studentC1);
    const pending = [
      issueStudentJoinCode(access, ids.studentC1),
      issueStudentJoinCode(access, ids.studentC1),
    ];
    const settled = trackSettlements(pending);

    // Wait for a database fact, not a duration: both requests must be blocked on
    // the same advisory key before the holder lets go.
    const queued = await waitForIssueQueue({
      institutionId: ids.instA,
      studentId: ids.studentC1,
      expected: pending.length,
      settled,
      label: "two simultaneous issues",
    });
    await release();
    const [first, second] = await Promise.all(pending);

    assert.equal(
      queued,
      pending.length,
      "both requests must queue on the same per-student issue lock"
    );
    assert.notEqual(first.code, second.code);

    const live = await prisma.studentJoinCode.findMany({
      where: {
        studentId: ids.studentC1,
        institutionId: ids.instA,
        redeemedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { code: true },
    });

    assert.equal(live.length, 1, "a race must not leave two live codes");
    assert.ok(
      live[0].code === hashJoinCode(first.code) ||
        live[0].code === hashJoinCode(second.code),
      "the surviving code is one of the two issued, in digest form"
    );
  });

  it("leaves exactly one live code after three simultaneous issues", async () => {
    const access = await resolveInstitutionAccess(ids.ownerA);
    assert.ok(access);

    await warmPool(5);
    const release = await beginHoldingIssueLock(ids.studentC2);
    const pending = [
      issueStudentJoinCode(access, ids.studentC2),
      issueStudentJoinCode(access, ids.studentC2),
      issueStudentJoinCode(access, ids.studentC2),
    ];
    const settled = trackSettlements(pending);
    const queued = await waitForIssueQueue({
      institutionId: ids.instA,
      studentId: ids.studentC2,
      expected: pending.length,
      settled,
      label: "three simultaneous issues",
    });
    await release();
    const results = await Promise.allSettled(pending);

    assert.equal(
      queued,
      pending.length,
      "all three requests must queue on the same per-student issue lock"
    );
    assert.equal(
      results.filter((row) => row.status === "fulfilled").length,
      3,
      "each request is answered, none is dropped by the lock"
    );

    const live = await prisma.studentJoinCode.count({
      where: {
        studentId: ids.studentC2,
        institutionId: ids.instA,
        redeemedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    assert.equal(live, 1);
  });

  it("keeps no earlier code redeemable after a concurrent re-issue", async () => {
    const access = await resolveInstitutionAccess(ids.ownerA);
    assert.ok(access);

    const first = await issueStudentJoinCode(access, ids.studentC3);
    await warmPool(5);
    const release = await beginHoldingIssueLock(ids.studentC3);
    const pending = [
      issueStudentJoinCode(access, ids.studentC3),
      issueStudentJoinCode(access, ids.studentC3),
      issueStudentJoinCode(access, ids.studentC3),
    ];
    const settled = trackSettlements(pending);
    const queued = await waitForIssueQueue({
      institutionId: ids.instA,
      studentId: ids.studentC3,
      expected: pending.length,
      settled,
      label: "concurrent re-issue",
    });
    await release();
    await Promise.all(pending);

    assert.equal(
      queued,
      pending.length,
      "all re-issues must queue on the same per-student issue lock"
    );

    // The code a family may already hold died with the first re-issue.
    await assert.rejects(
      () => redeemStudentJoinCode(ids.parent1, first.code),
      expectJoinCodeError("CODE_EXPIRED")
    );
    assert.equal(
      await prisma.studentGuardian.count({ where: { studentId: ids.studentC3 } }),
      0,
      "a dead code cannot link a guardian"
    );
    assert.equal(
      await prisma.studentJoinCode.count({
        where: {
          studentId: ids.studentC3,
          redeemedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),
      1
    );
  });

  it("serialises issues per student, not per centre", async () => {
    const access = await resolveInstitutionAccess(ids.ownerA);
    assert.ok(access);

    const release = await beginHoldingIssueLock(ids.studentC5);

    const blocked = issueStudentJoinCode(access, ids.studentC5);
    const queued = await waitForIssueQueue({
      institutionId: ids.instA,
      studentId: ids.studentC5,
      expected: 1,
      settled: trackSettlements([blocked]),
      label: "same-student issue",
    });
    assert.equal(queued, 1, "the same-student issue queues on its own lock");

    // A different child of the same centre must complete while that one waits.
    // A per-centre lock would never settle here, and the deadline — not the
    // assertion below — would be the failure.
    const independent = await withDeadline(
      issueStudentJoinCode(access, ids.studentC6),
      5_000,
      "a different student's issue waited behind another student's lock"
    );
    assert.ok(independent.code);

    // And the first request is still queued: the second did not release it.
    assert.equal(
      await issueLockWaiters(ids.instA, ids.studentC5),
      1,
      "the other student's issue must still be waiting"
    );

    await release();
    assert.ok((await blocked).code);
  });

  it("reads the live-code status without ever issuing a code", async () => {
    const access = await resolveInstitutionAccess(ids.ownerA);
    assert.ok(access);

    // Opening the invite dialog performs this read and nothing else.
    const empty = await loadActiveJoinCode(access, ids.studentC4);
    assert.equal(empty.active, false);
    assert.equal(
      await prisma.studentJoinCode.count({ where: { studentId: ids.studentC4 } }),
      0,
      "a read must not create a code"
    );

    const issued = await issueStudentJoinCode(access, ids.studentC4);
    const status = await loadActiveJoinCode(access, ids.studentC4);
    assert.equal(status.active, true);
    assert.equal(status.expiresAt, issued.expiresAt);
    assert.equal(
      JSON.stringify(status).includes(issued.code),
      false,
      "the status never carries the plaintext code"
    );

    // Reading again is stable — it neither rotates nor expires the code.
    assert.deepEqual(await loadActiveJoinCode(access, ids.studentC4), status);
    assert.equal(
      await prisma.studentJoinCode.count({ where: { studentId: ids.studentC4 } }),
      1
    );
    const redeemed = await redeemStudentJoinCode(ids.parent1, issued.code);
    assert.equal(redeemed.status, "PENDING");
  });

  it("redeems a code into one pending link and one request, and grants no access", async () => {
    const access = await resolveInstitutionAccess(ids.ownerA);
    assert.ok(access);
    const issued = await issueStudentJoinCode(access, ids.studentA3);

    // The formatted value is what the guardian types; the server normalizes it.
    const redeemed = await redeemStudentJoinCode(ids.parent1, issued.displayCode);
    assert.equal(redeemed.status, "PENDING");
    assert.equal(redeemed.alreadyLinked, false);
    assert.equal(redeemed.studentId, ids.studentA3);

    const link = await prisma.studentGuardian.findUniqueOrThrow({
      where: {
        studentId_userId: { studentId: ids.studentA3, userId: ids.parent1 },
      },
    });
    assert.equal(link.status, "PENDING");
    assert.equal(link.isPrimary, false);
    assert.equal(link.approvedAt, null);

    const events = await prisma.studentGuardianEvent.findMany({
      where: { studentId: ids.studentA3 },
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "REQUESTED");
    assert.equal(events[0].linkId, link.id);
    assert.equal(events[0].institutionId, ids.instA);

    const beforeApproval = await resolveGuardianAccess(ids.parent1);
    assert.equal(beforeApproval.ok, true);
    if (!beforeApproval.ok) return;
    assert.equal(
      beforeApproval.access.studentIds.includes(ids.studentA3),
      false,
      "consuming the code must not grant access on its own"
    );

    // Only an authorised decision by the centre turns the request into access.
    await decideGuardianLink(access, link.id, "APPROVE");

    const guardian = await resolveGuardianAccess(ids.parent1);
    assert.equal(guardian.ok, true);
    if (!guardian.ok) return;
    assert.ok(guardian.access.studentIds.includes(ids.studentA3));

    const approved = await prisma.studentGuardian.findUniqueOrThrow({
      where: { id: link.id },
    });
    assert.equal(approved.status, "APPROVED");
    assert.equal(approved.isPrimary, true);
    assert.ok(approved.approvedAt);

    // The legacy column was not needed to grant that access.
    const student = await prisma.student.findUniqueOrThrow({
      where: { id: ids.studentA3 },
    });
    assert.equal(student.parentId, null);

    // A replay by the same guardian answers with the same link, not a second.
    const replay = await redeemStudentJoinCode(ids.parent1, issued.code);
    assert.equal(replay.alreadyLinked, true);
    assert.equal(replay.linkId, link.id);
    assert.equal(
      await prisma.studentGuardianEvent.count({
        where: { studentId: ids.studentA3 },
      }),
      2,
      "the only added row is the approval, never a second request"
    );
  });

  it("refuses a code that another guardian already used", async () => {
    const access = await resolveInstitutionAccess(ids.ownerA);
    assert.ok(access);
    const issued = await issueStudentJoinCode(access, ids.studentA4);

    const first = await redeemStudentJoinCode(ids.parent1, issued.code);
    assert.equal(first.status, "PENDING");

    await assert.rejects(
      () => redeemStudentJoinCode(ids.parent2, issued.code),
      expectJoinCodeError("CODE_ALREADY_USED")
    );
  });

  it("lets exactly one of two simultaneous redemptions win", async () => {
    const access = await resolveInstitutionAccess(ids.ownerA);
    assert.ok(access);
    const issued = await issueStudentJoinCode(access, ids.studentA5);

    const settled = await Promise.allSettled([
      redeemStudentJoinCode(ids.parent1, issued.code),
      redeemStudentJoinCode(ids.parent2, issued.code),
    ]);
    const succeeded = settled.filter((row) => row.status === "fulfilled");
    const refused = settled.filter(
      (row): row is PromiseRejectedResult => row.status === "rejected"
    );

    assert.equal(succeeded.length, 1);
    assert.equal(refused.length, 1);
    assert.ok(refused[0].reason instanceof JoinCodeError);
    assert.equal(refused[0].reason.code, "CODE_ALREADY_USED");
    assert.equal(
      await prisma.studentGuardian.count({ where: { studentId: ids.studentA5 } }),
      1
    );
  });

  it("reopens a revoked grant as pending and grants no access", async () => {
    const now = new Date();
    await prisma.studentGuardian.create({
      data: {
        id: id("link-revoked"),
        studentId: ids.studentA6,
        userId: ids.parent1,
        status: "REVOKED",
        isPrimary: false,
        requestedAt: now,
        approvedAt: now,
        revokedAt: now,
        grants: {
          create: {
            id: id("grant-revoked"),
            institutionId: ids.instA,
            status: "REVOKED",
            requestedAt: now,
            approvedAt: now,
            revokedAt: now,
          },
        },
      },
    });

    const access = await resolveInstitutionAccess(ids.ownerA);
    assert.ok(access);
    const issued = await issueStudentJoinCode(access, ids.studentA6);

    const redeemed = await redeemStudentJoinCode(ids.parent1, issued.code);
    assert.equal(redeemed.status, "PENDING");
    assert.equal(redeemed.alreadyLinked, false);

    const link = await prisma.studentGuardian.findUniqueOrThrow({
      where: {
        studentId_userId: { studentId: ids.studentA6, userId: ids.parent1 },
      },
    });
    assert.equal(link.status, "PENDING");
    assert.equal(link.approvedAt, null);
    assert.equal(link.isPrimary, false);
    assert.equal(link.revokedAt, null, "a re-request clears the summary stamp");

    const grant = await prisma.studentGuardianGrant.findUniqueOrThrow({
      where: { id: id("grant-revoked") },
    });
    assert.equal(grant.status, "PENDING");
    assert.equal(grant.revokedAt, null);
    assert.equal(grant.approvedAt, null);

    const guardian = await resolveGuardianAccess(ids.parent1);
    assert.equal(guardian.ok, true);
    if (!guardian.ok) return;
    assert.equal(guardian.access.studentIds.includes(ids.studentA6), false);

    const events = await prisma.studentGuardianEvent.findMany({
      where: { studentId: ids.studentA6 },
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "REQUESTED");
  });

  it("reopens a rejected link as pending", async () => {
    const now = new Date();
    await prisma.studentGuardian.create({
      data: {
        id: id("link-rejected"),
        studentId: ids.studentA7,
        userId: ids.parent1,
        status: "REJECTED",
        isPrimary: false,
        requestedAt: now,
      },
    });

    const access = await resolveInstitutionAccess(ids.ownerA);
    assert.ok(access);
    const issued = await issueStudentJoinCode(access, ids.studentA7);
    const redeemed = await redeemStudentJoinCode(ids.parent1, issued.code);

    assert.equal(redeemed.status, "PENDING");
    const link = await prisma.studentGuardian.findUniqueOrThrow({
      where: {
        studentId_userId: { studentId: ids.studentA7, userId: ids.parent1 },
      },
    });
    assert.equal(link.status, "PENDING");
    assert.equal(link.approvedAt, null);
  });

  it("requires a live, verified parent account", async () => {
    const access = await resolveInstitutionAccess(ids.ownerA);
    assert.ok(access);
    const issued = await issueStudentJoinCode(access, ids.studentA8);

    await assert.rejects(
      () => redeemStudentJoinCode(ids.parentUnverified, issued.code),
      expectJoinCodeError("NOT_A_GUARDIAN")
    );
    await assert.rejects(
      () => redeemStudentJoinCode(ids.teacherA, issued.code),
      expectJoinCodeError("NOT_A_GUARDIAN")
    );
    await assert.rejects(
      () => redeemStudentJoinCode(id("missing-account"), issued.code),
      expectJoinCodeError("NOT_A_GUARDIAN")
    );

    // Nothing was consumed: the real guardian can still use it.
    const redeemed = await redeemStudentJoinCode(ids.parent2, issued.code);
    assert.equal(redeemed.status, "PENDING");
  });

  it("refuses a code whose student left the centre", async () => {
    const access = await resolveInstitutionAccess(ids.ownerA);
    assert.ok(access);

    // A withdrawn student cannot be invited at all.
    await assert.rejects(
      () => issueStudentJoinCode(access, ids.studentWithdrawn),
      expectJoinCodeError("STUDENT_NOT_IN_INSTITUTION")
    );

    const issued = await issueStudentJoinCode(access, ids.studentA9);
    await prisma.enrollment.updateMany({
      where: { studentId: ids.studentA9, institutionId: ids.instA },
      data: { enrollmentStatus: "WITHDRAWN" },
    });

    await assert.rejects(
      () => redeemStudentJoinCode(ids.parent1, issued.code),
      expectJoinCodeError("STUDENT_NOT_ENROLLED")
    );
    assert.equal(
      await prisma.studentGuardian.count({
        where: { studentId: ids.studentA9 },
      }),
      0
    );
  });

  it("refuses a code re-pointed at another centre", async () => {
    const access = await resolveInstitutionAccess(ids.ownerA);
    assert.ok(access);
    const issued = await issueStudentJoinCode(access, ids.studentA8);

    await prisma.studentJoinCode.update({
      where: { id: issued.codeId },
      data: { institutionId: ids.instB },
    });

    await assert.rejects(
      () => redeemStudentJoinCode(ids.parent1, issued.code),
      expectJoinCodeError("STUDENT_NOT_ENROLLED")
    );
    assert.equal(
      await prisma.studentGuardian.count({
        where: { studentId: ids.studentA8, userId: ids.parent1 },
      }),
      0
    );
  });

  it("does not make a second guardian primary", async () => {
    const access = await resolveInstitutionAccess(ids.ownerA);
    assert.ok(access);

    const first = await issueStudentJoinCode(access, ids.studentA10);
    const firstRequest = await redeemStudentJoinCode(ids.parent1, first.code);
    const second = await issueStudentJoinCode(access, ids.studentA10);
    const secondRequest = await redeemStudentJoinCode(ids.parent2, second.code);

    assert.equal(firstRequest.status, "PENDING");
    assert.equal(secondRequest.status, "PENDING");

    const firstLink = await prisma.studentGuardian.findUniqueOrThrow({
      where: {
        studentId_userId: { studentId: ids.studentA10, userId: ids.parent1 },
      },
    });
    const secondLink = await prisma.studentGuardian.findUniqueOrThrow({
      where: {
        studentId_userId: { studentId: ids.studentA10, userId: ids.parent2 },
      },
    });
    assert.equal(firstLink.isPrimary, false);
    assert.equal(secondLink.isPrimary, false);

    await decideGuardianLink(access, firstLink.id, "APPROVE");
    await decideGuardianLink(access, secondLink.id, "APPROVE");

    const approvedFirst = await prisma.studentGuardian.findUniqueOrThrow({
      where: { id: firstLink.id },
    });
    const approvedSecond = await prisma.studentGuardian.findUniqueOrThrow({
      where: { id: secondLink.id },
    });
    assert.equal(approvedFirst.status, "APPROVED");
    assert.equal(approvedFirst.isPrimary, true);
    assert.equal(approvedSecond.status, "APPROVED");
    assert.equal(
      approvedSecond.isPrimary,
      false,
      "a second guardian must not steal the primary contact"
    );
  });

  it("never treats Student.parentId as an authority", async () => {
    // A7's only link is PENDING (with parent-1); pointing the legacy column at
    // parent-2 must not turn that into access.
    await prisma.student.update({
      where: { id: ids.studentA7 },
      data: { parentId: ids.parent2 },
    });

    const guardian = await resolveGuardianAccess(ids.parent2);
    assert.equal(guardian.ok, true);
    if (!guardian.ok) return;
    assert.equal(
      guardian.access.studentIds.includes(ids.studentA7),
      false,
      "the legacy column must not grant a link"
    );
  });

  it("maps the HTTP handlers to the documented status codes", async () => {
    const issued = await issueJoinCodeResponse(
      ids.ownerA,
      ids.studentA8,
      jsonRequest({ institutionId: ids.instA })
    );
    assert.equal(issued.status, 201);
    const issuedBody = await issued.json();
    assert.equal(issuedBody.success, true);
    assert.ok(issuedBody.displayCode);

    const foreignOwner = await issueJoinCodeResponse(
      ids.ownerB,
      ids.studentA8,
      jsonRequest({ institutionId: ids.instA })
    );
    assert.equal(foreignOwner.status, 403);

    const teacher = await issueJoinCodeResponse(
      ids.teacherA,
      ids.studentA8,
      jsonRequest({ institutionId: ids.instA })
    );
    assert.equal(teacher.status, 403);

    const unknownStudent = await issueJoinCodeResponse(
      ids.ownerA,
      id("missing-student"),
      jsonRequest({ institutionId: ids.instA })
    );
    assert.equal(unknownStudent.status, 404);

    const redeemed = await redeemJoinCodeResponse(
      ids.parent2,
      jsonRequest({ code: issuedBody.code })
    );
    assert.equal(redeemed.status, 200);
    assert.equal((await redeemed.json()).status, "PENDING");

    const wrongCode = await redeemJoinCodeResponse(
      ids.parent2,
      jsonRequest({ code: "ZZZZ-ZZZZ-ZZ" })
    );
    assert.equal(wrongCode.status, 404);

    const malformed = await redeemJoinCodeResponse(
      ids.parent2,
      jsonRequest({ code: "abc" })
    );
    assert.equal(malformed.status, 400);

    // A fresh code, revoked before use, is Gone — not a generic 400.
    const toRevoke = await issueJoinCodeResponse(
      ids.ownerA,
      ids.studentA8,
      jsonRequest({ institutionId: ids.instA })
    );
    assert.equal(toRevoke.status, 201);
    const toRevokeBody = await toRevoke.json();

    const revoke = await revokeJoinCodeResponse(
      ids.ownerA,
      ids.studentA8,
      jsonRequest({ institutionId: ids.instA }, "DELETE")
    );
    assert.equal(revoke.status, 200);
    assert.equal((await revoke.json()).revoked, 1);

    const expired = await redeemJoinCodeResponse(
      ids.parent1,
      jsonRequest({ code: toRevokeBody.code })
    );
    assert.equal(expired.status, 410);
    assert.equal((await expired.json()).code, "CODE_EXPIRED");
  });
});
