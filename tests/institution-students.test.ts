import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { NextRequest } from "next/server";

import { middleware } from "@/middleware";
import { loadAdminInstitutions } from "@/lib/db/admin";
import {
  loadInstitutionCommissions,
  loadInstitutionHeader,
  loadInstitutionProfile,
  loadInstitutionRoster,
} from "@/lib/db/institution";
import {
  createInstitutionStudent,
  InstitutionStudentError,
  loadInstitutionStudents,
} from "@/lib/db/institution-students";
import { loadFinanceStats } from "@/lib/db/finance";
import { loadClassRoster } from "@/lib/db/teacher";
import { resolveTeacherScope } from "@/lib/teacher-access";
import { createParentStudent, ParentStudentForbiddenError } from "@/lib/db/parent-students";
import { loadFeedChildren } from "@/lib/db/parent";
import { resolveGuardianAccess } from "@/lib/guardian-access";
import {
  InstitutionAccessDeniedError,
  resolveInstitutionAccess,
} from "@/lib/institution-access";
import { prisma } from "@/lib/prisma";

/**
 * Phase 3 — institution student intake.
 *
 * These run against PostgreSQL with real fixtures: an owned centre, an ACTIVE
 * CENTER_ADMIN, an ACTIVE SECRETARY, an ACTIVE TEACHER, a second centre, and
 * students created through the same services the UI uses.
 *
 * What is asserted, in the order the requirements list it: a permitted user
 * creates student + enrollment atomically; unauthenticated/foreign/limited
 * users are refused; a class from another centre is refused and leaves no
 * partial row; duplicates are refused; the list is tenant-scoped; intake does
 * not enter the commission ledger; and the parent path still works.
 */

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "institution-students tests write fixtures; refusing to run with NODE_ENV=production"
  );
}

const PREFIX = "is-test-";
const id = (name: string) => `${PREFIX}${name}`;

const ids = {
  owner: id("owner"),
  admin: id("admin"),
  secretary: id("secretary"),
  teacher: id("teacher"),
  otherOwner: id("other-owner"),
  parent: id("parent"),
  instA: id("inst-a"),
  instB: id("inst-b"),
  classA1: id("class-a1"),
  classA2: id("class-a2"),
  classB: id("class-b"),
};

const DOB = new Date("2015-05-06T00:00:00.000Z");

/** Unique-ish names so a failed test never collides with another run. */
const run = Date.now().toString(36);
const studentName = (suffix: string) => `طالب اختبار ${run} ${suffix}`;

/**
 * Removes every row this suite created.
 *
 * The service writes students with generated uuid ids (as production does),
 * so prefix-only cleanup is not enough: rows are also found through the two
 * fixture centres and through the run-specific name prefix used by the parent
 * path test.
 */
async function clearFixtures() {
  const institutions = [ids.instA, ids.instB];
  const namePrefix = `طالب اختبار ${run}`;

  const [byName, byInstitution] = await Promise.all([
    prisma.student.findMany({
      where: {
        OR: [
          { id: { startsWith: PREFIX } },
          { fullName: { startsWith: namePrefix } },
          { fullName: { startsWith: "طالب اختبار " } },
        ],
      },
      select: { id: true },
    }),
    prisma.enrollment.findMany({
      where: { institutionId: { in: institutions } },
      select: { studentId: true },
    }),
  ]);

  const studentIds = [
    ...new Set([
      ...byName.map((row) => row.id),
      ...byInstitution.map((row) => row.studentId),
    ]),
  ];

  await prisma.studentGuardianEvent.deleteMany({
    where: { studentId: { in: studentIds } },
  });
  await prisma.studentGuardian.deleteMany({
    where: { studentId: { in: studentIds } },
  });
  await prisma.enrollment.deleteMany({
    where: {
      OR: [
        { studentId: { in: studentIds } },
        { institutionId: { in: institutions } },
      ],
    },
  });
  await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  await prisma.schoolClass.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.staffMember.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.institution.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

describe("institution student intake", () => {
  before(async () => {
    await clearFixtures();

    const baseUser = {
      passwordHash: "unused-in-this-suite",
      emailVerified: new Date(),
      termsAcceptedAt: new Date(),
    };

    await prisma.user.createMany({
      data: [
        { ...baseUser, id: ids.owner, email: "is-owner@test.local", fullName: "مالك المركز", role: "INSTITUTION_TEACHER" },
        { ...baseUser, id: ids.admin, email: "is-admin@test.local", fullName: "مدير المركز", role: "INSTITUTION_TEACHER" },
        { ...baseUser, id: ids.secretary, email: "is-secretary@test.local", fullName: "سكرتير المركز", role: "INSTITUTION_TEACHER" },
        { ...baseUser, id: ids.teacher, email: "is-teacher@test.local", fullName: "معلم المركز", role: "TEACHER" },
        { ...baseUser, id: ids.otherOwner, email: "is-other-owner@test.local", fullName: "مالك مركز آخر", role: "INSTITUTION_TEACHER" },
        { ...baseUser, id: ids.parent, email: "is-parent@test.local", fullName: "ولي أمر", role: "PARENT" },
      ],
    });

    await prisma.institution.createMany({
      data: [
        { id: ids.instA, name: "مركز الاختبار أ", type: "EDUCATIONAL_CENTER", address: "عنوان", zone: "غزة", ownerId: ids.owner },
        { id: ids.instB, name: "مركز الاختبار ب", type: "EDUCATIONAL_CENTER", address: "عنوان", zone: "غزة", ownerId: ids.otherOwner },
      ],
    });

    await prisma.staffMember.createMany({
      data: [
        { id: id("staff-admin"), userId: ids.admin, institutionId: ids.instA, title: "مدير", role: "CENTER_ADMIN", status: "ACTIVE" },
        { id: id("staff-secretary"), userId: ids.secretary, institutionId: ids.instA, title: "سكرتير", role: "SECRETARY", status: "ACTIVE" },
        { id: id("staff-teacher"), userId: ids.teacher, institutionId: ids.instA, title: "معلم", role: "TEACHER", status: "ACTIVE" },
      ],
    });

    await prisma.schoolClass.createMany({
      data: [
        { id: ids.classA1, name: "فصل أ1", subject: "الرياضيات", gradeLevel: "الصف الرابع", institutionId: ids.instA, teacherId: ids.teacher },
        { id: ids.classA2, name: "فصل أ2", subject: "العلوم", gradeLevel: "الصف الخامس", institutionId: ids.instA, teacherId: ids.teacher },
        { id: ids.classB, name: "فصل ب", subject: "اللغة العربية", gradeLevel: "الصف السادس", institutionId: ids.instB },
      ],
    });
  });

  after(async () => {
    await clearFixtures();
    await prisma.$disconnect();
  });

  it("refuses an unauthenticated request at the edge (401, not a redirect)", async () => {
    process.env.NEXTAUTH_SECRET ||= "test-secret";
    const response = await middleware(
      new NextRequest("http://localhost/api/institution/students", {
        method: "POST",
      })
    );
    assert.equal(response.status, 401);
  });

  it("lets the owner create a student and an enrollment atomically", async () => {
    const access = await resolveInstitutionAccess(ids.owner);
    assert.ok(access);

    const created = await createInstitutionStudent(access, {
      fullName: studentName("مالك"),
      dateOfBirth: DOB,
      gradeLevel: "الصف الأول", // the class owns the authoritative grade
      classId: ids.classA1,
    });

    const student = await prisma.student.findUniqueOrThrow({
      where: { id: created.studentId },
      include: { guardians: true },
    });
    assert.equal(student.parentId, null);
    assert.equal(student.guardians.length, 0, "no guardian link is invented");

    const enrollment = await prisma.enrollment.findUniqueOrThrow({
      where: { id: created.enrollmentId },
    });
    assert.equal(enrollment.institutionId, ids.instA);
    assert.equal(enrollment.classId, ids.classA1);
    assert.equal(enrollment.gradeLevel, "الصف الرابع");
    assert.equal(enrollment.source, "INSTITUTION");
    assert.equal(enrollment.enrollmentStatus, "ACTIVE");
    assert.equal(enrollment.commissionFee, 0);
    // Payment state is not reused as the operational state.
    assert.equal(enrollment.status, "PENDING");
  });

  it("lets an ACTIVE CENTER_ADMIN create a student", async () => {
    const access = await resolveInstitutionAccess(ids.admin);
    assert.ok(access);

    const created = await createInstitutionStudent(access, {
      fullName: studentName("مدير"),
      dateOfBirth: DOB,
      gradeLevel: "الصف الخامس",
      classId: ids.classA2,
    });
    assert.ok(created.studentId);
  });

  it("refuses a SECRETARY, a TEACHER and an outsider", async () => {
    assert.equal(await resolveInstitutionAccess(ids.secretary), null);
    assert.equal(await resolveInstitutionAccess(ids.teacher), null);
    assert.equal(await resolveInstitutionAccess(ids.otherOwner, ids.instA), null);
  });

  it("refuses a token that lacks students.write, even with a valid centre", async () => {
    const access = await resolveInstitutionAccess(ids.owner);
    assert.ok(access);
    const readonly = { ...access, capabilities: [] as const };

    await assert.rejects(
      () =>
        createInstitutionStudent(readonly, {
          fullName: studentName("بلا-صلاحية"),
          dateOfBirth: DOB,
          gradeLevel: "الصف الرابع",
        }),
      (error: unknown) => error instanceof InstitutionAccessDeniedError
    );
  });

  it("refuses a class from another centre and leaves no student behind", async () => {
    const access = await resolveInstitutionAccess(ids.owner);
    assert.ok(access);
    const name = studentName("فصل-خارجي");

    await assert.rejects(
      () =>
        createInstitutionStudent(access, {
          fullName: name,
          dateOfBirth: DOB,
          gradeLevel: "الصف السادس",
          classId: ids.classB,
        }),
      (error: unknown) => {
        assert.ok(error instanceof InstitutionStudentError);
        assert.equal(error.code, "CLASS_NOT_IN_INSTITUTION");
        return true;
      }
    );

    assert.equal(
      await prisma.student.count({ where: { fullName: name } }),
      0,
      "the student must not exist without its enrollment"
    );
  });

  it("rolls the student back if the enrollment cannot be written", async () => {
    const access = await resolveInstitutionAccess(ids.owner);
    assert.ok(access);
    const broken = { ...access, institutionId: id("missing-institution") };
    const name = studentName("تراجع");

    await assert.rejects(() =>
      createInstitutionStudent(broken, {
        fullName: name,
        dateOfBirth: DOB,
        gradeLevel: "الصف الرابع",
      })
    );
    assert.equal(await prisma.student.count({ where: { fullName: name } }), 0);
  });

  it("refuses the same child twice and allows a different date of birth", async () => {
    const access = await resolveInstitutionAccess(ids.owner);
    assert.ok(access);
    const name = studentName("مكرر");

    await createInstitutionStudent(access, {
      fullName: name,
      dateOfBirth: DOB,
      gradeLevel: "الصف الرابع",
    });

    await assert.rejects(
      () =>
        createInstitutionStudent(access, {
          // Whitespace must not defeat the rule.
          fullName: `  ${name.replace(" ", "  ")} `,
          dateOfBirth: new Date(DOB),
          gradeLevel: "الصف الرابع",
        }),
      (error: unknown) => {
        assert.ok(error instanceof InstitutionStudentError);
        assert.equal(error.code, "DUPLICATE_STUDENT");
        return true;
      }
    );
    assert.equal(await prisma.student.count({ where: { fullName: name } }), 1);

    // A different birth date is a different child as far as this rule goes.
    await createInstitutionStudent(access, {
      fullName: name,
      dateOfBirth: new Date("2016-05-06T00:00:00.000Z"),
      gradeLevel: "الصف الرابع",
    });
    assert.equal(await prisma.student.count({ where: { fullName: name } }), 2);
  });

  it("lists only this centre's students, with «—» for an unlinked guardian", async () => {
    const access = await resolveInstitutionAccess(ids.owner);
    assert.ok(access);
    const rows = await loadInstitutionStudents(access);

    assert.ok(rows.length > 0);
    assert.ok(rows.every((row) => row.enrollmentId));
    // Every row belongs to centre A; the loader is keyed on the token.
    const institutionIds = await prisma.enrollment.findMany({
      where: { id: { in: rows.map((row) => row.enrollmentId) } },
      select: { institutionId: true },
    });
    assert.ok(institutionIds.every((row) => row.institutionId === ids.instA));

    const intake = rows.find((row) => row.source === "INSTITUTION");
    assert.ok(intake);
    assert.equal(intake.guardian, "—");
    assert.equal(intake.status, "ACTIVE");

    // The second centre's roster is empty: nothing leaked across tenants.
    const otherAccess = await resolveInstitutionAccess(ids.otherOwner);
    assert.ok(otherAccess);
    const otherRows = await loadInstitutionStudents(otherAccess);
    assert.equal(otherRows.length, 0);
  });

  it("keeps institution intake out of the referral commission ledger", async () => {
    const access = await resolveInstitutionAccess(ids.owner);
    assert.ok(access);
    const commissions = await loadInstitutionCommissions(access);
    assert.equal(commissions.length, 0);

    const intake = await prisma.enrollment.findFirstOrThrow({
      where: { institutionId: ids.instA, source: "INSTITUTION" },
      select: { id: true },
    });
    assert.equal(commissions.some((row) => row.id === intake.id), false);
  });

  it("still creates parent-portal children with an APPROVED link, visible immediately", async () => {
    const name = studentName("ولي-أمر");
    const created = await createParentStudent(ids.parent, {
      fullName: name,
      dateOfBirth: DOB,
    });

    const student = await prisma.student.findUniqueOrThrow({
      where: { id: created.id },
      include: { guardians: true },
    });
    assert.equal(student.parentId, ids.parent);
    assert.equal(student.guardians.length, 1);
    assert.equal(student.guardians[0].status, "APPROVED");
    assert.equal(student.guardians[0].isPrimary, true);

    const access = await resolveGuardianAccess(ids.parent);
    assert.equal(access.ok, true);
    if (!access.ok) return;
    const children = await loadFeedChildren(access.access);
    assert.ok(children.some((child) => child.id === created.id));

    // The institution-created students never become visible to this parent.
    const intake = await prisma.enrollment.findFirstOrThrow({
      where: { institutionId: ids.instA, source: "INSTITUTION" },
      select: { studentId: true },
    });
    assert.equal(children.some((child) => child.id === intake.studentId), false);
  });

  it("refuses parent creation for a non-PARENT account", async () => {
    await assert.rejects(
      () =>
        createParentStudent(ids.teacher, {
          fullName: studentName("معلم"),
          dateOfBirth: DOB,
        }),
      (error: unknown) => error instanceof ParentStudentForbiddenError
    );
  });

  /* ------------------------------------------------------------------ */
  /* Closure round: concurrency, retries, withdrawn seats, money         */
  /* ------------------------------------------------------------------ */

  it("serialises simultaneous identical submissions into one student", async () => {
    const access = await resolveInstitutionAccess(ids.owner);
    assert.ok(access);
    const name = studentName("سباق");
    const input = {
      fullName: name,
      dateOfBirth: DOB,
      gradeLevel: "الصف الرابع",
    };

    // Four transactions started together; without the advisory lock they all
    // read "no duplicate" before any of them commits and every one of them
    // writes a student.
    const settled = await Promise.allSettled(
      Array.from({ length: 4 }, () => createInstitutionStudent(access, input))
    );
    const succeeded = settled.filter((row) => row.status === "fulfilled");
    const refused = settled.filter(
      (row): row is PromiseRejectedResult => row.status === "rejected"
    );

    assert.equal(succeeded.length, 1, "exactly one submission may win the race");
    assert.equal(refused.length, 3);
    for (const failure of refused) {
      assert.ok(failure.reason instanceof InstitutionStudentError);
      assert.equal(failure.reason.code, "DUPLICATE_STUDENT");
    }

    assert.equal(await prisma.student.count({ where: { fullName: name } }), 1);
    assert.equal(
      await prisma.enrollment.count({ where: { student: { fullName: name } } }),
      1,
      "one seat, not one per request"
    );
  });

  it("replays a repeated submission that carries the same Idempotency-Key", async () => {
    const access = await resolveInstitutionAccess(ids.owner);
    assert.ok(access);
    const name = studentName("مفتاح");
    const idempotencyKey = `closure-${run}-retry-key-01`;
    const input = {
      fullName: name,
      dateOfBirth: DOB,
      gradeLevel: "الصف الرابع",
      idempotencyKey,
    };

    const first = await createInstitutionStudent(access, input);
    const replay = await createInstitutionStudent(access, input);

    assert.equal(replay.replayed, true);
    assert.equal(replay.studentId, first.studentId);
    assert.equal(await prisma.student.count({ where: { fullName: name } }), 1);

    // The same token with a different payload is a new submission, not a
    // replay: it must never answer with someone else's ids.
    const other = await createInstitutionStudent(access, {
      ...input,
      fullName: studentName("مفتاح-آخر"),
    });
    assert.equal(other.replayed, undefined);
    assert.notEqual(other.studentId, first.studentId);
  });

  it("does not create a second student when one key is submitted twice at once", async () => {
    const access = await resolveInstitutionAccess(ids.owner);
    assert.ok(access);
    const name = studentName("مفتاح-متزامن");
    const input = {
      fullName: name,
      dateOfBirth: DOB,
      gradeLevel: "الصف الرابع",
      idempotencyKey: `closure-${run}-retry-key-02`,
    };

    const settled = await Promise.allSettled([
      createInstitutionStudent(access, input),
      createInstitutionStudent(access, input),
    ]);
    const succeeded = settled.flatMap((row) =>
      row.status === "fulfilled" ? [row.value] : []
    );

    assert.ok(succeeded.length >= 1);
    const studentIds = new Set(succeeded.map((row) => row.studentId));
    assert.equal(studentIds.size, 1, "a retry answers with the original ids");
    assert.equal(await prisma.student.count({ where: { fullName: name } }), 1);

    // A cross-process retry cannot see the replay window; it must still be
    // refused as a duplicate rather than silently create a second seat.
    for (const row of settled) {
      if (row.status === "rejected") {
        assert.ok(row.reason instanceof InstitutionStudentError);
        assert.equal(row.reason.code, "DUPLICATE_STUDENT");
      }
    }
  });

  it("answers the HTTP route with 400/403/409/201/200 as documented", async () => {
    // Imported lazily so the NextAuth module is loaded after the test secret
    // is set by the middleware test above.
    const { createStudentResponse } = await import(
      "@/app/api/institution/students/handler"
    );
    const request = (body: unknown, headers: Record<string, string> = {}) =>
      new Request("http://localhost/api/institution/students", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      });

    const base = {
      institutionId: ids.instA,
      gradeLevel: "الصف الرابع",
      dateOfBirth: "2015-05-06",
    };
    const name = studentName("مسار-http");

    // An account that owns another centre cannot write here…
    const foreignOwner = await createStudentResponse(
      ids.otherOwner,
      request({ ...base, fullName: name })
    );
    assert.equal(foreignOwner.status, 403);

    // …and a staff member without students.write is refused too.
    const secretary = await createStudentResponse(
      ids.secretary,
      request({ ...base, fullName: name })
    );
    assert.equal(secretary.status, 403);

    const otherCentre = await createStudentResponse(
      ids.owner,
      request({ ...base, institutionId: ids.instB, fullName: name })
    );
    assert.equal(otherCentre.status, 403);

    const invalidBody = await createStudentResponse(
      ids.owner,
      request({ ...base, fullName: "ا" })
    );
    assert.equal(invalidBody.status, 400);
    assert.equal((await invalidBody.json()).code, "INVALID_BODY");

    const foreignClass = await createStudentResponse(
      ids.owner,
      request({ ...base, fullName: name, classId: ids.classB })
    );
    assert.equal(foreignClass.status, 400);
    assert.equal((await foreignClass.json()).code, "CLASS_NOT_IN_INSTITUTION");

    const idempotencyKey = `closure-${run}-http-key-1`;
    const created = await createStudentResponse(
      ids.owner,
      request(
        { ...base, fullName: name, classId: ids.classA1 },
        { "Idempotency-Key": idempotencyKey }
      )
    );
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.success, true);
    assert.ok(createdBody.studentId);

    const replay = await createStudentResponse(
      ids.owner,
      request(
        { ...base, fullName: name, classId: ids.classA1 },
        { "Idempotency-Key": idempotencyKey }
      )
    );
    assert.equal(replay.status, 200);
    const replayBody = await replay.json();
    assert.equal(replayBody.replayed, true);
    assert.equal(replayBody.studentId, createdBody.studentId);

    // Same child, no key: the duplicate rule answers 409.
    const duplicate = await createStudentResponse(
      ids.owner,
      request({ ...base, fullName: name })
    );
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).code, "DUPLICATE_STUDENT");

    const malformedKey = await createStudentResponse(
      ids.owner,
      request(
        { ...base, fullName: studentName("مفتاح-سيئ") },
        { "Idempotency-Key": "short" }
      )
    );
    assert.equal(malformedKey.status, 400);
    assert.equal(
      (await malformedKey.json()).code,
      "INVALID_IDEMPOTENCY_KEY"
    );
  });

  it("drops a withdrawn seat from live reads without erasing its record", async () => {
    const access = await resolveInstitutionAccess(ids.owner);
    assert.ok(access);
    const name = studentName("منسحب");
    const created = await createInstitutionStudent(access, {
      fullName: name,
      dateOfBirth: DOB,
      gradeLevel: "الصف الرابع",
      classId: ids.classA1,
    });

    const rosterBefore = await loadInstitutionRoster(access);
    assert.ok(rosterBefore.some((row) => row.id === created.studentId));
    const headerBefore = await loadInstitutionHeader(access);
    const profileBefore = await loadInstitutionProfile(access);

    await prisma.enrollment.update({
      where: { id: created.enrollmentId },
      data: { enrollmentStatus: "WITHDRAWN" },
    });

    // Live operational reads: the seat is gone.
    const rosterAfter = await loadInstitutionRoster(access);
    assert.equal(
      rosterAfter.some((row) => row.id === created.studentId),
      false,
      "a withdrawn seat is not marked in the attendance grid"
    );

    const teacherScope = await resolveTeacherScope(ids.teacher, ids.instA);
    assert.equal(teacherScope.kind, "scope");
    if (teacherScope.kind !== "scope") return;

    const classRoster = await loadClassRoster(teacherScope.scope, ids.classA1);
    assert.ok(classRoster);
    assert.equal(
      classRoster.students.some((row) => row.id === created.studentId),
      false,
      "a withdrawn student is not a row the teacher is asked to grade"
    );

    const headerAfter = await loadInstitutionHeader(access);
    assert.ok(headerBefore);
    assert.ok(headerAfter);
    assert.equal(headerAfter.students, headerBefore.students - 1);

    // The register keeps the enrollment and its state — no history is lost.
    const register = await loadInstitutionStudents(access);
    assert.equal(
      register.find((row) => row.enrollmentId === created.enrollmentId)?.status,
      "WITHDRAWN"
    );

    const stored = await prisma.enrollment.findUniqueOrThrow({
      where: { id: created.enrollmentId },
    });
    assert.equal(stored.status, "PENDING", "payment state is not the seat state");
    assert.equal(stored.commissionFee, 0);

    // Institution intake is outside the occupancy figures either way.
    const profileAfter = await loadInstitutionProfile(access);
    assert.equal(profileAfter?.occupancy, profileBefore?.occupancy);
  });

  it("keeps a withdrawn child's history visible to the approved guardian", async () => {
    const child = await createParentStudent(ids.parent, {
      fullName: studentName("منسحب-عائلي"),
      dateOfBirth: DOB,
    });
    await prisma.enrollment.create({
      data: {
        studentId: child.id,
        institutionId: ids.instA,
        gradeLevel: "الصف الثالث",
        enrollmentStatus: "WITHDRAWN",
        source: "INSTITUTION",
        commissionFee: 0,
      },
    });

    const guardian = await resolveGuardianAccess(ids.parent);
    assert.equal(guardian.ok, true);
    if (!guardian.ok) return;
    const children = await loadFeedChildren(guardian.access);
    assert.ok(
      children.some((entry) => entry.id === child.id),
      "withdrawing a seat must not take the family's records away"
    );

    const access = await resolveInstitutionAccess(ids.owner);
    assert.ok(access);
    const roster = await loadInstitutionRoster(access);
    assert.equal(roster.some((row) => row.id === child.id), false);
  });

  it("counts commission only from platform referrals, explicitly", async () => {
    const before = await loadFinanceStats();
    const child = await createParentStudent(ids.parent, {
      fullName: studentName("مالية"),
      dateOfBirth: DOB,
    });
    const enrollment = await prisma.enrollment.create({
      data: {
        studentId: child.id,
        institutionId: ids.instA,
        gradeLevel: "الصف الثاني",
        // A fee deliberately written on institution intake: the source filter,
        // not the zero default, is what has to keep it out of the totals.
        commissionFee: 500,
        status: "VERIFIED",
        source: "INSTITUTION",
        enrollmentStatus: "ACTIVE",
      },
    });

    const withIntake = await loadFinanceStats();
    assert.equal(
      withIntake.collectedCommissions,
      before.collectedCommissions,
      "institution intake must not enter the platform commission total"
    );
    const adminWithIntake = (await loadAdminInstitutions()).find(
      (row) => row.id === ids.instA
    );
    assert.ok(adminWithIntake);
    assert.equal(adminWithIntake.commission, 0);

    // The same row, reclassified as a referral, is counted — proving the filter
    // is `source` and not an accidental side effect.
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { source: "PLATFORM_REFERRAL" },
    });
    const withReferral = await loadFinanceStats();
    assert.equal(withReferral.collectedCommissions, before.collectedCommissions + 500);
    const adminWithReferral = (await loadAdminInstitutions()).find(
      (row) => row.id === ids.instA
    );
    assert.ok(adminWithReferral);
    assert.equal(adminWithReferral.commission, 500);

    const stored = await prisma.enrollment.findUniqueOrThrow({
      where: { id: enrollment.id },
    });
    assert.equal(stored.status, "VERIFIED", "the payment state itself is untouched");
  });
});
