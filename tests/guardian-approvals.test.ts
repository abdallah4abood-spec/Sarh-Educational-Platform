import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { decideGuardianLinkResponse } from "@/app/api/institution/guardians/[id]/decision/handler";
import { redeemJoinCodeResponse } from "@/app/api/parent/guardians/redeem/handler";
import {
  decideGuardianLink,
  GuardianApprovalError,
  loadApprovedGuardians,
  loadOwnLinkRequests,
  loadPendingGuardianApprovals,
  revokeGuardianGrant,
  type GuardianApprovalErrorCode,
} from "@/lib/db/guardian-approvals";
import { loadChildLogs } from "@/lib/db/parent";
import {
  issueStudentJoinCode,
  redeemStudentJoinCode,
} from "@/lib/db/student-join-codes";
import { resolveGuardianAccess } from "@/lib/guardian-access";
import {
  resolveInstitutionAccess,
  type InstitutionAccess,
} from "@/lib/institution-access";
import { resetRateLimits } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

/**
 * Phase 4.3 — the institution-scoped guardianship approval queue.
 *
 * Real PostgreSQL fixtures: two centres, an owner and a CENTER_ADMIN for the
 * first, a secretary and a teacher who hold no institution token, two verified
 * guardians, an unverified one, and students in one or both centres.
 *
 * What is asserted: a code opens a PENDING grant and grants nothing; only the
 * owner or director may decide at their own centre; foreign, withdrawn and
 * unopened requests answer 404; rejection grants nothing and keeps the record;
 * two simultaneous decisions cannot both win; two approvals for one child yield
 * exactly one primary; an ineligible account is refused; a request without its
 * REQUESTED row is not decidable; a rejected/revoked grant reopens on a fresh
 * code without changing isPrimary; an approval at B never exposes A's records;
 * and repeated wrong codes are throttled per account.
 */

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "guardian approval tests write fixtures; refusing to run with NODE_ENV=production"
  );
}

const PREFIX = "gap-test-";
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
  s1: id("s1"),
  s2: id("s2"),
  s3: id("s3"),
  s4: id("s4"),
  s5: id("s5"),
  s6: id("s6"),
  s7: id("s7"),
  s8: id("s8"),
  s9: id("s9"),
  s10: id("s10"),
  s11: id("s11"),
} as const;

const STUDENTS = [
  ids.s1,
  ids.s2,
  ids.s3,
  ids.s4,
  ids.s5,
  ids.s6,
  ids.s7,
  ids.s8,
  ids.s9,
  ids.s10,
  ids.s11,
];

async function clearFixtures() {
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
        { institutionId: { in: [ids.instA, ids.instB] } },
      ],
    },
  });
  await prisma.dailyLog.deleteMany({
    where: { studentId: { startsWith: PREFIX } },
  });
  await prisma.enrollment.deleteMany({
    where: { institutionId: { in: [ids.instA, ids.instB] } },
  });
  await prisma.student.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.staffMember.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.institution.deleteMany({
    where: { id: { in: [ids.instA, ids.instB] } },
  });
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

async function accessFor(userId: string): Promise<InstitutionAccess> {
  const access = await resolveInstitutionAccess(userId);
  assert.ok(access, `expected an institution token for ${userId}`);
  return access;
}

/** Issue a code from one centre and redeem it as parent-1. */
async function openRequest(
  studentId: string,
  centre: "A" | "B" = "A",
  guardianId: string = ids.parent1
): Promise<string> {
  const access = await accessFor(centre === "A" ? ids.ownerA : ids.ownerB);
  const issued = await issueStudentJoinCode(access, studentId);
  const redeemed = await redeemStudentJoinCode(guardianId, issued.code);
  assert.equal(redeemed.status, "PENDING");
  assert.equal(redeemed.alreadyLinked, false);
  return redeemed.linkId;
}

function expectApprovalError(code: GuardianApprovalErrorCode) {
  return (error: unknown) => {
    assert.ok(
      error instanceof GuardianApprovalError,
      `expected GuardianApprovalError, got ${error}`
    );
    assert.equal(error.code, code);
    return true;
  };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("guardianship approval queue (4.3)", () => {
  before(async () => {
    await clearFixtures();

    const baseUser = {
      passwordHash: "unused-in-this-suite",
      emailVerified: new Date(),
      termsAcceptedAt: new Date(),
    };

    await prisma.user.createMany({
      data: [
        { ...baseUser, id: ids.ownerA, email: "gap-owner-a@test.local", fullName: "مالك أ", role: "INSTITUTION_TEACHER" },
        { ...baseUser, id: ids.adminA, email: "gap-admin-a@test.local", fullName: "مدير أ", role: "INSTITUTION_TEACHER" },
        { ...baseUser, id: ids.secretaryA, email: "gap-secretary-a@test.local", fullName: "سكرتير أ", role: "INSTITUTION_TEACHER" },
        { ...baseUser, id: ids.teacherA, email: "gap-teacher-a@test.local", fullName: "معلم أ", role: "TEACHER" },
        { ...baseUser, id: ids.ownerB, email: "gap-owner-b@test.local", fullName: "مالك ب", role: "INSTITUTION_TEACHER" },
        { ...baseUser, id: ids.parent1, email: "gap-parent-1@test.local", fullName: "ولي أمر أول", role: "PARENT" },
        { ...baseUser, id: ids.parent2, email: "gap-parent-2@test.local", fullName: "ولي أمر ثانٍ", role: "PARENT" },
        {
          ...baseUser,
          id: ids.parentUnverified,
          email: "gap-parent-unverified@test.local",
          fullName: "ولي أمر غير موثّق",
          role: "PARENT",
          emailVerified: null,
        },
      ],
    });

    await prisma.institution.createMany({
      data: [
        { id: ids.instA, name: "مركز الاعتماد أ", type: "EDUCATIONAL_CENTER", address: "عنوان", zone: "غزة", ownerId: ids.ownerA },
        { id: ids.instB, name: "مركز الاعتماد ب", type: "EDUCATIONAL_CENTER", address: "عنوان", zone: "غزة", ownerId: ids.ownerB },
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
      data: STUDENTS.map((studentId, index) => ({
        id: studentId,
        fullName: `طفل اعتماد ${index + 1}`,
        dateOfBirth: new Date("2015-06-01T00:00:00.000Z"),
        parentId: null,
      })),
    });

    await prisma.enrollment.createMany({
      data: [
        ...STUDENTS.map((studentId) => ({
          studentId,
          institutionId: ids.instA,
          gradeLevel: "الصف الرابع",
          commissionFee: 0,
          enrollmentStatus: "ACTIVE" as const,
        })),
        {
          studentId: ids.s11,
          institutionId: ids.instB,
          gradeLevel: "الصف الرابع",
          commissionFee: 0,
          enrollmentStatus: "ACTIVE" as const,
        },
      ],
    });
  });

  after(async () => {
    await clearFixtures();
    resetRateLimits();
    await prisma.$disconnect();
  });

  it("opens PENDING with no access, then approval grants it and becomes primary", async () => {
    const access = await accessFor(ids.ownerA);
    const linkId = await openRequest(ids.s1);

    const queue = await loadPendingGuardianApprovals(access);
    const queued = queue.find((row) => row.linkId === linkId);
    assert.ok(queued);
    assert.equal(queued.studentName, "طفل اعتماد 1");
    assert.equal(queued.guardianName, "ولي أمر أول");
    assert.equal(queued.originInstitutionId, ids.instA);

    const beforeAccess = await resolveGuardianAccess(ids.parent1);
    assert.equal(beforeAccess.ok, true);
    if (beforeAccess.ok) {
      assert.equal(beforeAccess.access.studentIds.includes(ids.s1), false);
    }

    const decided = await decideGuardianLink(access, linkId, "APPROVE");
    assert.equal(decided.status, "APPROVED");
    assert.equal(decided.isPrimary, true);

    const link = await prisma.studentGuardian.findUniqueOrThrow({
      where: { id: linkId },
    });
    assert.equal(link.status, "APPROVED");
    assert.equal(link.isPrimary, true);
    assert.ok(link.approvedAt);

    const events = await prisma.studentGuardianEvent.findMany({
      where: { linkId },
    });
    assert.equal(events.length, 2);
    const requested = events.find((event) => event.action === "REQUESTED");
    const approved = events.find((event) => event.action === "APPROVED");
    assert.ok(requested);
    assert.ok(approved);
    assert.equal(requested.institutionId, ids.instA);
    assert.equal(approved.institutionId, ids.instA);
    assert.equal(approved.guardianId, ids.ownerA);
    assert.equal(approved.dedupeKey, `grant-decision:${requested.id}`);

    const afterAccess = await resolveGuardianAccess(ids.parent1);
    assert.equal(afterAccess.ok, true);
    if (afterAccess.ok) {
      assert.ok(afterAccess.access.studentIds.includes(ids.s1));
    }

    const approvedRows = await loadApprovedGuardians(access);
    const row = approvedRows.find((entry) => entry.linkId === linkId);
    assert.ok(row);
    assert.equal(row.isPrimary, true);
    assert.equal(row.guardianEmail, "gap-parent-1@test.local");
  });

  it("lets the centre director decide, while secretary and teacher hold no token", async () => {
    const linkId = await openRequest(ids.s2);
    const director = await accessFor(ids.adminA);

    const decided = await decideGuardianLink(director, linkId, "APPROVE");
    assert.equal(decided.status, "APPROVED");

    assert.equal(await resolveInstitutionAccess(ids.secretaryA), null);
    assert.equal(await resolveInstitutionAccess(ids.teacherA), null);
  });

  it("answers 404 for a link whose student is not enrolled here", async () => {
    const linkId = await openRequest(ids.s3);
    const foreign = await accessFor(ids.ownerB);

    await assert.rejects(
      () => decideGuardianLink(foreign, linkId, "APPROVE"),
      expectApprovalError("LINK_NOT_FOUND")
    );
  });

  it("refuses a withdrawn seat", async () => {
    const access = await accessFor(ids.ownerA);
    const linkId = await openRequest(ids.s4);
    await prisma.enrollment.updateMany({
      where: { studentId: ids.s4, institutionId: ids.instA },
      data: { enrollmentStatus: "WITHDRAWN" },
    });

    await assert.rejects(
      () => decideGuardianLink(access, linkId, "APPROVE"),
      expectApprovalError("LINK_NOT_FOUND")
    );
  });

  it("rejects without granting access, keeps the record, and is not decidable twice", async () => {
    const access = await accessFor(ids.ownerA);
    const linkId = await openRequest(ids.s5);

    const decided = await decideGuardianLink(access, linkId, "REJECT");
    assert.equal(decided.status, "REJECTED");
    assert.equal(decided.isPrimary, false);

    const link = await prisma.studentGuardian.findUniqueOrThrow({
      where: { id: linkId },
    });
    assert.equal(link.status, "REJECTED");
    assert.equal(link.approvedAt, null);
    assert.equal(link.isPrimary, false);

    const guardian = await resolveGuardianAccess(ids.parent1);
    assert.equal(guardian.ok, true);
    if (guardian.ok) {
      assert.equal(guardian.access.studentIds.includes(ids.s5), false);
    }

    const own = await loadOwnLinkRequests(ids.parent1);
    assert.ok(
      own.some(
        (row) =>
          row.linkId === linkId &&
          row.status === "REJECTED" &&
          row.institutionName === "مركز الاعتماد أ"
      )
    );

    await assert.rejects(
      () => decideGuardianLink(access, linkId, "APPROVE"),
      expectApprovalError("LINK_NOT_PENDING")
    );
  });

  it("lets exactly one of a simultaneous approval and rejection win", async () => {
    const access = await accessFor(ids.ownerA);
    const linkId = await openRequest(ids.s6);

    const settled = await Promise.allSettled([
      decideGuardianLink(access, linkId, "APPROVE"),
      decideGuardianLink(access, linkId, "REJECT"),
    ]);
    const fulfilled = settled.filter((row) => row.status === "fulfilled");
    const refused = settled.filter(
      (row): row is PromiseRejectedResult => row.status === "rejected"
    );
    assert.equal(fulfilled.length, 1);
    assert.equal(refused.length, 1);
    assert.ok(refused[0].reason instanceof GuardianApprovalError);
    assert.equal(refused[0].reason.code, "LINK_NOT_PENDING");

    const events = await prisma.studentGuardianEvent.findMany({
      where: { linkId },
    });
    assert.equal(
      events.filter(
        (event) => event.action === "APPROVED" || event.action === "REJECTED"
      ).length,
      1
    );
  });

  it("keeps exactly one primary when two guardians are approved for one child", async () => {
    const access = await accessFor(ids.ownerA);
    const firstLink = await openRequest(ids.s7);

    const secondIssued = await issueStudentJoinCode(access, ids.s7);
    const second = await redeemStudentJoinCode(ids.parent2, secondIssued.code);
    assert.equal(second.status, "PENDING");
    assert.notEqual(second.linkId, firstLink);

    const settled = await Promise.allSettled([
      decideGuardianLink(access, firstLink, "APPROVE"),
      decideGuardianLink(access, second.linkId, "APPROVE"),
    ]);
    assert.equal(
      settled.filter((row) => row.status === "fulfilled").length,
      2,
      "both approvals are valid; only primacy is exclusive"
    );

    const links = await prisma.studentGuardian.findMany({
      where: { studentId: ids.s7, status: "APPROVED" },
    });
    assert.equal(links.length, 2);
    assert.equal(links.filter((link) => link.isPrimary).length, 1);
  });

  it("refuses to approve a request for an unverified account", async () => {
    const access = await accessFor(ids.ownerA);
    const now = new Date();
    const link = await prisma.studentGuardian.create({
      data: {
        id: id("link-unverified"),
        studentId: ids.s8,
        userId: ids.parentUnverified,
        status: "PENDING",
        isPrimary: false,
        requestedAt: now,
        events: {
          create: {
            studentId: ids.s8,
            guardianId: ids.parentUnverified,
            institutionId: ids.instA,
            action: "REQUESTED",
            dedupeKey: id("req-unverified"),
          },
        },
      },
      select: { id: true },
    });

    await assert.rejects(
      () => decideGuardianLink(access, link.id, "APPROVE"),
      expectApprovalError("GUARDIAN_NOT_ELIGIBLE")
    );

    const stored = await prisma.studentGuardian.findUniqueOrThrow({
      where: { id: link.id },
    });
    assert.equal(stored.status, "PENDING");
  });

  it("refuses a PENDING link with no REQUESTED row", async () => {
    const access = await accessFor(ids.ownerA);
    const link = await prisma.studentGuardian.create({
      data: {
        id: id("link-no-event"),
        studentId: ids.s9,
        userId: ids.parent1,
        status: "PENDING",
        isPrimary: false,
        requestedAt: new Date(),
      },
      select: { id: true },
    });

    await assert.rejects(
      () => decideGuardianLink(access, link.id, "APPROVE"),
      expectApprovalError("MISSING_REQUEST_EVENT")
    );

    const stored = await prisma.studentGuardian.findUniqueOrThrow({
      where: { id: link.id },
    });
    assert.equal(stored.status, "PENDING");
  });

  it("decides a new cycle after rejection with a fresh dedupe key", async () => {
    const access = await accessFor(ids.ownerA);
    const linkId = await openRequest(ids.s10);

    await decideGuardianLink(access, linkId, "REJECT");

    const reissued = await issueStudentJoinCode(access, ids.s10);
    const reopened = await redeemStudentJoinCode(ids.parent1, reissued.code);
    assert.equal(reopened.status, "PENDING");
    assert.equal(reopened.linkId, linkId, "the pair keeps one row");

    const approved = await decideGuardianLink(access, linkId, "APPROVE");
    assert.equal(approved.status, "APPROVED");

    const decisions = await prisma.studentGuardianEvent.findMany({
      where: {
        linkId,
        action: { in: ["APPROVED", "REJECTED"] },
      },
    });
    assert.equal(decisions.length, 2);
    assert.equal(new Set(decisions.map((row) => row.dedupeKey)).size, 2);
  });

  it("scopes the approval to B: A's queue, decision and logs stay closed", async () => {
    const accessA = await accessFor(ids.ownerA);
    const accessB = await accessFor(ids.ownerB);
    const linkId = await openRequest(ids.s11, "B");

    const queueA = await loadPendingGuardianApprovals(accessA);
    assert.equal(
      queueA.some((row) => row.linkId === linkId),
      false,
      "centre A may not decide centre B's invitation"
    );
    const queueB = await loadPendingGuardianApprovals(accessB);
    assert.equal(queueB.some((row) => row.linkId === linkId), true);

    await assert.rejects(
      () => decideGuardianLink(accessA, linkId, "APPROVE"),
      expectApprovalError("LINK_NOT_FOUND")
    );

    // Logs are written by both centres for the same child. Only B's grant is
    // approved at this point, so only B's log may be readable.
    await prisma.dailyLog.createMany({
      data: [
        {
          id: id("log-a"),
          studentId: ids.s11,
          institutionId: ids.instA,
          date: new Date(),
          attendance: true,
          activityPhotos: [],
          dayPlan: ["برنامج المركز أ"],
        },
        {
          id: id("log-b"),
          studentId: ids.s11,
          institutionId: ids.instB,
          date: new Date(Date.now() - 24 * 60 * 60 * 1000),
          attendance: true,
          activityPhotos: [],
          dayPlan: ["برنامج المركز ب"],
        },
      ],
    });

    const decided = await decideGuardianLink(accessB, linkId, "APPROVE");
    assert.equal(decided.status, "APPROVED");

    let guardian = await resolveGuardianAccess(ids.parent1);
    assert.equal(guardian.ok, true);
    if (!guardian.ok) return;

    assert.ok(guardian.access.studentIds.includes(ids.s11));
    assert.deepEqual(
      guardian.access.grants
        .filter((scope) => scope.studentId === ids.s11)
        .map((scope) => scope.institutionId),
      [ids.instB]
    );
    let logs = await loadChildLogs(guardian.access, ids.s11);
    assert.equal(
      [...logs.values()].some((log) => log.id === id("log-b")),
      true
    );
    assert.equal(
      [...logs.values()].some((log) => log.id === id("log-a")),
      false,
      "B's approval must not expose A's records"
    );

    // A approves separately. The additional grant must not flip isPrimary
    // (B was the first approval) and must expose A's own log.
    const linkBefore = await prisma.studentGuardian.findUniqueOrThrow({
      where: { id: linkId },
      select: { isPrimary: true },
    });
    assert.equal(linkBefore.isPrimary, true);

    const issuedA = await issueStudentJoinCode(accessA, ids.s11);
    const redeemedA = await redeemStudentJoinCode(ids.parent1, issuedA.code);
    assert.equal(redeemedA.status, "PENDING");
    assert.equal(redeemedA.linkId, linkId);
    const approvedA = await decideGuardianLink(accessA, linkId, "APPROVE");
    assert.equal(approvedA.status, "APPROVED");
    assert.equal(approvedA.isPrimary, true, "an extra grant keeps primacy");

    guardian = await resolveGuardianAccess(ids.parent1);
    assert.equal(guardian.ok, true);
    if (!guardian.ok) return;
    logs = await loadChildLogs(guardian.access, ids.s11);
    assert.equal(
      [...logs.values()].some((log) => log.id === id("log-a")),
      true
    );
    assert.equal(
      [...logs.values()].some((log) => log.id === id("log-b")),
      true
    );

    // Withdraw B's grant. A's grant and isPrimary stay exactly as they were.
    const grantB = await prisma.studentGuardianGrant.findUniqueOrThrow({
      where: {
        linkId_institutionId: {
          linkId,
          institutionId: ids.instB,
        },
      },
      select: { id: true },
    });
    const revoked = await revokeGuardianGrant(accessB, grantB.id);
    assert.equal(revoked.status, "REVOKED");

    const linkAfter = await prisma.studentGuardian.findUniqueOrThrow({
      where: { id: linkId },
      select: { isPrimary: true, status: true },
    });
    assert.equal(linkAfter.isPrimary, true, "revocation must not unset primacy");
    assert.equal(linkAfter.status, "APPROVED", "A's grant keeps the link approved");

    guardian = await resolveGuardianAccess(ids.parent1);
    assert.equal(guardian.ok, true);
    if (!guardian.ok) return;
    assert.deepEqual(
      guardian.access.grants
        .filter((scope) => scope.studentId === ids.s11)
        .map((scope) => scope.institutionId),
      [ids.instA]
    );
    logs = await loadChildLogs(guardian.access, ids.s11);
    assert.equal(
      [...logs.values()].some((log) => log.id === id("log-a")),
      true
    );
    assert.equal(
      [...logs.values()].some((log) => log.id === id("log-b")),
      false
    );

    await assert.rejects(
      () => revokeGuardianGrant(accessB, grantB.id),
      expectApprovalError("GRANT_NOT_APPROVED")
    );

    // A fresh code reopens B's grant. Re-approving it must not flip the
    // one-time primary flag, and must restore only B's own records.
    const issuedB = await issueStudentJoinCode(accessB, ids.s11);
    const reopenedB = await redeemStudentJoinCode(ids.parent1, issuedB.code);
    assert.equal(reopenedB.status, "PENDING");
    assert.equal(reopenedB.grantId, grantB.id);
    const approvedB = await decideGuardianLink(accessB, linkId, "APPROVE");
    assert.equal(approvedB.isPrimary, true);

    const reopened = await prisma.studentGuardian.findUniqueOrThrow({
      where: { id: linkId },
      select: { isPrimary: true },
    });
    assert.equal(reopened.isPrimary, true);

    guardian = await resolveGuardianAccess(ids.parent1);
    assert.equal(guardian.ok, true);
    if (!guardian.ok) return;
    assert.deepEqual(
      guardian.access.grants
        .filter((scope) => scope.studentId === ids.s11)
        .map((scope) => scope.institutionId)
        .sort(),
      [ids.instA, ids.instB].sort()
    );
    logs = await loadChildLogs(guardian.access, ids.s11);
    assert.equal(
      [...logs.values()].some((log) => log.id === id("log-b")),
      true
    );
  });

  it("maps decisions to HTTP status codes and refuses foreign links with 404", async () => {
    // Reuse the still-pending s3 request from the foreign-centre test above.
    const existing = await prisma.studentGuardian.findFirstOrThrow({
      where: { studentId: ids.s3 },
    });
    const linkId = existing.id;

    const approved = await decideGuardianLinkResponse(
      ids.ownerA,
      linkId,
      jsonRequest({ decision: "APPROVE", institutionId: ids.instA })
    );
    assert.equal(approved.status, 200);
    const body = await approved.json();
    assert.equal(body.success, true);
    assert.equal(body.link.status, "APPROVED");

    const twice = await decideGuardianLinkResponse(
      ids.ownerA,
      linkId,
      jsonRequest({ decision: "REJECT", institutionId: ids.instA })
    );
    assert.equal(twice.status, 409);

    const foreign = await decideGuardianLinkResponse(
      ids.ownerB,
      linkId,
      jsonRequest({ decision: "APPROVE", institutionId: ids.instB })
    );
    assert.equal(foreign.status, 404);

    const invalid = await decideGuardianLinkResponse(
      ids.ownerA,
      linkId,
      jsonRequest({ decision: "MAYBE", institutionId: ids.instA })
    );
    assert.equal(invalid.status, 400);
  });

  it("throttles repeated wrong codes for one account with 429 and Retry-After", async () => {
    resetRateLimits();
    const wrong = "ZZZZZZZZZZ";
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await redeemJoinCodeResponse(
        ids.parent2,
        jsonRequest({ code: wrong })
      );
      assert.equal(response.status, 404);
    }

    const blocked = await redeemJoinCodeResponse(
      ids.parent2,
      jsonRequest({ code: wrong })
    );
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("Retry-After")) > 0);

    // A success clears the counter; the account is not permanently locked.
    resetRateLimits();
  });
});
