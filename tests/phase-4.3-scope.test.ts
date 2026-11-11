import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { revokeGuardianGrantResponse } from "@/app/api/institution/guardians/grants/[id]/revoke/handler";
import {
  loadChildLogs,
  loadChildrenOverview,
  loadFeedChildren,
  loadParentDashboard,
} from "@/lib/db/parent";
import { resolveGuardianAccess } from "@/lib/guardian-access";
import {
  parentChatSchema,
  parentChatUpstreamBody,
} from "@/lib/parent-chat";
import { prisma } from "@/lib/prisma";

/**
 * Phase 4.3 — parent read isolation.
 *
 * One child is enrolled at A and B; a second linked child has no grant at all.
 * The suite walks the lifecycle with no grants → A only → A+B → revoke A and
 * proves, at every step, exactly which announcements, logs and subject rows a
 * parent may read. It also pins the AI payload contract: identity fields never
 * leave the app.
 */

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "phase 4.3 scope tests write fixtures; refusing to run with NODE_ENV=production"
  );
}

const PREFIX = "p43-scope-";
const id = (name: string) => `${PREFIX}${name}`;

const ids = {
  ownerA: id("owner-a"),
  ownerB: id("owner-b"),
  parent: id("parent"),
  instA: id("inst-a"),
  instB: id("inst-b"),
  child: id("child"),
  childNoGrant: id("child-no-grant"),
  linkChild: id("link-child"),
  linkChildNoGrant: id("link-child-no-grant"),
  grantA: id("grant-a"),
  grantB: id("grant-b"),
  publicAnnouncement: id("ann-public"),
  announcementA: id("ann-a"),
  announcementB: id("ann-b"),
  logA: id("log-a"),
  logB: id("log-b"),
  perfA: id("perf-a"),
  perfB: id("perf-b"),
  perfNoGrant: id("perf-no-grant"),
} as const;

async function clearFixtures() {
  await prisma.studentGuardianGrant.deleteMany({
    where: {
      OR: [
        { id: { startsWith: PREFIX } },
        { link: { studentId: { startsWith: PREFIX } } },
      ],
    },
  });
  await prisma.studentGuardian.deleteMany({
    where: { studentId: { startsWith: PREFIX } },
  });
  await prisma.subjectPerformance.deleteMany({
    where: { studentId: { startsWith: PREFIX } },
  });
  await prisma.dailyLog.deleteMany({
    where: { studentId: { startsWith: PREFIX } },
  });
  await prisma.announcement.deleteMany({
    where: { id: { startsWith: PREFIX } },
  });
  await prisma.enrollment.deleteMany({
    where: { institutionId: { in: [ids.instA, ids.instB] } },
  });
  await prisma.student.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.institution.deleteMany({
    where: { id: { in: [ids.instA, ids.instB] } },
  });
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

function announcementTitles(
  announcements: { id: string; title: string }[]
): string[] {
  // Other suites/seed data may add public notices; this suite asserts only
  // the rows it created.
  return announcements
    .filter((row) => row.id.startsWith(PREFIX))
    .map((row) => row.title)
    .sort();
}

async function accessOrFail() {
  const result = await resolveGuardianAccess(ids.parent);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("parent access denied");
  return result.access;
}

describe("phase 4.3 — institution-scoped parent reads and announcements", () => {
  before(async () => {
    await clearFixtures();

    const baseUser = {
      passwordHash: "unused-in-this-suite",
      emailVerified: new Date(),
      termsAcceptedAt: new Date(),
    };

    await prisma.user.createMany({
      data: [
        {
          ...baseUser,
          id: ids.ownerA,
          email: "p43-owner-a@test.local",
          fullName: "مالك أ",
          role: "INSTITUTION_TEACHER",
        },
        {
          ...baseUser,
          id: ids.ownerB,
          email: "p43-owner-b@test.local",
          fullName: "مالك ب",
          role: "INSTITUTION_TEACHER",
        },
        {
          ...baseUser,
          id: ids.parent,
          email: "p43-parent@test.local",
          fullName: "ولي أمر",
          role: "PARENT",
        },
      ],
    });

    await prisma.institution.createMany({
      data: [
        {
          id: ids.instA,
          name: "مركز أ",
          type: "EDUCATIONAL_CENTER",
          address: "عنوان أ",
          zone: "غزة",
          ownerId: ids.ownerA,
        },
        {
          id: ids.instB,
          name: "مركز ب",
          type: "EDUCATIONAL_CENTER",
          address: "عنوان ب",
          zone: "غزة",
          ownerId: ids.ownerB,
        },
      ],
    });

    const birth = new Date("2015-01-01T00:00:00.000Z");
    await prisma.student.createMany({
      data: [
        { id: ids.child, fullName: "طفل مشترك", dateOfBirth: birth },
        { id: ids.childNoGrant, fullName: "طفل بلا منحة", dateOfBirth: birth },
      ],
    });

    await prisma.enrollment.createMany({
      data: [
        {
          studentId: ids.child,
          institutionId: ids.instA,
          gradeLevel: "الصف الرابع",
          commissionFee: 0,
        },
        {
          studentId: ids.child,
          institutionId: ids.instB,
          gradeLevel: "الصف الرابع",
          commissionFee: 0,
        },
        {
          studentId: ids.childNoGrant,
          institutionId: ids.instA,
          gradeLevel: "الصف الرابع",
          commissionFee: 0,
        },
      ],
    });

    await prisma.studentGuardian.createMany({
      data: [
        {
          id: ids.linkChild,
          studentId: ids.child,
          userId: ids.parent,
          status: "APPROVED",
          isPrimary: true,
          approvedAt: new Date(),
        },
        {
          id: ids.linkChildNoGrant,
          studentId: ids.childNoGrant,
          userId: ids.parent,
          status: "APPROVED",
          isPrimary: false,
          approvedAt: new Date(),
        },
      ],
    });

    const now = Date.now();
    await prisma.announcement.createMany({
      data: [
        {
          id: ids.publicAnnouncement,
          kind: "HOLIDAY",
          title: "إعلان عام",
          body: "لكل المنصة",
          institutionId: null,
          publishedAt: new Date(now - 3_000),
        },
        {
          id: ids.announcementA,
          kind: "SCHEDULE",
          title: "إعلان أ",
          body: "خاص بمركز أ",
          institutionId: ids.instA,
          publishedAt: new Date(now - 2_000),
        },
        {
          id: ids.announcementB,
          kind: "MEETING",
          title: "إعلان ب",
          body: "خاص بمركز ب",
          institutionId: ids.instB,
          publishedAt: new Date(now - 1_000),
        },
      ],
    });

    await prisma.dailyLog.createMany({
      data: [
        {
          id: ids.logA,
          studentId: ids.child,
          institutionId: ids.instA,
          date: new Date(now - 24 * 60 * 60 * 1000),
          attendance: true,
          activityPhotos: [],
          dayPlan: ["برنامج أ"],
        },
        {
          id: ids.logB,
          studentId: ids.child,
          institutionId: ids.instB,
          date: new Date(now - 2 * 24 * 60 * 60 * 1000),
          attendance: true,
          activityPhotos: [],
          dayPlan: ["برنامج ب"],
        },
        {
          id: id("log-no-grant"),
          studentId: ids.childNoGrant,
          institutionId: ids.instA,
          date: new Date(now - 3 * 24 * 60 * 60 * 1000),
          attendance: true,
          activityPhotos: [],
          dayPlan: ["برنامج لا يجب أن يُقرأ"],
        },
      ],
    });

    await prisma.subjectPerformance.createMany({
      data: [
        {
          id: ids.perfA,
          institutionId: ids.instA,
          studentId: ids.child,
          subject: "رياضيات",
          term: "الفصل الأول",
          score: 80,
          classAverage: 75,
        },
        {
          id: ids.perfB,
          institutionId: ids.instB,
          studentId: ids.child,
          subject: "علوم",
          term: "الفصل الأول",
          score: 90,
          classAverage: 80,
        },
        {
          id: ids.perfNoGrant,
          institutionId: ids.instA,
          studentId: ids.childNoGrant,
          subject: "لغة عربية",
          term: "الفصل الأول",
          score: 99,
          classAverage: 70,
        },
      ],
    });
  });

  after(async () => {
    await clearFixtures();
    await prisma.$disconnect();
  });

  it("with no grants: public announcements only, no institutional reads", async () => {
    const access = await accessOrFail();
    assert.deepEqual(access.grants, []);
    assert.deepEqual(access.studentIds, []);
    assert.deepEqual(
      [...access.linkedStudentIds].sort(),
      [ids.child, ids.childNoGrant].sort(),
      "a family link alone is identity, not access"
    );

    const dashboard = await loadParentDashboard(access);
    assert.deepEqual(announcementTitles(dashboard.announcements), ["إعلان عام"]);
    assert.deepEqual(dashboard.performance, []);
    assert.equal(dashboard.pendingHomework, 0);
    assert.equal(dashboard.todayDayPlan.length, 0);

    const children = await loadFeedChildren(access);
    assert.equal(children.length, 2);
    assert.ok(children.every((child) => child.institutionId === ""));
    assert.ok(children.every((child) => child.institutionName === "غير مسجل"));

    const overview = await loadChildrenOverview(access);
    assert.equal(overview.length, 2);
    assert.ok(overview.every((card) => card.performance.length === 0));
    assert.ok(overview.every((card) => card.logsCount === 0));

    assert.equal((await loadChildLogs(access, ids.child)).size, 0);
    assert.equal((await loadChildLogs(access, ids.childNoGrant)).size, 0);
  });

  it("grant A exposes only A's announcement, log and subject row", async () => {
    await prisma.studentGuardianGrant.create({
      data: {
        id: ids.grantA,
        linkId: ids.linkChild,
        institutionId: ids.instA,
        status: "APPROVED",
        approvedAt: new Date(),
      },
    });

    const access = await accessOrFail();
    assert.deepEqual(access.grants, [
      { studentId: ids.child, institutionId: ids.instA },
    ]);

    const dashboard = await loadParentDashboard(access);
    assert.deepEqual(announcementTitles(dashboard.announcements), [
      "إعلان أ",
      "إعلان عام",
    ]);
    assert.deepEqual(dashboard.performance, [
      { subject: "رياضيات", percent: 80 },
    ]);

    const logs = await loadChildLogs(access, ids.child);
    assert.deepEqual(
      [...logs.values()].map((log) => log.id),
      [ids.logA]
    );
    assert.equal((await loadChildLogs(access, ids.childNoGrant)).size, 0);

    const overview = await loadChildrenOverview(access);
    const childCard = overview.find((card) => card.child.id === ids.child);
    assert.ok(childCard);
    assert.equal(childCard.child.institutionId, ids.instA);
    assert.deepEqual(childCard.performance, [
      { subject: "رياضيات", percent: 80 },
    ]);
    const noGrantCard = overview.find((card) => card.child.id === ids.childNoGrant);
    assert.ok(noGrantCard);
    assert.equal(noGrantCard.performance.length, 0);
    assert.equal(noGrantCard.logsCount, 0);
    assert.equal(noGrantCard.child.institutionId, "");
  });

  it("grant B adds B without removing A", async () => {
    await prisma.studentGuardianGrant.create({
      data: {
        id: ids.grantB,
        linkId: ids.linkChild,
        institutionId: ids.instB,
        status: "APPROVED",
        approvedAt: new Date(),
      },
    });

    const access = await accessOrFail();
    assert.deepEqual(
      [...access.grants]
        .map((scope) => `${scope.studentId}:${scope.institutionId}`)
        .sort(),
      [`${ids.child}:${ids.instA}`, `${ids.child}:${ids.instB}`].sort()
    );

    const dashboard = await loadParentDashboard(access);
    assert.deepEqual(announcementTitles(dashboard.announcements), [
      "إعلان أ",
      "إعلان ب",
      "إعلان عام",
    ]);
    assert.deepEqual(
      dashboard.performance
        .map((row) => row.subject)
        .sort(),
      ["رياضيات", "علوم"]
    );

    const logs = await loadChildLogs(access, ids.child);
    assert.deepEqual(
      [...logs.values()].map((log) => log.id).sort(),
      [ids.logA, ids.logB].sort()
    );
  });

  it("revoking A stops A instantly and leaves public and B intact", async () => {
    // Centre B cannot revoke A's grant (404), even though it owns the other
    // centre the same child attends.
    const foreign = await revokeGuardianGrantResponse(
      ids.ownerB,
      ids.grantA,
      new Request("http://localhost/api/institution/guardians/grants/x/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ institutionId: ids.instB }),
      })
    );
    assert.equal(foreign.status, 404);

    const response = await revokeGuardianGrantResponse(
      ids.ownerA,
      ids.grantA,
      new Request("http://localhost/api/institution/guardians/grants/x/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ institutionId: ids.instA }),
      })
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      success: boolean;
      grant: { id: string; status: string };
    };
    assert.equal(body.success, true);
    assert.equal(body.grant.id, ids.grantA);
    assert.equal(body.grant.status, "REVOKED");

    const link = await prisma.studentGuardian.findUniqueOrThrow({
      where: { id: ids.linkChild },
      select: { isPrimary: true, status: true },
    });
    assert.equal(link.isPrimary, true, "revocation must not change isPrimary");
    assert.equal(link.status, "APPROVED", "B's grant still approves the link");

    const access = await accessOrFail();
    assert.deepEqual(access.grants, [
      { studentId: ids.child, institutionId: ids.instB },
    ]);

    const dashboard = await loadParentDashboard(access);
    assert.deepEqual(announcementTitles(dashboard.announcements), [
      "إعلان ب",
      "إعلان عام",
    ]);
    assert.deepEqual(dashboard.performance, [{ subject: "علوم", percent: 90 }]);

    const logs = await loadChildLogs(access, ids.child);
    assert.deepEqual(
      [...logs.values()].map((log) => log.id),
      [ids.logB]
    );

    const overview = await loadChildrenOverview(access);
    const childCard = overview.find((card) => card.child.id === ids.child);
    assert.ok(childCard);
    assert.equal(childCard.child.institutionId, ids.instB);
    assert.deepEqual(childCard.performance, [{ subject: "علوم", percent: 90 }]);
  });

  it("the AI upstream body carries no identity, even if the client sends it", () => {
    const parsed = parentChatSchema.parse({
      message: "اشرح الكسور",
      language: "ar",
      history: [{ role: "user", text: "سؤال سابق" }],
      // Unknown keys are stripped by the schema and never forwarded.
      studentName: "طفل مشترك",
      childId: ids.child,
      institutionId: ids.instA,
    });

    const body = parentChatUpstreamBody(parsed);
    assert.deepEqual(Object.keys(body).sort(), [
      "history",
      "language",
      "message",
    ]);
    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes(ids.child), false);
    assert.equal(serialized.includes(ids.instA), false);
    assert.equal(serialized.includes("طفل مشترك"), false);
    assert.equal(serialized.includes("studentName"), false);
    assert.equal(serialized.includes("institutionId"), false);
  });
});
