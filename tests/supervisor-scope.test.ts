import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { createStudentResponse } from "@/app/api/institution/students/handler";
import { prisma } from "@/lib/prisma";
import {
  loadPlanCounts,
  loadQualitySignals,
  loadScopedTeachers,
  loadSupervisorEvaluations,
  loadSupervisorOverview,
  loadSupervisorPlans,
  resolveSupervisorScope,
  supervisedInstitutionIds,
} from "@/lib/db/supervisor";

/**
 * Phase 3A — supervisor institution isolation.
 *
 * These are integration tests: they create their own fixtures in the
 * configured database (prefixed `p3a-test-`), assert on what the loaders
 * actually return, and remove every row they created afterwards. Two existing
 * institutions are reused so the tests exercise the real tenant topology
 * instead of an idealised one.
 *
 * The behaviour under test is negative — "must not see" — so each assertion
 * also proves the excluded row exists: a query that silently returns nothing
 * because the data is missing would otherwise pass as isolation.
 *
 * Requirements, all satisfied by the project's own conventions:
 *   • `DATABASE_URL` — the same variable Prisma reads everywhere (`.env` at the
 *     repository root). No test-only configuration file is needed.
 *   • A seeded database (`npm run db:seed`) because the fixtures attach to two
 *     pre-existing institutions; without them the suite fails loudly instead
 *     of asserting vacuously.
 *   • Writes are limited to rows whose key carries the `p3a-test-` prefix, and
 *     cleanup deletes exactly those prefixes, so re-running is safe and no
 *     pre-existing row is modified or removed.
 *
 * The suite refuses to run against `NODE_ENV=production`, so pointing
 * `DATABASE_URL` at a production database cannot silently seed fixtures into
 * it.
 */

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "supervisor-scope tests write fixtures; refusing to run with NODE_ENV=production"
  );
}

const PREFIX = "p3a-test-";

interface Fixture {
  instA: { id: string; name: string };
  instB: { id: string; name: string };
  planAId: string;
  planBId: string;
  multiCentreTeacherId: string;
  outsideTeacherId: string;
  signalOwnId: string;
  signalOtherId: string;
  signalPlatformId: string;
  supA: string;
  supNoMembership: string;
  supInactive: string;
  teacherWithMembership: string;
  platformAdmin: string;
}

let fx: Fixture;

async function createUser(
  role: "SUPERVISOR" | "TEACHER" | "SUPER_ADMIN",
  label: string
): Promise<string> {
  const user = await prisma.user.create({
    data: {
      fullName: `${PREFIX}${label}`,
      email: `${PREFIX}${label}@sarh.test`,
      passwordHash: "p3a-test-not-a-real-hash",
      role,
    },
    select: { id: true },
  });
  return user.id;
}

before(async () => {
  const institutions = await prisma.institution.findMany({
    orderBy: { createdAt: "asc" },
    take: 2,
    select: { id: true, name: true },
  });
  assert.ok(
    institutions.length >= 2,
    "isolation tests need two institutions in the database (run `npm run db:seed`)"
  );
  const [instA, instB] = institutions;

  const teacherA = await createUser("TEACHER", "teacher-a");
  const teacherB = await createUser("TEACHER", "teacher-b");

  const scheduledFor = new Date();

  const planA = await prisma.lessonPlan.create({
    data: {
      title: `${PREFIX}plan-a`,
      subject: "رياضيات",
      gradeLevel: "الصف السابع",
      objectives: "أهداف اختبار عزل المشرف",
      scheduledFor,
      status: "PENDING",
      authorId: teacherA,
      institutionId: instA.id,
      completeness: 90,
    },
    select: { id: true },
  });

  const planB = await prisma.lessonPlan.create({
    data: {
      title: `${PREFIX}plan-b`,
      subject: "علوم",
      gradeLevel: "الصف الثامن",
      objectives: "أهداف اختبار عزل المشرف",
      scheduledFor,
      status: "PENDING",
      authorId: teacherB,
      institutionId: instB.id,
      completeness: 70,
    },
    select: { id: true },
  });

  /** A teacher who works in both centres — the classic cross-tenant leak. */
  const multiTeacher = await createUser("TEACHER", "teacher-multi");
  await prisma.lessonPlan.createMany({
    data: [
      {
        title: `${PREFIX}plan-multi-a1`,
        subject: "لغة عربية",
        gradeLevel: "الصف السادس",
        objectives: "أهداف اختبار عزل المشرف",
        scheduledFor,
        status: "APPROVED",
        authorId: multiTeacher,
        institutionId: instA.id,
        completeness: 95,
      },
      {
        title: `${PREFIX}plan-multi-a2`,
        subject: "لغة عربية",
        gradeLevel: "الصف السادس",
        objectives: "أهداف اختبار عزل المشرف",
        scheduledFor,
        status: "APPROVED",
        authorId: multiTeacher,
        institutionId: instA.id,
        completeness: 95,
      },
      {
        title: `${PREFIX}plan-multi-b1`,
        subject: "لغة عربية",
        gradeLevel: "الصف السادس",
        objectives: "أهداف اختبار عزل المشرف",
        scheduledFor,
        status: "PENDING",
        authorId: multiTeacher,
        institutionId: instB.id,
        completeness: 60,
      },
    ],
  });

  const supA = await createUser("SUPERVISOR", "supervisor-a");
  const supNoMembership = await createUser("SUPERVISOR", "supervisor-none");
  const supInactive = await createUser("SUPERVISOR", "supervisor-inactive");
  const teacherWithMembership = await createUser("TEACHER", "teacher-member");
  // Deliberately share a display name with another evaluated teacher: names
  // are not unique identifiers for score mapping.
  await prisma.user.update({
    where: { id: teacherWithMembership },
    data: { fullName: `${PREFIX}teacher-multi` },
  });
  const platformAdmin = await createUser("SUPER_ADMIN", "admin");

  await prisma.staffMember.createMany({
    data: [
      {
        userId: supA,
        institutionId: instA.id,
        title: "مشرفة تربوية",
        role: "SUPERVISOR",
        subjects: [],
        status: "ACTIVE",
      },
      // A second active membership as a teacher is not an institution-level
      // supervision grant; it must not widen supA's supervisor scope.
      {
        userId: supA,
        institutionId: instB.id,
        title: "معلمة",
        role: "TEACHER",
        subjects: [],
        status: "ACTIVE",
      },
      {
        userId: supInactive,
        institutionId: instA.id,
        title: "مشرفة سابقة",
        role: "SUPERVISOR",
        subjects: [],
        status: "INACTIVE",
      },
      {
        userId: teacherWithMembership,
        institutionId: instA.id,
        title: "معلمة",
        role: "TEACHER",
        subjects: [],
        status: "ACTIVE",
      },
      {
        userId: teacherB,
        institutionId: instB.id,
        title: "معلم",
        role: "TEACHER",
        subjects: [],
        status: "ACTIVE",
      },
      {
        userId: multiTeacher,
        institutionId: instA.id,
        title: "معلمة",
        role: "TEACHER",
        subjects: [],
        status: "ACTIVE",
      },
      {
        userId: multiTeacher,
        institutionId: instB.id,
        title: "معلمة",
        role: "TEACHER",
        subjects: [],
        status: "ACTIVE",
      },
    ],
  });

  // A multi-centre teacher's subjects and class count must be read only from
  // the supervisor's authorised institution, even though the teacher works in
  // both centres.
  await prisma.schoolClass.createMany({
    data: [
      {
        name: `${PREFIX}class-a`,
        subject: "رياضيات مركز أ",
        gradeLevel: "الصف السادس",
        institutionId: instA.id,
        teacherId: multiTeacher,
      },
      {
        name: `${PREFIX}class-b1`,
        subject: "علوم مركز ب",
        gradeLevel: "الصف السادس",
        institutionId: instB.id,
        teacherId: multiTeacher,
      },
      {
        name: `${PREFIX}class-b2`,
        subject: "لغة مركز ب",
        gradeLevel: "الصف السادس",
        institutionId: instB.id,
        teacherId: multiTeacher,
      },
    ],
  });

  // The supervisor observed her — the only legitimate reason her row appears.
  await prisma.teacherEvaluation.createMany({
    data: [
      {
        teacherId: multiTeacher,
        supervisorId: supA,
        periodLabel: `${PREFIX}period`,
        classroomVisits: 2,
        score: 88,
      },
      // An evaluation authored by supA is not enough to grant access to an
      // evaluated teacher assigned only to another institution.
      {
        teacherId: teacherB,
        supervisorId: supA,
        periodLabel: `${PREFIX}outside-period`,
        classroomVisits: 1,
        score: 21,
      },
      {
        teacherId: teacherWithMembership,
        supervisorId: supA,
        periodLabel: `${PREFIX}same-name-period`,
        classroomVisits: 1,
        score: 37,
        // Keep this after the multi-centre teacher's latest evaluation in the
        // query order, so a name-keyed map deterministically overwrites it.
        createdAt: new Date("2000-01-01T00:00:00.000Z"),
      },
    ],
  });

  const signalOwn = await prisma.qualitySignal.create({
    data: {
      kind: "ALERT",
      title: `${PREFIX}signal-own`,
      scopeOwnerId: supA,
      institutionId: instA.id,
    },
    select: { id: true },
  });

  const signalOther = await prisma.qualitySignal.create({
    data: {
      kind: "ALERT",
      title: `${PREFIX}signal-other`,
      scopeOwnerId: supA,
      institutionId: instB.id,
    },
    select: { id: true },
  });

  const signalPlatform = await prisma.qualitySignal.create({
    data: {
      kind: "INFO",
      title: `${PREFIX}signal-platform`,
      scopeOwnerId: supA,
      institutionId: null,
    },
    select: { id: true },
  });

  fx = {
    instA,
    instB,
    planAId: planA.id,
    planBId: planB.id,
    multiCentreTeacherId: multiTeacher,
    outsideTeacherId: teacherB,
    signalOwnId: signalOwn.id,
    signalOtherId: signalOther.id,
    signalPlatformId: signalPlatform.id,
    supA,
    supNoMembership,
    supInactive,
    teacherWithMembership,
    platformAdmin,
  };
});

after(async () => {
  /*
   * Delete by prefix rather than by remembered id: the cleanup still works when
   * `before` failed halfway, and it can never touch a row that was not created
   * by this file. Child rows first, then the users they hang off. The
   * institutions are pre-existing and are never deleted.
   */
  await prisma.qualitySignal.deleteMany({
    where: { title: { startsWith: PREFIX } },
  });
  await prisma.teacherEvaluation.deleteMany({
    where: { periodLabel: { startsWith: PREFIX } },
  });
  await prisma.lessonPlan.deleteMany({
    where: { title: { startsWith: PREFIX } },
  });
  await prisma.schoolClass.deleteMany({
    where: { name: { startsWith: PREFIX } },
  });
  await prisma.staffMember.deleteMany({
    where: { user: { email: { startsWith: PREFIX } } },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });

  const residue = await Promise.all([
    prisma.user.count({ where: { email: { startsWith: PREFIX } } }),
    prisma.staffMember.count({ where: { user: { email: { startsWith: PREFIX } } } }),
    prisma.lessonPlan.count({ where: { title: { startsWith: PREFIX } } }),
    prisma.schoolClass.count({ where: { name: { startsWith: PREFIX } } }),
    prisma.qualitySignal.count({ where: { title: { startsWith: PREFIX } } }),
  ]);
  assert.deepEqual(
    residue,
    [0, 0, 0, 0, 0],
    "test fixtures were not cleaned up (users, staff, plans, classes, signals)"
  );
});

describe("supervisor scope resolution", () => {
  it("resolves a supervisor with an active membership to that institution only", async () => {
    const scope = await resolveSupervisorScope(fx.supA);
    assert.equal(scope.kind, "institutions");
    assert.deepEqual(
      scope.kind === "institutions" ? scope.institutionIds : [],
      [fx.instA.id],
      "a TEACHER membership must not grant supervisor scope"
    );
  });

  it("treats a lapsed membership as no membership at all", async () => {
    assert.deepEqual(await supervisedInstitutionIds(fx.supInactive), []);
    const scope = await resolveSupervisorScope(fx.supInactive);
    assert.equal(scope.kind, "denied");
  });

  it("denies a supervisor who has no membership row", async () => {
    const scope = await resolveSupervisorScope(fx.supNoMembership);
    assert.equal(scope.kind, "denied");
    assert.equal(
      scope.kind === "denied" ? scope.reason : null,
      "no-membership"
    );
  });

  it("denies an unknown user id", async () => {
    const scope = await resolveSupervisorScope("00000000-0000-0000-0000-000000000000");
    assert.equal(scope.kind, "denied");
  });
});

describe("supervisor reads stay inside the permitted institution", () => {
  it("returns only the member institution's plans", async () => {
    const plans = await loadSupervisorPlans(fx.supA, 100);
    const titles = plans.map((plan) => plan.title);

    assert.ok(titles.includes(`${PREFIX}plan-a`), "own institution plan missing");
    assert.ok(!titles.includes(`${PREFIX}plan-b`), "leaked another institution's plan");
    assert.ok(
      !titles.includes(`${PREFIX}plan-multi-b1`),
      "leaked a multi-centre teacher's out-of-scope plan"
    );
    assert.deepEqual(
      [...new Set(plans.map((plan) => plan.center))],
      [fx.instA.name],
      "plans from more than one centre came back"
    );
  });

  it("counts only the member institution's plans", async () => {
    const counts = await loadPlanCounts(fx.supA);
    const inScope = await prisma.lessonPlan.count({
      where: { institutionId: fx.instA.id },
    });
    const total = counts.PENDING + counts.APPROVED + counts.REVISION;
    assert.equal(total, inScope, "plan counts include out-of-scope rows");
  });

  it("proves the excluded rows exist, so the exclusion is real", async () => {
    const leaked = await prisma.lessonPlan.count({
      where: { id: fx.planBId, institutionId: fx.instB.id },
    });
    assert.equal(leaked, 1);
    assert.notEqual(fx.instA.id, fx.instB.id);
  });

  it("returns nothing at all for a supervisor without membership", async () => {
    const overview = await loadSupervisorOverview(fx.supNoMembership);
    assert.deepEqual(overview.plans, []);
    assert.deepEqual(overview.evaluations, []);
    assert.deepEqual(overview.teachers, []);
    assert.deepEqual(overview.signals, []);
    assert.deepEqual(overview.planCounts, {
      PENDING: 0,
      APPROVED: 0,
      REVISION: 0,
    });
  });

  it("returns nothing for a lapsed membership", async () => {
    assert.deepEqual(await loadSupervisorPlans(fx.supInactive, 100), []);
    assert.deepEqual(await loadSupervisorEvaluations(fx.supInactive), []);
    assert.deepEqual(await loadScopedTeachers(fx.supInactive), []);
    assert.deepEqual(await loadQualitySignals(fx.supInactive), []);
  });

  it("never returns signals pinned to another institution", async () => {
    const signals = await loadQualitySignals(fx.supA, 100);
    const titles = signals.map((signal) => signal.title);

    assert.ok(titles.includes(`${PREFIX}signal-own`), "own signal missing");
    assert.ok(
      titles.includes(`${PREFIX}signal-platform`),
      "platform-wide signal should stay visible"
    );
    assert.ok(
      !titles.includes(`${PREFIX}signal-other`),
      "leaked a signal from another institution"
    );

    const other = await prisma.qualitySignal.count({
      where: { id: fx.signalOtherId, institutionId: fx.instB.id },
    });
    assert.equal(other, 1, "the excluded signal should exist");
  });
});

describe("cross-tenant figures stay in scope", () => {
  it("scores a multi-centre teacher on in-scope plans only", async () => {
    const teachers = await loadScopedTeachers(fx.supA);
    const row = teachers.find((t) => t.id === fx.multiCentreTeacherId);
    assert.ok(row, "the evaluated teacher should be listed");

    // Two APPROVED plans in centre A and one PENDING in centre B. Scored
    // in-scope that is 2/2 = 1; platform-wide it would be 2/3.
    assert.equal(row.planCompliance, 1);
    assert.equal(row.center, fx.instA.name, "label resolved outside the span");
    assert.equal(row.classes, 1, "class count included another institution");
    assert.equal(row.subject, "رياضيات مركز أ", "subject came from another institution");
  });

  it("maps evaluation scores by teacher ID when names are duplicated", async () => {
    const teachers = await loadScopedTeachers(fx.supA);
    const multiCentre = teachers.find((t) => t.id === fx.multiCentreTeacherId);
    const sameName = teachers.find((t) => t.id === fx.teacherWithMembership);

    assert.ok(multiCentre, "the multi-centre teacher should be listed");
    assert.ok(sameName, "the other evaluated teacher should be listed");
    assert.equal(multiCentre.name, sameName.name);
    assert.equal(multiCentre.score, 88);
    assert.equal(sameName.score, 37);
  });

  it("excludes evaluations and teacher details outside the active supervisor scope", async () => {
    const excludedEvaluation = await prisma.teacherEvaluation.count({
      where: {
        supervisorId: fx.supA,
        teacherId: fx.outsideTeacherId,
        periodLabel: `${PREFIX}outside-period`,
      },
    });
    assert.equal(excludedEvaluation, 1, "the excluded evaluation must exist");

    const evaluations = await loadSupervisorEvaluations(fx.supA);
    assert.ok(
      !evaluations.some((row) => row.teacherName === `${PREFIX}teacher-b`),
      "leaked an evaluation for a teacher outside the supervisor's institutions"
    );

    const teachers = await loadScopedTeachers(fx.supA);
    assert.ok(
      !teachers.some((row) => row.id === fx.outsideTeacherId),
      "leaked teacher details from an institution outside the supervisor's scope"
    );
  });

  it("still reports the evaluation score the supervisor authored in scope", async () => {
    const evaluations = await loadSupervisorEvaluations(fx.supA);
    const row = evaluations.find((e) => e.center === fx.instA.name);
    assert.ok(row);
    assert.equal(row.score, 88);
    assert.equal(row.subject, "رياضيات مركز أ");
  });
});

describe("other tiers are unaffected", () => {
  it("rejects an institution write when a supervisor manually selects another institution", async () => {
    const response = await createStudentResponse(
      fx.supA,
      new Request("http://localhost/api/institution/students", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          institutionId: fx.instB.id,
          fullName: `${PREFIX}unauthorized-child`,
          dateOfBirth: "2015-05-06",
          gradeLevel: "الصف الرابع",
        }),
      })
    );

    assert.equal(response.status, 403);
    assert.equal(
      await prisma.student.count({
        where: { fullName: `${PREFIX}unauthorized-child` },
      }),
      0,
      "a manually selected institution id must not create a student"
    );
  });

  it("denies a non-supervisor even with an active staff membership", async () => {
    assert.deepEqual(await loadSupervisorPlans(fx.teacherWithMembership, 100), []);
    const scope = await resolveSupervisorScope(fx.teacherWithMembership);
    assert.equal(scope.kind, "denied");
    assert.equal(
      scope.kind === "denied" ? scope.reason : null,
      "not-supervisor"
    );
  });

  it("keeps the platform admin's documented platform-wide view", async () => {
    const titles = (await loadSupervisorPlans(fx.platformAdmin, 500)).map(
      (plan) => plan.title
    );
    assert.ok(titles.includes(`${PREFIX}plan-a`));
    assert.ok(titles.includes(`${PREFIX}plan-b`));
  });
});
