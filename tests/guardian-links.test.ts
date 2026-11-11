import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { loadInstitutionRoster } from "@/lib/db/institution";
import {
  loadChildLogs,
  loadChildrenOverview,
  loadFeedChildren,
  loadParentDashboard,
} from "@/lib/db/parent";
import { loadClassRoster, loadTeacherStudio } from "@/lib/db/teacher";
import { resolveTeacherScope } from "@/lib/teacher-access";
import {
  applyLegacyGuardianBackfill,
  LegacyBackfillConflictError,
  legacyEventKey,
  planLegacyGuardianBackfill,
} from "@/lib/guardian-backfill";
import {
  loadGuardianContactNames,
  resolveGuardianAccess,
} from "@/lib/guardian-access";
import { resolveInstitutionAccess } from "@/lib/institution-access";
import { prisma } from "@/lib/prisma";

/**
 * StudentGuardian — phase 1 (schema + backfill) and phase 2 (reads).
 *
 * Every assertion runs against PostgreSQL: the fixtures are real users,
 * students, links and enrollments written in `before` and deleted by prefix in
 * `after`, so the tests describe the authorisation the server actually
 * enforces rather than a mocked policy.
 *
 * The suite refuses to touch a production environment.
 */

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "guardian-links tests write fixtures; refusing to run with NODE_ENV=production"
  );
}

const PREFIX = "gn-test-";
const id = (name: string) => `${PREFIX}${name}`;

const ids = {
  parentA: id("parent-a"),
  parentPending: id("parent-pending"),
  parentRejected: id("parent-rejected"),
  parentRevoked: id("parent-revoked"),
  parentUnverified: id("parent-unverified"),
  parentOtherPrimary: id("parent-other-primary"),
  teacher: id("teacher"),
  owner: id("owner"),
  studentA: id("student-a"),
  studentB: id("student-b"),
  studentC: id("student-c"),
  legacyStudent: id("student-legacy"),
  studentNoParent: id("student-none"),
  conflictRevoked: id("student-conflict-revoked"),
  conflictRejected: id("student-conflict-rejected"),
  conflictNonParent: id("student-conflict-role"),
  conflictPrimary: id("student-conflict-primary"),
  instA: id("inst-a"),
  instB: id("inst-b"),
  classA: id("class-a"),
  enrollmentA: id("enrollment-a"),
  enrollmentC: id("enrollment-c"),
  enrollmentB: id("enrollment-b"),
  logA: id("log-a"),
  linkA: id("link-a"),
  linkPending: id("link-pending"),
  linkRejected: id("link-rejected"),
  linkRevoked: id("link-revoked"),
  linkUnverified: id("link-unverified"),
  linkTeacher: id("link-teacher"),
  linkPrimaryOther: id("link-primary-other"),
};

const LINKED = {
  /** parentA → studentA, APPROVED. */
  approved: ids.linkA,
};

async function clearFixtures() {
  await prisma.studentGuardianEvent.deleteMany({
    where: { studentId: { startsWith: PREFIX } },
  });
  await prisma.studentGuardian.deleteMany({
    where: { studentId: { startsWith: PREFIX } },
  });
  await prisma.dailyLog.deleteMany({ where: { studentId: { startsWith: PREFIX } } });
  await prisma.enrollment.deleteMany({ where: { studentId: { startsWith: PREFIX } } });
  await prisma.schoolClass.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.staffMember.deleteMany({
    where: { user: { id: { startsWith: PREFIX } } },
  });
  await prisma.institution.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.student.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

describe("StudentGuardian — phase 1 backfill + phase 2 reads", () => {
  before(async () => {
    await clearFixtures();

    const baseUser = {
      passwordHash: "unused-in-this-suite",
      emailVerified: new Date(),
      termsAcceptedAt: new Date(),
    };

    await prisma.user.createMany({
      data: [
        { ...baseUser, id: ids.parentA, email: "gn-parent-a@test.local", fullName: "ولي أمر أ", role: "PARENT" },
        { ...baseUser, id: ids.parentPending, email: "gn-parent-pending@test.local", fullName: "ولي أمر معلّق", role: "PARENT" },
        { ...baseUser, id: ids.parentRejected, email: "gn-parent-rejected@test.local", fullName: "ولي أمر مرفوض", role: "PARENT" },
        { ...baseUser, id: ids.parentRevoked, email: "gn-parent-revoked@test.local", fullName: "ولي أمر ملغى", role: "PARENT" },
        { ...baseUser, id: ids.teacher, email: "gn-teacher@test.local", fullName: "معلم تجريبي", role: "TEACHER" },
        { ...baseUser, id: ids.owner, email: "gn-owner@test.local", fullName: "مالك مركز", role: "INSTITUTION_TEACHER" },
        { ...baseUser, id: ids.parentUnverified, email: "gn-parent-unverified@test.local", fullName: "ولي أمر غير موثّق", role: "PARENT", emailVerified: null },
        // Holds the competing primary link used by the DUPLICATE_PRIMARY case;
        // kept separate so the PENDING/REJECTED/REVOKED account really starts
        // with no approved relationship of its own.
        { ...baseUser, id: ids.parentOtherPrimary, email: "gn-parent-other@test.local", fullName: "ولي أمر آخر", role: "PARENT" },
      ],
    });

    const birth = new Date("2014-01-01T00:00:00.000Z");
    await prisma.student.createMany({
      data: [
        { id: ids.studentA, fullName: "طفل أ", dateOfBirth: birth, parentId: ids.parentA },
        { id: ids.studentB, fullName: "طفل ب", dateOfBirth: birth, parentId: ids.parentPending },
        { id: ids.studentC, fullName: "طفل ج", dateOfBirth: birth, parentId: ids.parentA },
        { id: ids.legacyStudent, fullName: "طفل ترحيل", dateOfBirth: birth, parentId: ids.parentA },
        // Institution intake: a real student with no guardian account yet.
        { id: ids.studentNoParent, fullName: "طفل بلا ولي أمر", dateOfBirth: birth, parentId: null },
        { id: ids.conflictRevoked, fullName: "طفل تعارض ملغى", dateOfBirth: birth, parentId: ids.parentRevoked },
        { id: ids.conflictRejected, fullName: "طفل تعارض مرفوض", dateOfBirth: birth, parentId: ids.parentRejected },
        { id: ids.conflictNonParent, fullName: "طفل تعارض دور", dateOfBirth: birth, parentId: ids.teacher },
        { id: ids.conflictPrimary, fullName: "طفل تعارض أساسي", dateOfBirth: birth, parentId: ids.parentA },
      ],
    });

    await prisma.institution.createMany({
      data: [
        { id: ids.instA, name: "مركز أ", type: "EDUCATIONAL_CENTER", address: "عنوان أ", zone: "غزة", ownerId: ids.owner },
        { id: ids.instB, name: "مركز ب", type: "EDUCATIONAL_CENTER", address: "عنوان ب", zone: "غزة", ownerId: ids.parentPending },
      ],
    });

    await prisma.schoolClass.create({
      data: {
        id: ids.classA,
        name: "صف تجريبي",
        subject: "الرياضيات",
        gradeLevel: "الصف الخامس",
        institutionId: ids.instA,
        teacherId: ids.teacher,
      },
    });

    // D5: teacher data is reachable only through an ACTIVE teaching
    // membership. The class assignment above is not, by itself, authorization.
    await prisma.staffMember.create({
      data: {
        userId: ids.teacher,
        institutionId: ids.instA,
        title: "معلم",
        role: "TEACHER",
        subjects: ["الرياضيات"],
        status: "ACTIVE",
      },
    });

    await prisma.enrollment.createMany({
      data: [
        { id: ids.enrollmentA, studentId: ids.studentA, institutionId: ids.instA, classId: ids.classA, gradeLevel: "الصف الخامس", commissionFee: 10 },
        { id: ids.enrollmentC, studentId: ids.studentC, institutionId: ids.instA, classId: ids.classA, gradeLevel: "الصف الخامس", commissionFee: 10 },
        { id: ids.enrollmentB, studentId: ids.studentB, institutionId: ids.instB, gradeLevel: "الصف الخامس", commissionFee: 10 },
      ],
    });

    await prisma.dailyLog.create({
      data: {
        id: ids.logA,
        studentId: ids.studentA,
        institutionId: ids.instA,
        date: new Date(),
        attendance: true,
        dayPlan: ["08:00 — طابور"],
      },
    });

    await prisma.studentGuardian.createMany({
      data: [
        { id: LINKED.approved, studentId: ids.studentA, userId: ids.parentA, status: "APPROVED", isPrimary: true, approvedAt: new Date() },
        { id: ids.linkPending, studentId: ids.studentA, userId: ids.parentPending, status: "PENDING" },
        { id: ids.linkRejected, studentId: ids.studentA, userId: ids.parentRejected, status: "REJECTED" },
        { id: ids.linkRevoked, studentId: ids.studentA, userId: ids.parentRevoked, status: "REVOKED", revokedAt: new Date() },
        { id: ids.linkUnverified, studentId: ids.studentB, userId: ids.parentUnverified, status: "APPROVED", isPrimary: true, approvedAt: new Date() },
        { id: ids.linkTeacher, studentId: ids.studentA, userId: ids.teacher, status: "APPROVED" },
        // The revoked relationship of `conflictRevoked` — the backfill must not
        // resurrect it through the legacy `parentId` column.
        { id: ids.linkPrimaryOther, studentId: ids.conflictPrimary, userId: ids.parentOtherPrimary, status: "APPROVED", isPrimary: true, approvedAt: new Date() },
      ],
    });
    await prisma.studentGuardian.create({
      data: {
        studentId: ids.conflictRevoked,
        userId: ids.parentRevoked,
        status: "REVOKED",
        revokedAt: new Date(),
      },
    });
    await prisma.studentGuardian.create({
      data: {
        studentId: ids.conflictRejected,
        userId: ids.parentRejected,
        status: "REJECTED",
      },
    });

    // Phase 4.3: a link is identity; access needs a grant for the centre that
    // produced the record. The legacy backfill deliberately creates no grant.
    await prisma.studentGuardianGrant.createMany({
      data: [
        {
          id: id("grant-approved"),
          linkId: LINKED.approved,
          institutionId: ids.instA,
          status: "APPROVED",
          approvedAt: new Date(),
        },
        {
          id: id("grant-unverified"),
          linkId: ids.linkUnverified,
          institutionId: ids.instB,
          status: "APPROVED",
          approvedAt: new Date(),
        },
        {
          id: id("grant-teacher"),
          linkId: ids.linkTeacher,
          institutionId: ids.instA,
          status: "APPROVED",
          approvedAt: new Date(),
        },
      ],
    });
  });

  after(async () => {
    await clearFixtures();
    await prisma.$disconnect();
  });

  /* ------------------------------------------------------------------ */
  /* Phase 1 — backfill                                                  */
  /* ------------------------------------------------------------------ */

  describe("backfill", () => {
    it("plans and applies the legacy relationship without touching the rest", async () => {
      const parentIdBefore = (
        await prisma.student.findUniqueOrThrow({
          where: { id: ids.legacyStudent },
          select: { parentId: true },
        })
      ).parentId;
      const enrollmentsBefore = await prisma.enrollment.count({
        where: { studentId: ids.legacyStudent },
      });
      // Scoped to this suite's fixtures on purpose. `node --test` runs the
      // test files as concurrent processes against one shared database, so a
      // table-wide `student.count()` races the other files' fixtures; this
      // asserts the property that actually matters — the backfill created or
      // deleted none of *these* students.
      const studentsBefore = await prisma.student.count({
        where: { id: { startsWith: PREFIX } },
      });
      const linksBefore = await prisma.studentGuardian.count({
        where: { studentId: ids.legacyStudent },
      });

      const plan = await planLegacyGuardianBackfill(prisma, {
        studentIds: [ids.legacyStudent],
      });
      assert.equal(plan.conflicts.length, 0);
      assert.equal(plan.toCreate.length, 1);
      assert.equal(plan.toCreate[0].guardianId, ids.parentA);

      const result = await applyLegacyGuardianBackfill(prisma, plan);
      assert.equal(result.created, 1);
      assert.equal(result.eventsWritten, 1);

      const link = await prisma.studentGuardian.findUniqueOrThrow({
        where: {
          studentId_userId: {
            studentId: ids.legacyStudent,
            userId: ids.parentA,
          },
        },
      });
      assert.equal(link.status, "APPROVED");
      assert.equal(link.isPrimary, true);
      assert.ok(link.approvedAt instanceof Date);

      const event = await prisma.studentGuardianEvent.findUniqueOrThrow({
        where: { dedupeKey: legacyEventKey(ids.legacyStudent, ids.parentA) },
      });
      assert.equal(event.action, "LEGACY_IMPORTED");
      assert.equal(event.linkId, link.id);

      // Nothing else moved.
      const parentIdAfter = (
        await prisma.student.findUniqueOrThrow({
          where: { id: ids.legacyStudent },
          select: { parentId: true },
        })
      ).parentId;
      assert.equal(parentIdAfter, parentIdBefore);
      assert.equal(
        await prisma.student.count({ where: { id: { startsWith: PREFIX } } }),
        studentsBefore
      );
      assert.equal(
        await prisma.enrollment.count({ where: { studentId: ids.legacyStudent } }),
        enrollmentsBefore
      );
      assert.equal(
        await prisma.studentGuardian.count({
          where: { studentId: ids.legacyStudent },
        }),
        linksBefore + 1
      );
    });

    it("is idempotent: a second run creates no link and no audit row", async () => {
      const linksBefore = await prisma.studentGuardian.count({
        where: { studentId: ids.legacyStudent },
      });
      const eventsBefore = await prisma.studentGuardianEvent.count({
        where: {
          studentId: ids.legacyStudent,
          action: "LEGACY_IMPORTED",
        },
      });

      const plan = await planLegacyGuardianBackfill(prisma, {
        studentIds: [ids.legacyStudent],
      });
      assert.equal(plan.conflicts.length, 0);
      assert.equal(plan.toCreate.length, 0);
      assert.equal(plan.alreadyApproved.length, 1);

      const result = await applyLegacyGuardianBackfill(prisma, plan);
      assert.equal(result.created, 0);
      assert.equal(result.eventsWritten, 0);
      assert.equal(
        await prisma.studentGuardian.count({
          where: { studentId: ids.legacyStudent },
        }),
        linksBefore
      );
      assert.equal(
        await prisma.studentGuardianEvent.count({
          where: { studentId: ids.legacyStudent, action: "LEGACY_IMPORTED" },
        }),
        eventsBefore
      );
    });

    it("skips a student with no parentId instead of reporting a conflict", async () => {
      const plan = await planLegacyGuardianBackfill(prisma, {
        studentIds: [ids.studentNoParent],
      });
      assert.equal(plan.scanned, 1);
      assert.equal(plan.withoutLegacyParent, 1);
      assert.equal(plan.toCreate.length, 0);
      assert.equal(plan.conflicts.length, 0);

      const result = await applyLegacyGuardianBackfill(prisma, plan);
      assert.equal(result.created, 0);
      assert.equal(
        await prisma.studentGuardian.count({
          where: { studentId: ids.studentNoParent },
        }),
        0
      );
    });

    for (const [label, studentId, kind] of [
      ["a REVOKED link", ids.conflictRevoked, "CONFLICTING_LINK"],
      ["a REJECTED link", ids.conflictRejected, "CONFLICTING_LINK"],
      ["a non-PARENT account", ids.conflictNonParent, "NON_PARENT_ACCOUNT"],
      ["another approved primary", ids.conflictPrimary, "DUPLICATE_PRIMARY"],
    ] as const) {
      it(`refuses to write over ${label}`, async () => {
        const before = await prisma.studentGuardian.count({
          where: { studentId },
        });
        const plan = await planLegacyGuardianBackfill(prisma, {
          studentIds: [studentId],
        });

        assert.equal(plan.toCreate.length, 0);
        assert.ok(
          plan.conflicts.some((conflict) => conflict.kind === kind),
          `expected ${kind}, got ${JSON.stringify(plan.conflicts)}`
        );

        await assert.rejects(
          () => applyLegacyGuardianBackfill(prisma, plan),
          (error: unknown) => {
            assert.ok(error instanceof LegacyBackfillConflictError);
            return true;
          }
        );
        assert.equal(
          await prisma.studentGuardian.count({ where: { studentId } }),
          before
        );
      });
    }
  });

  /* ------------------------------------------------------------------ */
  /* Phase 2 — authorisation and reads                                   */
  /* ------------------------------------------------------------------ */

  describe("parent access", () => {
    it("resolves only APPROVED links for a live, verified PARENT", async () => {
      const result = await resolveGuardianAccess(ids.parentA);
      assert.equal(result.ok, true);
      if (!result.ok) return;

      assert.ok(result.access.studentIds.includes(ids.studentA));
      assert.ok(!result.access.studentIds.includes(ids.studentB));
      assert.ok(!result.access.studentIds.includes(ids.studentC));
      assert.ok(!result.access.studentIds.includes(ids.studentNoParent));
      // A backfilled family link without a grant is identity-only: it is
      // linked, but it is not a readable student.
      assert.ok(!result.access.studentIds.includes(ids.legacyStudent));
      assert.ok(result.access.linkedStudentIds.includes(ids.legacyStudent));

      const children = await loadFeedChildren(result.access);
      const childIds = children.map((child) => child.id);
      assert.ok(childIds.includes(ids.studentA));
      assert.ok(childIds.includes(ids.legacyStudent));
      assert.ok(!childIds.includes(ids.studentB));
      assert.ok(!childIds.includes(ids.studentC));
      assert.equal(
        children.find((child) => child.id === ids.legacyStudent)?.institutionId,
        "",
        "the legacy child has no institutional card"
      );
    });

    it("keeps the existing parent's dashboard and overview working", async () => {
      const result = await resolveGuardianAccess(ids.parentA);
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const dashboard = await loadParentDashboard(result.access);
      assert.equal(
        dashboard.children.length,
        result.access.linkedStudentIds.length
      );

      const overview = await loadChildrenOverview(result.access);
      assert.equal(overview.length, result.access.linkedStudentIds.length);
      assert.ok(overview.some((card) => card.child.id === ids.studentA));
      const legacy = overview.find((card) => card.child.id === ids.legacyStudent);
      assert.ok(legacy);
      assert.equal(legacy.performance.length, 0);
      assert.equal(legacy.logsCount, 0);
      assert.equal(legacy.child.institutionName, "غير مسجل");
    });

    it("never exposes PENDING, REJECTED or REVOKED relationships", async () => {
      for (const guardianId of [
        ids.parentPending,
        ids.parentRejected,
        ids.parentRevoked,
      ]) {
        const result = await resolveGuardianAccess(guardianId);
        assert.equal(result.ok, true);
        if (!result.ok) continue;
        assert.deepEqual(result.access.studentIds, []);
        assert.deepEqual(await loadFeedChildren(result.access), []);
      }
    });

    it("denies an account whose email is not verified, even with an APPROVED link", async () => {
      const result = await resolveGuardianAccess(ids.parentUnverified);
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.reason, "EMAIL_UNVERIFIED");
    });

    it("denies an APPROVED link held by a non-PARENT account", async () => {
      const result = await resolveGuardianAccess(ids.teacher);
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.reason, "NOT_PARENT");
    });

    it("denies missing and unknown accounts", async () => {
      const noSession = await resolveGuardianAccess(undefined);
      assert.equal(noSession.ok, false);
      if (!noSession.ok) assert.equal(noSession.reason, "NO_SESSION");

      const unknown = await resolveGuardianAccess(id("does-not-exist"));
      assert.equal(unknown.ok, false);
      if (!unknown.ok) assert.equal(unknown.reason, "ACCOUNT_MISSING");
    });

    it("cannot read another family's child logs through a crafted id", async () => {
      const result = await resolveGuardianAccess(ids.parentA);
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const own = await loadChildLogs(result.access, ids.studentA);
      assert.ok(own.size >= 1);

      assert.equal((await loadChildLogs(result.access, ids.studentB)).size, 0);
      assert.equal((await loadChildLogs(result.access, ids.studentC)).size, 0);
    });
  });

  describe("staff rosters", () => {
    it("shows the approved guardian, and «—» when no guardian is linked", async () => {
      const names = await loadGuardianContactNames(
        [ids.studentA, ids.studentC],
        ids.instA
      );
      assert.equal(names.get(ids.studentA), "ولي أمر أ");
      assert.equal(names.get(ids.studentC), null);

      const access = await resolveInstitutionAccess(ids.owner);
      assert.ok(access);
      if (!access) return;

      const roster = await loadInstitutionRoster(access);
      const byId = new Map(roster.map((row) => [row.id, row]));
      assert.equal(byId.get(ids.studentA)?.guardian, "ولي أمر أ");
      assert.equal(byId.get(ids.studentC)?.guardian, "—");
      // The other centre's student is not in this roster at all.
      assert.equal(byId.has(ids.studentB), false);
    });

    it("keeps the teacher roster working without assuming a guardian", async () => {
      const resolved = await resolveTeacherScope(ids.teacher, ids.instA);
      assert.equal(resolved.kind, "scope");
      if (resolved.kind !== "scope") return;

      const roster = await loadClassRoster(resolved.scope, ids.classA);
      assert.ok(roster);
      if (!roster) return;

      const byId = new Map(roster.students.map((row) => [row.id, row]));
      assert.equal(byId.get(ids.studentA)?.guardian, "ولي أمر أ");
      assert.equal(byId.get(ids.studentC)?.guardian, "—");

      const studio = await loadTeacherStudio(resolved.scope);
      const studioById = new Map(studio.roster.map((row) => [row.id, row]));
      assert.equal(studioById.get(ids.studentA)?.guardian, "ولي أمر أ");
      assert.equal(studioById.get(ids.studentC)?.guardian, "—");
    });

    it("refuses an institution the account does not own or administer", async () => {
      assert.equal(
        await resolveInstitutionAccess(ids.owner, ids.instB),
        null
      );
    });
  });
});
