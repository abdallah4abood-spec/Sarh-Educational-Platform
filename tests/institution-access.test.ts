import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import bcrypt from "bcryptjs";

import { authOptions } from "@/lib/auth";
import {
  loadInstitutionCommissions,
  loadInstitutionHeader,
  loadInstitutionProfile,
  loadInstitutionStaff,
} from "@/lib/db/institution";
import {
  InstitutionAccessDeniedError,
  hasCapability,
  listInstitutionAccess,
  portalTierForStaffRole,
  resolveInstitutionAccess,
  userHasInstitutionPortalGrant,
} from "@/lib/institution-access";
import { prisma } from "@/lib/prisma";

/**
 * Phase 1 — institution portal isolation.
 *
 * The tests exercise the same server-side resolver the `/institution/**`
 * pages call before any loader. Every grant is written to the database first,
 * so the assertions describe real tenancy rather than a mocked session:
 *
 *   • an owner reaches their centre at OWNER level, even when their own staff
 *     row is `STAFF`;
 *   • an active `CENTER_ADMIN` membership reaches it at CENTER_ADMIN level,
 *     never OWNER, and never receives commission/financial reads;
 *   • a teacher, secretary or on-leave/inactive member gets no admin grant;
 *   • `title` is display text only: a `CENTER_ADMIN` whose title says teacher
 *     still administers, and a teacher whose title says manager does not;
 *   • a global `INSTITUTION_TEACHER` role with no ownership/membership grants
 *     nothing;
 *   • a multi-centre owner gets a deterministic default and can select a
 *     second owned centre explicitly, but a foreign id resolves to `null`
 *     instead of falling back to one of their own.
 *
 * Fixtures use the `p1-test-` prefix, are created in `before`, and are deleted
 * by prefix in `after`. The suite refuses to write when
 * `NODE_ENV=production`. Requires `DATABASE_URL` and a reachable database,
 * exactly like the other integration suites.
 */

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "institution-access tests write fixtures; refusing to run with NODE_ENV=production"
  );
}

const PREFIX = "p1-test-";
const TEST_PASSWORD = "P1-Test-Password!";

interface Fixture {
  instA: string;
  instB: string;
  instC: string;
  instD: string;
  ownerA: string;
  ownerB: string;
  multiOwner: string;
  teacher: string;
  secretary: string;
  onLeaveManager: string;
  inactiveManager: string;
  manager: string;
  roleOnly: string;
  roleOnlyManager: string;
  titleOnlyManager: string;
}

let fx: Fixture;

async function createUser(
  label: string,
  role: "PARENT" | "TEACHER" | "INSTITUTION_TEACHER"
): Promise<string> {
  const user = await prisma.user.create({
    data: {
      fullName: `${PREFIX}${label}`,
      email: `${PREFIX}${label}@sarh.test`,
      passwordHash: "p1-test-not-a-real-hash",
      role,
      emailVerified: new Date(),
    },
    select: { id: true },
  });
  return user.id;
}

before(async () => {
  const ownerA = await createUser("owner-a", "INSTITUTION_TEACHER");
  const ownerB = await createUser("owner-b", "INSTITUTION_TEACHER");
  const multiOwner = await createUser("owner-multi", "INSTITUTION_TEACHER");
  const parent = await createUser("parent", "PARENT");

  const instA = await prisma.institution.create({
    data: {
      name: `${PREFIX}centre-a`,
      type: "EDUCATIONAL_CENTER",
      address: "عنوان اختبار أ",
      zone: "غزة",
      ownerId: ownerA,
    },
    select: { id: true },
  });
  const instB = await prisma.institution.create({
    data: {
      name: `${PREFIX}centre-b`,
      type: "KINDERGARTEN",
      address: "عنوان اختبار ب",
      zone: "رفح",
      ownerId: ownerB,
    },
    select: { id: true },
  });

  /*
   * Explicit timestamps make the "oldest owned centre is the default" rule
   * deterministic even when both rows are inserted in the same millisecond.
   * They are set in the future so these fixtures can never become the first
   * two institutions picked by the supervisor suite (`orderBy createdAt asc`),
   * which would then lose its tenant mid-run when this file cleans up.
   */
  const instC = await prisma.institution.create({
    data: {
      name: `${PREFIX}centre-c`,
      type: "EDUCATIONAL_CENTER",
      address: "عنوان اختبار ج",
      zone: "خان يونس",
      ownerId: multiOwner,
      createdAt: new Date("2099-01-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  const instD = await prisma.institution.create({
    data: {
      name: `${PREFIX}centre-d`,
      type: "KINDERGARTEN",
      address: "عنوان اختبار د",
      zone: "دير البلح",
      ownerId: multiOwner,
      createdAt: new Date("2099-02-01T00:00:00.000Z"),
    },
    select: { id: true },
  });

  const teacher = await createUser("teacher", "TEACHER");
  const secretary = await createUser("secretary", "INSTITUTION_TEACHER");
  const onLeaveManager = await createUser("manager-on-leave", "INSTITUTION_TEACHER");
  const inactiveManager = await createUser("manager-inactive", "INSTITUTION_TEACHER");
  const manager = await createUser("manager-active", "INSTITUTION_TEACHER");
  const roleOnly = await createUser("role-only", "INSTITUTION_TEACHER");
  // This account is a teacher globally; its CENTER_ADMIN membership is what
  // must project the institution portal tier at sign-in.
  const roleOnlyManager = await createUser("role-only-manager", "TEACHER");
  const titleOnlyManager = await createUser("title-only-manager", "INSTITUTION_TEACHER");
  const testPasswordHash = await bcrypt.hash(TEST_PASSWORD, 4);
  await prisma.user.updateMany({
    where: { id: { in: [roleOnlyManager, teacher] } },
    data: { passwordHash: testPasswordHash },
  });

  await prisma.staffMember.createMany({
    data: [
      {
        userId: teacher,
        institutionId: instA.id,
        title: "معلمة رياضيات",
        role: "TEACHER",
        subjects: ["رياضيات"],
        status: "ACTIVE",
      },
      {
        userId: secretary,
        institutionId: instA.id,
        title: "سكرتيرة",
        role: "SECRETARY",
        subjects: [],
        status: "ACTIVE",
      },
      {
        userId: onLeaveManager,
        institutionId: instA.id,
        title: "مدير المركز",
        role: "CENTER_ADMIN",
        subjects: [],
        status: "ON_LEAVE",
      },
      {
        userId: inactiveManager,
        institutionId: instA.id,
        title: "مدير المركز",
        role: "CENTER_ADMIN",
        subjects: [],
        status: "INACTIVE",
      },
      {
        userId: manager,
        institutionId: instA.id,
        title: "مديرة المركز",
        role: "CENTER_ADMIN",
        subjects: [],
        status: "ACTIVE",
      },
      // The owner's own membership is intentionally unclassified: ownership
      // must remain independent of, and stronger than, a staff row.
      {
        userId: ownerA,
        institutionId: instA.id,
        title: "مالك المركز",
        role: "STAFF",
        subjects: [],
        status: "ACTIVE",
      },
      // Role and title deliberately disagree in the next two fixtures.
      {
        userId: roleOnlyManager,
        institutionId: instA.id,
        title: "معلمة رياضيات",
        role: "CENTER_ADMIN",
        subjects: ["رياضيات"],
        status: "ACTIVE",
      },
      {
        userId: titleOnlyManager,
        institutionId: instA.id,
        title: "مدير المركز",
        role: "TEACHER",
        subjects: ["رياضيات"],
        status: "ACTIVE",
      },
    ],
  });

  const studentA = await prisma.student.create({
    data: {
      fullName: `${PREFIX}student-a`,
      dateOfBirth: new Date("2014-03-01"),
      parentId: parent,
    },
    select: { id: true },
  });
  const studentB = await prisma.student.create({
    data: {
      fullName: `${PREFIX}student-b`,
      dateOfBirth: new Date("2019-06-01"),
      parentId: parent,
    },
    select: { id: true },
  });

  await prisma.enrollment.createMany({
    data: [
      {
        studentId: studentA.id,
        institutionId: instA.id,
        gradeLevel: "الصف السابع",
        commissionFee: 120,
        status: "PENDING",
      },
      {
        studentId: studentB.id,
        institutionId: instB.id,
        gradeLevel: "تمهيدي",
        commissionFee: 90,
        status: "VERIFIED",
      },
    ],
  });

  fx = {
    instA: instA.id,
    instB: instB.id,
    instC: instC.id,
    instD: instD.id,
    ownerA,
    ownerB,
    multiOwner,
    teacher,
    secretary,
    onLeaveManager,
    inactiveManager,
    manager,
    roleOnly,
    roleOnlyManager,
    titleOnlyManager,
  };
});

after(async () => {
  await prisma.enrollment.deleteMany({
    where: { institution: { name: { startsWith: PREFIX } } },
  });
  await prisma.student.deleteMany({
    where: { parent: { email: { startsWith: PREFIX } } },
  });
  await prisma.staffMember.deleteMany({
    where: { institution: { name: { startsWith: PREFIX } } },
  });
  await prisma.institution.deleteMany({
    where: { name: { startsWith: PREFIX } },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });

  const residue = await Promise.all([
    prisma.user.count({ where: { email: { startsWith: PREFIX } } }),
    prisma.institution.count({ where: { name: { startsWith: PREFIX } } }),
    prisma.staffMember.count({
      where: { institution: { name: { startsWith: PREFIX } } },
    }),
    prisma.student.count({
      where: { parent: { email: { startsWith: PREFIX } } },
    }),
  ]);
  assert.deepEqual(
    residue,
    [0, 0, 0, 0],
    "test fixtures were not cleaned up (users, institutions, staff, students)"
  );
});

describe("owner access", () => {
  it("resolves the owner's own centre at OWNER level", async () => {
    const access = await resolveInstitutionAccess(fx.ownerA);
    assert.ok(access);
    assert.equal(access.institutionId, fx.instA);
    assert.equal(access.level, "OWNER");
    assert.equal(access.staffMemberId, null);
    assert.equal(hasCapability(access, "commissions.read"), true);
    assert.equal(hasCapability(access, "ai_studio.use"), true);
  });

  it("lets the owner load that centre's header and staff", async () => {
    const access = await resolveInstitutionAccess(fx.ownerA);
    assert.ok(access);

    const header = await loadInstitutionHeader(access);
    assert.equal(header?.name, `${PREFIX}centre-a`);

    const staff = await loadInstitutionStaff(access);
    const names = staff.map((row) => row.name).sort();
    assert.deepEqual(names, [
      `${PREFIX}manager-active`,
      `${PREFIX}manager-inactive`,
      `${PREFIX}manager-on-leave`,
      `${PREFIX}owner-a`,
      `${PREFIX}role-only-manager`,
      `${PREFIX}secretary`,
      `${PREFIX}teacher`,
      `${PREFIX}title-only-manager`,
    ]);

    // The staff screen keeps using `title` as its visible label; the
    // authorisation role is not what gets displayed.
    const roleOnlyRow = staff.find(
      (row) => row.name === `${PREFIX}role-only-manager`
    );
    assert.equal(roleOnlyRow?.role, "معلمة رياضيات");
  });

  it("returns only the owner's own referral rows", async () => {
    const accessA = await resolveInstitutionAccess(fx.ownerA);
    const accessB = await resolveInstitutionAccess(fx.ownerB);
    assert.ok(accessA && accessB);

    const rowsA = await loadInstitutionCommissions(accessA, 100);
    const rowsB = await loadInstitutionCommissions(accessB, 100);

    assert.deepEqual(
      rowsA.map((row) => row.studentName),
      [`${PREFIX}student-a`]
    );
    assert.deepEqual(
      rowsB.map((row) => row.studentName),
      [`${PREFIX}student-b`]
    );

    // Prove the excluded row exists, so the isolation is not an empty query.
    assert.equal(
      await prisma.enrollment.count({
        where: { institutionId: fx.instB },
      }),
      1
    );
  });
});

describe("membership is not an administration grant", () => {
  it("denies an active teacher", async () => {
    assert.equal(await resolveInstitutionAccess(fx.teacher), null);
  });

  it("denies an active secretary", async () => {
    assert.equal(await resolveInstitutionAccess(fx.secretary), null);
  });

  it("denies an on-leave manager", async () => {
    assert.equal(await resolveInstitutionAccess(fx.onLeaveManager), null);
  });

  it("denies an inactive manager", async () => {
    assert.equal(await resolveInstitutionAccess(fx.inactiveManager), null);
  });

  it("grants an active CENTER_ADMIN CENTER_ADMIN, never OWNER", async () => {
    const access = await resolveInstitutionAccess(fx.manager);
    assert.ok(access);
    assert.equal(access.institutionId, fx.instA);
    assert.equal(access.level, "CENTER_ADMIN");
    assert.equal(typeof access.staffMemberId, "string");
    assert.equal(hasCapability(access, "staff.read"), true);
    assert.equal(hasCapability(access, "commissions.read"), false);
  });

  it("grants by role even when the title says teacher", async () => {
    const access = await resolveInstitutionAccess(fx.roleOnlyManager);
    assert.ok(access, "CENTER_ADMIN must not depend on a manager-sounding title");
    assert.equal(access.institutionId, fx.instA);
    assert.equal(access.level, "CENTER_ADMIN");
  });

  it("projects the portal tier from ownership or an active CENTER_ADMIN row", async () => {
    assert.equal(await userHasInstitutionPortalGrant(fx.ownerA), true);
    assert.equal(await userHasInstitutionPortalGrant(fx.manager), true);
    assert.equal(await userHasInstitutionPortalGrant(fx.roleOnlyManager), true);
    assert.equal(await userHasInstitutionPortalGrant(fx.teacher), false);
    assert.equal(await userHasInstitutionPortalGrant(fx.secretary), false);
    assert.equal(await userHasInstitutionPortalGrant(fx.titleOnlyManager), false);
  });

  it("adds the institution tier at credentials sign-in, without changing the primary role", async () => {
    const provider = authOptions.providers.find(
      (candidate) => candidate.id === "credentials"
    ) as unknown as {
      options?: {
        authorize?: (
          credentials: { identifier: string; password: string },
          request: unknown
        ) => Promise<{ role: string; roles: string[] } | null>;
      };
    };
    assert.equal(typeof provider.options?.authorize, "function");

    const result = await provider.options!.authorize!(
      {
        identifier: `${PREFIX}role-only-manager@sarh.test`,
        password: TEST_PASSWORD,
      },
      {}
    );

    assert.ok(result, "the test account should sign in");
    assert.equal(result.role, "TEACHER");
    assert.deepEqual(result.roles, ["TEACHER", "INSTITUTION_TEACHER"]);

    const teacherResult = await provider.options!.authorize!(
      { identifier: `${PREFIX}teacher@sarh.test`, password: TEST_PASSWORD },
      {}
    );
    assert.ok(teacherResult, "the teacher fixture should sign in");
    assert.deepEqual(
      teacherResult.roles,
      ["TEACHER"],
      "a plain TEACHER membership must not receive the institution tier"
    );
  });

  it("revokes both the data grant and the portal projection on role change", async () => {
    const before = await resolveInstitutionAccess(fx.manager);
    assert.ok(before?.staffMemberId, "the fixture manager must start with a membership");

    await prisma.staffMember.update({
      where: { id: before.staffMemberId },
      data: { role: "TEACHER" },
    });

    try {
      assert.equal(await resolveInstitutionAccess(fx.manager), null);
      assert.equal(await userHasInstitutionPortalGrant(fx.manager), false);
    } finally {
      await prisma.staffMember.updateMany({
        where: { userId: fx.manager, institutionId: fx.instA },
        data: { role: "CENTER_ADMIN" },
      });
    }
  });

  it("ignores a manager-sounding title on a teacher membership", async () => {
    assert.equal(await resolveInstitutionAccess(fx.titleOnlyManager), null);
    assert.deepEqual(await listInstitutionAccess(fx.titleOnlyManager), []);
  });

  it("denies the portal role without ownership or membership", async () => {
    assert.equal(await resolveInstitutionAccess(fx.roleOnly), null);
    assert.deepEqual(await listInstitutionAccess(fx.roleOnly), []);
  });
});

describe("financial data is owner-only", () => {
  it("refuses commissions for a CENTER_ADMIN", async () => {
    const access = await resolveInstitutionAccess(fx.manager);
    assert.ok(access);

    await assert.rejects(
      () => loadInstitutionCommissions(access, 100),
      (error) =>
        error instanceof InstitutionAccessDeniedError &&
        error.capability === "commissions.read"
    );
  });

  it("redacts finance-derived profile figures instead of loading them", async () => {
    const ownerAccess = await resolveInstitutionAccess(fx.ownerA);
    const managerAccess = await resolveInstitutionAccess(fx.manager);
    assert.ok(ownerAccess && managerAccess);

    const ownerProfile = await loadInstitutionProfile(ownerAccess);
    const managerProfile = await loadInstitutionProfile(managerAccess);
    assert.ok(ownerProfile && managerProfile);

    assert.equal(typeof ownerProfile.reviews, "number");
    assert.equal(typeof ownerProfile.occupancy, "number");
    assert.equal(managerProfile.reviews, null);
    assert.equal(managerProfile.occupancy, null);
  });
});

describe("membership role to portal tier projection", () => {
  it("projects only CENTER_ADMIN onto INSTITUTION_TEACHER", () => {
    assert.equal(portalTierForStaffRole("CENTER_ADMIN"), "INSTITUTION_TEACHER");
    assert.equal(portalTierForStaffRole("SECRETARY"), null);
    assert.equal(portalTierForStaffRole("TEACHER"), null);
    assert.equal(portalTierForStaffRole("SUPERVISOR"), null);
    assert.equal(portalTierForStaffRole("STAFF"), null);
  });
});

describe("cross-tenant request ids", () => {
  it("refuses another owner's centre instead of falling back", async () => {
    assert.equal(
      await resolveInstitutionAccess(fx.ownerB, fx.instA),
      null,
      "an edited ?institution= id must not read another tenant"
    );

    // The same id is valid for its real owner, so the refusal above is a
    // permission decision rather than a missing row.
    const ownB = await resolveInstitutionAccess(fx.ownerB, fx.instB);
    assert.ok(ownB);
    assert.equal(ownB.institutionId, fx.instB);
  });

  it("refuses an unknown institution id", async () => {
    assert.equal(
      await resolveInstitutionAccess(
        fx.ownerA,
        "00000000-0000-0000-0000-000000000000"
      ),
      null
    );
  });

  it("gives a multi-centre owner a deterministic default and an explicit switch", async () => {
    const list = await listInstitutionAccess(fx.multiOwner);
    assert.deepEqual(
      list.map((entry) => entry.institutionId),
      [fx.instC, fx.instD],
      "owned centres must be ordered oldest first"
    );

    const fallback = await resolveInstitutionAccess(fx.multiOwner);
    assert.equal(fallback?.institutionId, fx.instC);

    const selected = await resolveInstitutionAccess(fx.multiOwner, fx.instD);
    assert.equal(selected?.institutionId, fx.instD);

    assert.equal(
      await resolveInstitutionAccess(fx.multiOwner, fx.instA),
      null,
      "a centre owned by someone else is never selectable"
    );
  });
});
