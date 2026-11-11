import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  loadClassRoster,
  loadTeacherAssignments,
  loadTeacherAttendanceBoard,
  loadTeacherClasses,
  loadTeacherOverview,
  loadTeacherStudio,
  loadTeacherTimetable,
  loadTeacherWorkload,
} from "@/lib/db/teacher";
import { prisma } from "@/lib/prisma";
import {
  resolveTeacherScope,
  type TeacherScope,
} from "@/lib/teacher-access";

/**
 * D5 — teacher data scope.
 *
 * Ambient data: `teacher-mixed` holds an ACTIVE membership at centre A and an
 * INACTIVE one at centre B, with a class, timetable slot, enrollment and
 * homework at each. `teacher-multi` is ACTIVE at both (the ambiguous case),
 * `teacher-single` at one only, and `teacher-no-member` has no membership row
 * at all despite `User.role = TEACHER` and an assigned class.
 *
 * Two layers are asserted:
 *   1. `resolveTeacherScope` — denied / scope / ambiguous, and the explicit
 *      `?institution=` selector never falling back.
 *   2. every loader — it must not return a row from outside the scope, proven
 *      against a fixture where the excluded row exists.
 *
 * Fixtures are prefixed `d5-scope-` and are created and removed by this file
 * only. The suite refuses to run with `NODE_ENV=production`.
 */

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "teacher-scope tests write fixtures; refusing to run with NODE_ENV=production"
  );
}

const PREFIX = "d5-scope-";
const id = (name: string) => `${PREFIX}${name}`;

const ids = {
  ownerA: id("owner-a"),
  ownerB: id("owner-b"),
  teacherMixed: id("teacher-mixed"),
  teacherSingle: id("teacher-single"),
  teacherNoMember: id("teacher-no-member"),
  teacherMulti: id("teacher-multi"),
  plainParent: id("plain-parent"),
  instA: id("inst-a"),
  instB: id("inst-b"),
  classA: id("class-a"),
  classB: id("class-b"),
  classSingleA: id("class-single-a"),
  classNoMemberA: id("class-no-member-a"),
  classMultiA: id("class-multi-a"),
  classMultiB: id("class-multi-b"),
  studentA: id("student-a"),
  studentB: id("student-b"),
  studentSingle: id("student-single"),
  slotA: id("slot-a"),
  slotB: id("slot-b"),
  logA: id("log-a"),
  logB: id("log-b"),
} as const;

interface Fixture {
  seedTeacherId: string | null;
}

let fx: Fixture;

async function clearFixtures() {
  await prisma.timetableSlot.deleteMany({
    where: { teacher: { email: { startsWith: PREFIX } } },
  });
  await prisma.dailyLog.deleteMany({
    where: { institutionId: { in: [ids.instA, ids.instB] } },
  });
  await prisma.enrollment.deleteMany({
    where: { institutionId: { in: [ids.instA, ids.instB] } },
  });
  await prisma.schoolClass.deleteMany({
    where: { id: { startsWith: PREFIX } },
  });
  await prisma.staffMember.deleteMany({
    where: { user: { email: { startsWith: PREFIX } } },
  });
  await prisma.institution.deleteMany({
    where: { id: { in: [ids.instA, ids.instB] } },
  });
  await prisma.student.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({
    where: { email: { startsWith: PREFIX } },
  });
}

async function createUser(
  key: keyof typeof ids,
  role: "TEACHER" | "INSTITUTION_TEACHER" | "PARENT",
  label: string
): Promise<void> {
  await prisma.user.create({
    data: {
      id: ids[key],
      fullName: `${PREFIX}${label}`,
      email: `${PREFIX}${label}@sarh.test`,
      passwordHash: "d5-scope-not-a-real-hash",
      role,
      emailVerified: new Date(),
    },
  });
}

/** Resolve a scope that must succeed, or fail the test loudly. */
async function scopeFor(
  userId: string,
  institutionId?: string
): Promise<TeacherScope> {
  const result = await resolveTeacherScope(userId, institutionId);
  assert.equal(
    result.kind,
    "scope",
    `expected a scope, got ${result.kind}${
      result.kind === "denied" ? ` (${result.reason})` : ""
    }`
  );
  if (result.kind !== "scope") throw new Error("unreachable");
  return result.scope;
}

describe("D5 — teacher scope", () => {
  before(async () => {
    await clearFixtures();

    await createUser("ownerA", "INSTITUTION_TEACHER", "owner-a");
    await createUser("ownerB", "INSTITUTION_TEACHER", "owner-b");
    await createUser("teacherMixed", "TEACHER", "teacher-mixed");
    await createUser("teacherSingle", "TEACHER", "teacher-single");
    await createUser("teacherNoMember", "TEACHER", "teacher-no-member");
    await createUser("teacherMulti", "TEACHER", "teacher-multi");
    await createUser("plainParent", "PARENT", "plain-parent");

    await prisma.institution.createMany({
      data: [
        {
          id: ids.instA,
          name: `${PREFIX}مركز-أ`,
          type: "EDUCATIONAL_CENTER",
          address: "عنوان أ",
          zone: "غزة",
          ownerId: ids.ownerA,
        },
        {
          id: ids.instB,
          name: `${PREFIX}مركز-ب`,
          type: "EDUCATIONAL_CENTER",
          address: "عنوان ب",
          zone: "غزة",
          ownerId: ids.ownerB,
        },
      ],
    });

    /**
     * teacher-mixed: ACTIVE at A, INACTIVE at B — the revocation case.
     * teacher-multi: ACTIVE at both — the ambiguous case.
     * teacher-no-member: no StaffMember row at all, yet owns a class.
     */
    await prisma.staffMember.createMany({
      data: [
        {
          userId: ids.teacherMixed,
          institutionId: ids.instA,
          title: "معلمة",
          role: "TEACHER",
          subjects: ["رياضيات"],
          status: "ACTIVE",
        },
        {
          userId: ids.teacherMixed,
          institutionId: ids.instB,
          title: "معلمة سابقة",
          role: "TEACHER",
          subjects: ["علوم"],
          status: "INACTIVE",
        },
        {
          userId: ids.teacherSingle,
          institutionId: ids.instA,
          title: "معلمة",
          role: "TEACHER",
          subjects: ["لغة عربية"],
          status: "ACTIVE",
        },
        {
          userId: ids.teacherMulti,
          institutionId: ids.instA,
          title: "معلمة",
          role: "TEACHER",
          subjects: ["فيزياء"],
          status: "ACTIVE",
        },
        {
          userId: ids.teacherMulti,
          institutionId: ids.instB,
          title: "معلمة",
          role: "TEACHER",
          subjects: ["كيمياء"],
          status: "ACTIVE",
        },
      ],
    });

    await prisma.schoolClass.createMany({
      data: [
        {
          id: ids.classA,
          name: `${PREFIX}صف-أ`,
          subject: `${PREFIX}رياضيات-أ`,
          gradeLevel: "الصف السابع",
          institutionId: ids.instA,
          teacherId: ids.teacherMixed,
        },
        {
          id: ids.classB,
          name: `${PREFIX}صف-ب`,
          subject: `${PREFIX}علوم-ب`,
          gradeLevel: "الصف الثالث",
          institutionId: ids.instB,
          teacherId: ids.teacherMixed,
        },
        {
          id: ids.classSingleA,
          name: `${PREFIX}صف-فردي-أ`,
          subject: `${PREFIX}لغة-عربية-أ`,
          gradeLevel: "الصف الرابع",
          institutionId: ids.instA,
          teacherId: ids.teacherSingle,
        },
        {
          id: ids.classNoMemberA,
          name: `${PREFIX}صف-بلا-عضوية`,
          subject: `${PREFIX}حاسوب-أ`,
          gradeLevel: "الصف الخامس",
          institutionId: ids.instA,
          teacherId: ids.teacherNoMember,
        },
        {
          id: ids.classMultiA,
          name: `${PREFIX}صف-متعدد-أ`,
          subject: `${PREFIX}فيزياء-أ`,
          gradeLevel: "الصف السادس",
          institutionId: ids.instA,
          teacherId: ids.teacherMulti,
        },
        {
          id: ids.classMultiB,
          name: `${PREFIX}صف-متعدد-ب`,
          subject: `${PREFIX}كيمياء-ب`,
          gradeLevel: "الصف السادس",
          institutionId: ids.instB,
          teacherId: ids.teacherMulti,
        },
      ],
    });

    await prisma.student.createMany({
      data: [
        {
          id: ids.studentA,
          fullName: `${PREFIX}طالب-أ`,
          dateOfBirth: new Date("2015-01-01T00:00:00.000Z"),
        },
        {
          id: ids.studentB,
          fullName: `${PREFIX}طالب-ب`,
          dateOfBirth: new Date("2015-01-01T00:00:00.000Z"),
        },
        {
          id: ids.studentSingle,
          fullName: `${PREFIX}طالب-فردي`,
          dateOfBirth: new Date("2015-01-01T00:00:00.000Z"),
        },
      ],
    });

    await prisma.enrollment.createMany({
      data: [
        {
          studentId: ids.studentA,
          institutionId: ids.instA,
          classId: ids.classA,
          gradeLevel: "الصف السابع",
          commissionFee: 0,
          enrollmentStatus: "ACTIVE",
        },
        {
          studentId: ids.studentB,
          institutionId: ids.instB,
          classId: ids.classB,
          gradeLevel: "الصف الثالث",
          commissionFee: 0,
          enrollmentStatus: "ACTIVE",
        },
        {
          studentId: ids.studentSingle,
          institutionId: ids.instA,
          classId: ids.classSingleA,
          gradeLevel: "الصف الرابع",
          commissionFee: 0,
          enrollmentStatus: "ACTIVE",
        },
      ],
    });

    await prisma.timetableSlot.createMany({
      data: [
        {
          id: ids.slotA,
          teacherId: ids.teacherMixed,
          classId: ids.classA,
          weekday: 1,
          startsAt: "08:00",
          endsAt: "08:45",
          subject: `${PREFIX}رياضيات-أ`,
          room: "قاعة أ",
        },
        {
          id: ids.slotB,
          teacherId: ids.teacherMixed,
          classId: ids.classB,
          weekday: 1,
          startsAt: "09:00",
          endsAt: "09:45",
          subject: `${PREFIX}علوم-ب`,
          room: "قاعة ب",
        },
      ],
    });

    const today = new Date();
    await prisma.dailyLog.createMany({
      data: [
        {
          id: ids.logA,
          studentId: ids.studentA,
          institutionId: ids.instA,
          date: today,
          attendance: true,
          activityPhotos: [],
          dayPlan: [],
          homework: [{ title: `${PREFIX}واجب-أ`, subject: "رياضيات", done: false }],
          teacherNote: `${PREFIX}ملاحظة-أ`,
        },
        {
          id: ids.logB,
          studentId: ids.studentB,
          institutionId: ids.instB,
          date: today,
          attendance: true,
          activityPhotos: [],
          dayPlan: [],
          homework: [
            { title: `${PREFIX}واجب-ب١`, subject: "علوم", done: false },
            { title: `${PREFIX}واجب-ب٢`, subject: "علوم", done: true },
          ],
          teacherNote: `${PREFIX}ملاحظة-ب`,
        },
      ],
    });

    // The production condition reviewed earlier: teacher3 holds classes at a
    // centre where their membership is no longer ACTIVE. Probed only if the
    // seeded account is present; never assumed.
    const seedTeacher = await prisma.user.findUnique({
      where: { email: "teacher3@sarh.ps" },
      select: { id: true },
    });
    fx = { seedTeacherId: seedTeacher?.id ?? null };
  });

  after(async () => {
    await clearFixtures();

    const residue = await Promise.all([
      prisma.user.count({ where: { email: { startsWith: PREFIX } } }),
      prisma.institution.count({ where: { id: { startsWith: PREFIX } } }),
      prisma.schoolClass.count({ where: { id: { startsWith: PREFIX } } }),
      prisma.student.count({ where: { id: { startsWith: PREFIX } } }),
      prisma.enrollment.count({
        where: { institutionId: { in: [ids.instA, ids.instB] } },
      }),
      prisma.dailyLog.count({
        where: { institutionId: { in: [ids.instA, ids.instB] } },
      }),
      prisma.timetableSlot.count({
        where: { teacher: { email: { startsWith: PREFIX } } },
      }),
      prisma.staffMember.count({
        where: { user: { email: { startsWith: PREFIX } } },
      }),
    ]);
    assert.deepEqual(
      residue,
      [0, 0, 0, 0, 0, 0, 0, 0],
      "test fixtures were not cleaned up"
    );
  });

  describe("fixture topology (proves the exclusions are real)", () => {
    it("has exactly one ACTIVE and one INACTIVE membership for teacher-mixed", async () => {
      const rows = await prisma.staffMember.findMany({
        where: { userId: ids.teacherMixed },
        select: { institutionId: true, status: true },
        orderBy: { institutionId: "asc" },
      });
      assert.deepEqual(rows, [
        { institutionId: ids.instA, status: "ACTIVE" },
        { institutionId: ids.instB, status: "INACTIVE" },
      ]);
      assert.equal(
        await prisma.schoolClass.count({ where: { id: ids.classB } }),
        1,
        "the out-of-scope class must exist, or the negative tests are vacuous"
      );
    });

    it("gives teacher-multi two ACTIVE memberships and teacher-no-member none", async () => {
      assert.equal(
        await prisma.staffMember.count({
          where: { userId: ids.teacherMulti, role: "TEACHER", status: "ACTIVE" },
        }),
        2
      );
      assert.equal(
        await prisma.staffMember.count({ where: { userId: ids.teacherNoMember } }),
        0
      );
      assert.equal(
        await prisma.schoolClass.count({ where: { id: ids.classNoMemberA } }),
        1
      );
    });
  });

  describe("scope resolution", () => {
    it("creates a scope for the single ACTIVE membership without a selection", async () => {
      const scope = await scopeFor(ids.teacherSingle);
      assert.equal(scope.institutionId, ids.instA);
      assert.equal(scope.userId, ids.teacherSingle);
    });

    it("returns ambiguous — and no scope — for two ACTIVE memberships", async () => {
      const result = await resolveTeacherScope(ids.teacherMulti);
      assert.equal(result.kind, "ambiguous");
      if (result.kind !== "ambiguous") return;
      assert.deepEqual(
        result.institutions.map((row) => row.id).sort(),
        [ids.instA, ids.instB].sort()
      );
    });

    it("accepts an explicit institution the account actively teaches at", async () => {
      const scope = await scopeFor(ids.teacherMulti, ids.instB);
      assert.equal(scope.institutionId, ids.instB);
    });

    it("denies an explicit institution with no ACTIVE membership — no fallback", async () => {
      for (const userId of [ids.teacherMixed, ids.teacherSingle]) {
        const result = await resolveTeacherScope(userId, ids.instB);
        assert.equal(result.kind, "denied");
        assert.equal(
          result.kind === "denied" ? result.reason : null,
          "institution-not-granted"
        );
      }
    });

    it("denies an account with no teaching membership despite User.role = TEACHER", async () => {
      const result = await resolveTeacherScope(ids.teacherNoMember);
      assert.equal(result.kind, "denied");
      assert.equal(
        result.kind === "denied" ? result.reason : null,
        "no-membership"
      );
    });

    it("denies a non-teacher account", async () => {
      const result = await resolveTeacherScope(ids.plainParent);
      assert.equal(result.kind, "denied");
      assert.equal(result.kind === "denied" ? result.reason : null, "not-teacher");
    });

    it("denies an unknown user id", async () => {
      const result = await resolveTeacherScope(
        "00000000-0000-0000-0000-000000000000"
      );
      assert.equal(result.kind, "denied");
      assert.equal(
        result.kind === "denied" ? result.reason : null,
        "unknown-user"
      );
    });
  });

  describe("positive control: a valid scope reads its own centre", () => {
    it("returns the one permitted class and its roster", async () => {
      const scope = await scopeFor(ids.teacherSingle);
      const classes = await loadTeacherClasses(scope);
      assert.deepEqual(
        classes.map((row) => row.name),
        [`${PREFIX}صف-فردي-أ`]
      );

      const roster = await loadClassRoster(scope, ids.classSingleA);
      assert.ok(roster, "a class inside the scope must be readable");
      assert.deepEqual(
        roster.students.map((row) => row.id),
        [ids.studentSingle]
      );
    });
  });

  describe("D5 requirement: reads stay inside the scoped institution", () => {
    it("does not list classes from an institution whose membership lapsed", async () => {
      const names = (await loadTeacherClasses(await scopeFor(ids.teacherMixed, ids.instA))).map(
        (row) => row.name
      );
      assert.ok(names.includes(`${PREFIX}صف-أ`), "the in-scope class should be listed");
      assert.ok(
        !names.includes(`${PREFIX}صف-ب`),
        "leaked a class from the institution where the membership is INACTIVE"
      );
    });

    it("does not open a roster for a class outside the scope", async () => {
      const scope = await scopeFor(ids.teacherMixed, ids.instA);
      // The class is assigned to this teacher, but it belongs to centre B and
      // the scope is centre A. Assignment alone is not authorisation.
      assert.equal(await loadClassRoster(scope, ids.classB), null);
    });

    it("does not build an attendance board from outside the scope", async () => {
      const board = await loadTeacherAttendanceBoard(
        await scopeFor(ids.teacherMixed, ids.instA)
      );
      assert.deepEqual(
        board.map((row) => row.name),
        [`${PREFIX}صف-أ`]
      );
    });

    it("does not count homework from outside the scope", async () => {
      const workload = await loadTeacherWorkload(
        await scopeFor(ids.teacherMixed, ids.instA)
      );
      // One homework entry in A; two more exist in B and must not be counted.
      assert.equal(workload.total, 1);
      assert.equal(workload.graded, 0);
    });

    it("does not render timetable slots from outside the scope", async () => {
      const slots = await loadTeacherTimetable(
        await scopeFor(ids.teacherMixed, ids.instA),
        1
      );
      const subjects = slots.map((slot) => slot.subject);
      assert.ok(subjects.includes(`${PREFIX}رياضيات-أ`));
      assert.ok(!subjects.includes(`${PREFIX}علوم-ب`));
    });

    it("counts only in-scope students on the overview", async () => {
      const overview = await loadTeacherOverview(
        await scopeFor(ids.teacherMixed, ids.instA)
      );
      assert.equal(overview.studentCount, 1);
    });

    it("keeps the studio payload inside one institution (no classes[0] fallback)", async () => {
      const scope = await scopeFor(ids.teacherMixed, ids.instA);
      const studio = await loadTeacherStudio(scope);

      assert.equal(studio.institutionId, ids.instA);

      const enrolled = await prisma.enrollment.findMany({
        where: { studentId: { in: studio.roster.map((row) => row.id) } },
        select: { studentId: true, institutionId: true },
      });
      const institutionsByStudent = new Map(
        enrolled.map((row) => [row.studentId, row.institutionId])
      );

      for (const student of studio.roster) {
        assert.equal(
          institutionsByStudent.get(student.id),
          studio.institutionId,
          `studio returned student ${student.id} from another institution`
        );
      }
      assert.deepEqual(studio.subjects.sort(), [`${PREFIX}رياضيات-أ`]);
    });

    it("groups assignments by one institution only", async () => {
      const assignments = await loadTeacherAssignments(
        await scopeFor(ids.teacherMixed, ids.instA)
      );
      assert.deepEqual(
        assignments.map((row) => row.subject).sort(),
        [`${PREFIX}رياضيات-أ`]
      );
    });

    it("reproduces the seeded teacher3 / lapsed-centre condition", async (t) => {
      if (!fx.seedTeacherId) {
        t.skip("seeded teacher3@sarh.ps is not present in this database");
        return;
      }

      const lapsed = await prisma.staffMember.findMany({
        where: { userId: fx.seedTeacherId, status: { not: "ACTIVE" } },
        select: { institutionId: true },
      });
      if (lapsed.length === 0) {
        t.skip("teacher3 has no non-ACTIVE membership in this database");
        return;
      }

      const lapsedIds = lapsed.map((row) => row.institutionId);
      const exposed = await prisma.schoolClass.findMany({
        where: { teacherId: fx.seedTeacherId, institutionId: { in: lapsedIds } },
        select: { name: true },
      });
      if (exposed.length === 0) {
        t.skip("teacher3 has no classes at a lapsed institution here");
        return;
      }

      // 1. The lapsed centre cannot be selected at all.
      for (const institutionId of lapsedIds) {
        const result = await resolveTeacherScope(fx.seedTeacherId, institutionId);
        assert.equal(
          result.kind,
          "denied",
          "a lapsed institution was accepted as a teacher scope"
        );
      }

      // 2. No ACTIVE scope exposes a class from a lapsed centre.
      const active = await prisma.staffMember.findMany({
        where: { userId: fx.seedTeacherId, status: "ACTIVE", role: "TEACHER" },
        select: { institutionId: true },
      });
      const exposedNames = new Set(exposed.map((row) => row.name));
      for (const membership of active) {
        const scope = await scopeFor(fx.seedTeacherId, membership.institutionId);
        const leaked = (await loadTeacherClasses(scope))
          .map((row) => row.name)
          .filter((name) => exposedNames.has(name));
        assert.deepEqual(
          leaked,
          [],
          `seeded teacher read lapsed-centre classes: ${leaked.join(", ")}`
        );
      }
    });
  });
});
