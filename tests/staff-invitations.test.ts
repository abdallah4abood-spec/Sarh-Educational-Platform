import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { acceptInvitationResponse } from "@/app/api/invitations/accept/handler";
import {
  createAdminInvitationResponse,
  listAdminInvitationsResponse,
} from "@/app/api/admin/institutions/[id]/staff/handler";
import {
  createInvitationResponse,
  listInvitationsResponse,
} from "@/app/api/institution/staff/invitations/handler";
import {
  revokeInvitationResponse,
  resendInvitationResponse,
} from "@/app/api/institution/staff/invitations/[id]/handler";
import {
  acceptStaffInvitation,
  createStaffInvitation,
  institutionInvitationActor,
  listStaffInvitations,
  resendStaffInvitation,
  revokeStaffInvitation,
  StaffInvitationError,
  superAdminInvitationActor,
  type StaffInvitationErrorCode,
} from "@/lib/db/staff-invitations";
import { resolveInstitutionAccess } from "@/lib/institution-access";
import { resetRateLimits } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import {
  hashInvitationToken,
  invitableRoles,
  STAFF_INVITATION_TTL_MS,
} from "@/lib/staff-invitations";

/**
 * Phase 4.4 — staff invitations and the general audit trail.
 *
 * Real PostgreSQL fixtures: an owner and a CENTER_ADMIN of centre A, an owner of
 * centre B, a platform SUPER_ADMIN, and separate invitee accounts (verified,
 * unverified, already a member, inactive member).
 *
 * What is asserted: the role matrix (owner 3 roles, director 2, platform 1);
 * only the token hash is stored; a pending offer cannot be duplicated; resend
 * rotates the token so the old link dies; revoke keeps the row and history;
 * expiry is derived and persisted lazily; acceptance needs a live token, a
 * matching normalised address and a verified email; the role comes from the
 * invitation, never the client; an existing or inactive membership is a 409 and
 * is never replaced; the audit row is written inside the same transaction as
 * the membership; `User.role`/`roles` are untouched; cross-origin writes and
 * cross-institution ids are refused; and D6 forces CENTER_ADMIN.
 */

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "staff invitation tests write fixtures; refusing to run with NODE_ENV=production"
  );
}

// The suite asserts the "provider unavailable" contract (`emailSent: false` +
// fallback path), so it must not reach a real provider. No message is sent from
// a test run, and the result stops depending on the network or on a key.
delete process.env.RESEND_API_KEY;

const PREFIX = "siv-test-";
const id = (name: string) => `${PREFIX}${name}`;

const ids = {
  ownerA: id("owner-a"),
  adminA: id("admin-a"),
  ownerB: id("owner-b"),
  superAdmin: id("super-admin"),
  invitee: id("invitee"),
  inviteeUnverified: id("invitee-unverified"),
  otherParent: id("other-parent"),
  member: id("member"),
  inactiveMember: id("inactive-member"),
  instA: id("inst-a"),
  instB: id("inst-b"),
} as const;

/** Shaped like a real token (43 chars base64url) so validation is exercised. */
const LIVE_MEMBER_TOKEN = "siv-token-live-member-0123456789abcdefghij";
const INACTIVE_MEMBER_TOKEN = "siv-token-inactive-member-0123456789abcde";

const EMAILS = {
  ownerA: "siv-owner-a@test.local",
  adminA: "siv-admin-a@test.local",
  ownerB: "siv-owner-b@test.local",
  superAdmin: "siv-super@test.local",
  invitee: "siv-invitee@test.local",
  inviteeUnverified: "siv-invitee-unverified@test.local",
  otherParent: "siv-other-parent@test.local",
  member: "siv-member@test.local",
  inactiveMember: "siv-inactive@test.local",
} as const;

async function clearFixtures() {
  // Invitation ids are generated uuids, so `entityId` is not prefixed. The rows
  // this suite can have written are still identifiable: by one of its fixture
  // actors, or by one of its two fixture institutions. Nothing else matches.
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityId: { startsWith: PREFIX } },
        { actorId: { startsWith: PREFIX } },
        { institutionId: { in: [ids.instA, ids.instB] } },
      ],
    },
  });
  await prisma.staffInvitation.deleteMany({
    where: { institutionId: { in: [ids.instA, ids.instB] } },
  });
  await prisma.staffMember.deleteMany({
    where: { userId: { startsWith: PREFIX } },
  });
  await prisma.institution.deleteMany({
    where: { id: { in: [ids.instA, ids.instB] } },
  });
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

function expectInvitationError(code: StaffInvitationErrorCode) {
  return (error: unknown) => {
    assert.ok(
      error instanceof StaffInvitationError,
      `expected StaffInvitationError, got ${error}`
    );
    assert.equal(error.code, code);
    return true;
  };
}

async function ownerActor() {
  const access = await resolveInstitutionAccess(ids.ownerA);
  assert.ok(access, "owner A must resolve an institution token");
  return institutionInvitationActor(access);
}

async function adminActor() {
  const access = await resolveInstitutionAccess(ids.adminA);
  assert.ok(access, "CENTER_ADMIN must resolve an institution token");
  return institutionInvitationActor(access);
}

async function staffRows(institutionId: string) {
  return prisma.staffMember.findMany({
    where: { userId: { startsWith: PREFIX }, institutionId },
  });
}

function sameOriginPost(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(body),
  });
}

function foreignOriginPost(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example" },
    body: JSON.stringify(body),
  });
}

describe("staff invitations (4.4)", () => {
  before(async () => {
    await clearFixtures();
    resetRateLimits();

    const base = {
      passwordHash: "unused-in-this-suite",
      emailVerified: new Date(),
      termsAcceptedAt: new Date(),
    };

    await prisma.user.createMany({
      data: [
        { ...base, id: ids.ownerA, email: EMAILS.ownerA, fullName: "مالك أ", role: "INSTITUTION_TEACHER" },
        { ...base, id: ids.adminA, email: EMAILS.adminA, fullName: "مدير أ", role: "INSTITUTION_TEACHER" },
        { ...base, id: ids.ownerB, email: EMAILS.ownerB, fullName: "مالك ب", role: "INSTITUTION_TEACHER" },
        { ...base, id: ids.superAdmin, email: EMAILS.superAdmin, fullName: "إدارة النظام", role: "SUPER_ADMIN" },
        { ...base, id: ids.invitee, email: EMAILS.invitee, fullName: "معلم مدعو", role: "PARENT", roles: [] },
        {
          ...base,
          id: ids.inviteeUnverified,
          email: EMAILS.inviteeUnverified,
          fullName: "مدعو غير موثّق",
          role: "PARENT",
          emailVerified: null,
        },
        { ...base, id: ids.otherParent, email: EMAILS.otherParent, fullName: "حساب آخر", role: "PARENT" },
        { ...base, id: ids.member, email: EMAILS.member, fullName: "عضو قائم", role: "PARENT" },
        { ...base, id: ids.inactiveMember, email: EMAILS.inactiveMember, fullName: "عضو غير نشط", role: "PARENT" },
      ],
    });

    await prisma.institution.createMany({
      data: [
        { id: ids.instA, name: "مركز الدعوات أ", type: "EDUCATIONAL_CENTER", address: "عنوان", zone: "غزة", ownerId: ids.ownerA },
        { id: ids.instB, name: "مركز الدعوات ب", type: "EDUCATIONAL_CENTER", address: "عنوان", zone: "غزة", ownerId: ids.ownerB },
      ],
    });

    await prisma.staffMember.createMany({
      data: [
        { id: id("staff-admin"), userId: ids.adminA, institutionId: ids.instA, title: "مدير", role: "CENTER_ADMIN", status: "ACTIVE" },
        { id: id("staff-member"), userId: ids.member, institutionId: ids.instA, title: "معلم", role: "TEACHER", status: "ACTIVE" },
        { id: id("staff-inactive"), userId: ids.inactiveMember, institutionId: ids.instA, title: "معلم سابق", role: "SECRETARY", status: "INACTIVE" },
      ],
    });
  });

  after(async () => {
    await clearFixtures();
    resetRateLimits();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    resetRateLimits();
  });

  it("matrix: owner 3 roles, director 2 (never another director), platform only CENTER_ADMIN", () => {
    assert.deepEqual(invitableRoles("OWNER"), ["TEACHER", "SECRETARY", "CENTER_ADMIN"]);
    assert.deepEqual(invitableRoles("CENTER_ADMIN"), ["TEACHER", "SECRETARY"]);
    assert.deepEqual(invitableRoles("SUPER_ADMIN"), ["CENTER_ADMIN"]);
    assert.equal(invitableRoles("CENTER_ADMIN").includes("CENTER_ADMIN"), false);
    assert.equal(invitableRoles("SUPER_ADMIN").includes("TEACHER"), false);
  });

  it("stores only the token hash and audits the creation", async () => {
    const actor = await ownerActor();
    const email = "siv-hash-target@test.local";
    const { invitation, token } = await createStaffInvitation(actor, {
      email: "  SIV-Hash-Target@Test.Local ",
      role: "TEACHER",
      subjects: ["رياضيات", "رياضيات", "فيزياء"],
    });

    const row = await prisma.staffInvitation.findUnique({
      where: { id: invitation.id },
    });
    assert.ok(row);
    assert.equal(row.tokenHash, hashInvitationToken(token));
    assert.equal(row.tokenHash.includes(token), false, "token must never be stored in clear");
    assert.equal(row.email, "siv-hash-target@test.local", "email is normalised");
    assert.deepEqual(row.subjects, ["رياضيات", "فيزياء"], "subjects are de-duplicated");
    assert.equal(row.status, "PENDING");
    assert.equal(invitation.roleLabel, "معلم");
    assert.ok(Math.abs(row.expiresAt.getTime() - Date.now() - STAFF_INVITATION_TTL_MS) < 60_000);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: invitation.id, action: "STAFF_INVITATION.CREATED" },
    });
    assert.ok(audit, "creation must leave an audit row");
    assert.equal(audit.institutionId, ids.instA);
    assert.equal(audit.actorId, ids.ownerA);
    assert.equal(JSON.stringify(audit.metadata).includes(token), false);

    await prisma.staffInvitation.delete({ where: { id: invitation.id } });
    await prisma.auditLog.deleteMany({ where: { entityId: invitation.id } });
  });

  it("refuses a director a CENTER_ADMIN invitation and a foreign centre selector", async () => {
    const actor = await adminActor();
    assert.equal(actor.kind, "CENTER_ADMIN");

    await assert.rejects(
      createStaffInvitation(actor, {
        email: "siv-second-admin@test.local",
        role: "CENTER_ADMIN",
      }),
      expectInvitationError("ROLE_NOT_INVITABLE")
    );

    // A CENTER_ADMIN of A has no token for B at all: the selector resolves to
    // null rather than granting the centre named in the URL.
    const foreign = await resolveInstitutionAccess(ids.adminA, ids.instB);
    assert.equal(foreign, null);
  });

  it("refuses a second pending offer and points at resend", async () => {
    const actor = await ownerActor();
    const email = "siv-duplicate@test.local";
    const first = await createStaffInvitation(actor, { email, role: "TEACHER" });

    await assert.rejects(
      createStaffInvitation(actor, { email, role: "TEACHER" }),
      expectInvitationError("INVITATION_PENDING")
    );
    // A different role for the same address is still one live offer per centre.
    await assert.rejects(
      createStaffInvitation(actor, { email, role: "SECRETARY" }),
      expectInvitationError("INVITATION_PENDING")
    );

    const rows = await prisma.staffInvitation.findMany({
      where: { institutionId: ids.instA, email },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, first.invitation.id);

    await prisma.staffInvitation.delete({ where: { id: first.invitation.id } });
  });

  it("resend rotates the token so the previous link dies", async () => {
    const actor = await ownerActor();
    const created = await createStaffInvitation(actor, {
      email: EMAILS.invitee,
      role: "TEACHER",
    });

    const resent = await resendStaffInvitation(actor, created.invitation.id);
    assert.notEqual(resent.token, created.token);

    await assert.rejects(
      acceptStaffInvitation(ids.invitee, created.token),
      expectInvitationError("INVITATION_NOT_FOUND")
    );

    const accepted = await acceptStaffInvitation(ids.invitee, resent.token);
    assert.equal(accepted.institutionId, ids.instA);
    assert.equal(accepted.role, "TEACHER");

    const audit = await prisma.auditLog.findMany({
      where: { entityId: created.invitation.id },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    });
    assert.deepEqual(
      audit.map((row) => row.action),
      ["STAFF_INVITATION.CREATED", "STAFF_INVITATION.RESENT", "STAFF_INVITATION.ACCEPTED"]
    );
  });

  it("acceptance creates the ACTIVE membership from the invitation and leaves User.role alone", async () => {
    const before = await prisma.user.findUnique({
      where: { id: ids.invitee },
      select: { role: true, roles: true },
    });
    assert.deepEqual(before, { role: "PARENT", roles: [] });

    const invitation = await prisma.staffInvitation.findFirst({
      where: { institutionId: ids.instA, email: EMAILS.invitee },
    });
    assert.ok(invitation);
    assert.equal(invitation.status, "ACCEPTED");
    assert.equal(invitation.acceptedById, ids.invitee);

    const membership = await prisma.staffMember.findUnique({
      where: {
        userId_institutionId: { userId: ids.invitee, institutionId: ids.instA },
      },
    });
    assert.ok(membership);
    assert.equal(membership.status, "ACTIVE");
    assert.equal(membership.role, "TEACHER");

    const after = await prisma.user.findUnique({
      where: { id: ids.invitee },
      select: { role: true, roles: true },
    });
    assert.deepEqual(after, { role: "PARENT", roles: [] });

    const accepted = await prisma.auditLog.findFirst({
      where: { entityId: invitation.id, action: "STAFF_INVITATION.ACCEPTED" },
    });
    assert.ok(accepted, "acceptance must be audited");
    assert.equal(accepted.actorId, ids.invitee);
    assert.equal(accepted.institutionId, ids.instA);
  });

  it("revoking keeps the row and history, and a fresh invitation reopens it", async () => {
    const actor = await ownerActor();
    const email = "siv-revoke@test.local";
    const created = await createStaffInvitation(actor, { email, role: "SECRETARY" });

    const revoked = await revokeStaffInvitation(actor, created.invitation.id);
    assert.equal(revoked.status, "REVOKED");
    await assert.rejects(
      acceptStaffInvitation(ids.otherParent, created.token),
      expectInvitationError("INVITATION_REVOKED")
    );

    // Revoking twice is idempotent, not an error.
    const again = await revokeStaffInvitation(actor, created.invitation.id);
    assert.equal(again.status, "REVOKED");

    const reopened = await createStaffInvitation(actor, { email, role: "SECRETARY" });
    assert.equal(reopened.invitation.id, created.invitation.id, "the record is reused");

    const rows = await prisma.staffInvitation.findMany({
      where: { institutionId: ids.instA, email },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "PENDING");

    const actions = await prisma.auditLog.findMany({
      where: { entityId: created.invitation.id },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    });
    assert.deepEqual(
      actions.map((row) => row.action),
      [
        "STAFF_INVITATION.CREATED",
        "STAFF_INVITATION.REVOKED",
        "STAFF_INVITATION.REOPENED",
      ]
    );

    await prisma.staffInvitation.delete({ where: { id: created.invitation.id } });
    await prisma.auditLog.deleteMany({ where: { entityId: created.invitation.id } });
  });

  it("an expired invitation is refused and recorded as EXPIRED", async () => {
    const actor = await ownerActor();
    const created = await createStaffInvitation(actor, {
      email: EMAILS.otherParent,
      role: "TEACHER",
    });

    await prisma.staffInvitation.update({
      where: { id: created.invitation.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    await assert.rejects(
      acceptStaffInvitation(ids.otherParent, created.token),
      expectInvitationError("INVITATION_EXPIRED")
    );

    const row = await prisma.staffInvitation.findUnique({
      where: { id: created.invitation.id },
    });
    assert.equal(row?.status, "EXPIRED");
    assert.equal((await staffRows(ids.instA)).some((m) => m.userId === ids.otherParent), false);

    await prisma.staffInvitation.delete({ where: { id: created.invitation.id } });
    await prisma.auditLog.deleteMany({ where: { entityId: created.invitation.id } });
  });

  it("acceptance requires the matching verified address", async () => {
    const actor = await ownerActor();
    const created = await createStaffInvitation(actor, {
      email: EMAILS.inviteeUnverified,
      role: "TEACHER",
    });

    // Correct address, but the live row is unverified: the JWT is irrelevant.
    await assert.rejects(
      acceptStaffInvitation(ids.inviteeUnverified, created.token),
      expectInvitationError("EMAIL_NOT_VERIFIED")
    );

    // A different, verified account cannot claim it.
    await assert.rejects(
      acceptStaffInvitation(ids.otherParent, created.token),
      expectInvitationError("EMAIL_MISMATCH")
    );

    const row = await prisma.staffInvitation.findUnique({
      where: { id: created.invitation.id },
    });
    assert.equal(row?.status, "PENDING", "a refused accept must not consume the invitation");
    assert.equal(
      (await staffRows(ids.instA)).some((m) => m.userId === ids.inviteeUnverified),
      false
    );
    assert.equal(
      await prisma.auditLog.count({
        where: { entityId: created.invitation.id, action: "STAFF_INVITATION.ACCEPTED" },
      }),
      0
    );

    await prisma.staffInvitation.delete({ where: { id: created.invitation.id } });
    await prisma.auditLog.deleteMany({ where: { entityId: created.invitation.id } });
  });

  it("never replaces an existing or inactive membership", async () => {
    const actor = await ownerActor();

    // Same role, already ACTIVE: nothing to accept.
    const live = await prisma.staffInvitation.create({
      data: {
        institutionId: ids.instA,
        email: EMAILS.member,
        role: "TEACHER",
        title: "معلم",
        subjects: [],
        tokenHash: hashInvitationToken(LIVE_MEMBER_TOKEN),
        invitedById: ids.ownerA,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await assert.rejects(
      acceptStaffInvitation(ids.member, LIVE_MEMBER_TOKEN),
      expectInvitationError("ALREADY_MEMBER")
    );

    // Different role on an INACTIVE row: a 409, never a silent overwrite.
    const inactive = await prisma.staffInvitation.create({
      data: {
        institutionId: ids.instA,
        email: EMAILS.inactiveMember,
        role: "TEACHER",
        title: "معلم",
        subjects: [],
        tokenHash: hashInvitationToken(INACTIVE_MEMBER_TOKEN),
        invitedById: ids.ownerA,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await assert.rejects(
      acceptStaffInvitation(ids.inactiveMember, INACTIVE_MEMBER_TOKEN),
      expectInvitationError("MEMBERSHIP_CONFLICT")
    );

    const membership = await prisma.staffMember.findUnique({
      where: {
        userId_institutionId: { userId: ids.inactiveMember, institutionId: ids.instA },
      },
    });
    assert.equal(membership?.status, "INACTIVE");
    assert.equal(membership?.role, "SECRETARY", "the existing row is untouched");

    assert.equal((await staffRows(ids.instA)).filter((m) => m.userId === ids.member).length, 1);

    await prisma.staffInvitation.deleteMany({
      where: { id: { in: [live.id, inactive.id] } },
    });
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [live.id, inactive.id] } },
    });

    // Creating for an existing member is refused before an invitation exists.
    await assert.rejects(
      createStaffInvitation(actor, { email: EMAILS.member, role: "TEACHER" }),
      expectInvitationError("ALREADY_MEMBER")
    );
    await assert.rejects(
      createStaffInvitation(actor, { email: EMAILS.inactiveMember, role: "TEACHER" }),
      expectInvitationError("MEMBERSHIP_CONFLICT")
    );
  });

  it("an invitation from another centre is a 404 for a manager", async () => {
    const actor = await ownerActor();
    const created = await createStaffInvitation(actor, {
      email: "siv-cross@test.local",
      role: "TEACHER",
    });

    const actorB = superAdminInvitationActor(ids.ownerB, ids.instB);
    await assert.rejects(
      resendStaffInvitation(actorB, created.invitation.id),
      expectInvitationError("INVITATION_NOT_FOUND")
    );
    await assert.rejects(
      revokeStaffInvitation(actorB, created.invitation.id),
      expectInvitationError("INVITATION_NOT_FOUND")
    );

    const row = await prisma.staffInvitation.findUnique({
      where: { id: created.invitation.id },
    });
    assert.equal(row?.status, "PENDING", "a foreign centre must not change it");

    await prisma.staffInvitation.delete({ where: { id: created.invitation.id } });
    await prisma.auditLog.deleteMany({ where: { entityId: created.invitation.id } });
  });

  it("lists only this centre's invitations", async () => {
    const actor = await ownerActor();
    const created = await createStaffInvitation(actor, {
      email: "siv-list@test.local",
      role: "TEACHER",
    });

    const mine = await listStaffInvitations(await adminActor());
    assert.ok(mine.some((row) => row.id === created.invitation.id));

    const theirs = await listStaffInvitations(
      superAdminInvitationActor(ids.ownerB, ids.instB)
    );
    assert.equal(theirs.some((row) => row.id === created.invitation.id), false);

    await prisma.staffInvitation.delete({ where: { id: created.invitation.id } });
    await prisma.auditLog.deleteMany({ where: { entityId: created.invitation.id } });
  });

  it("refuses a cross-origin create and a foreign origin acceptance", async () => {
    const body = { email: "siv-origin@test.local", role: "TEACHER" as const };

    const rejected = await createInvitationResponse(
      ids.ownerA,
      foreignOriginPost("/api/institution/staff/invitations", body)
    );
    assert.equal(rejected.status, 403);
    assert.equal(
      await prisma.staffInvitation.count({
        where: { institutionId: ids.instA, email: body.email },
      }),
      0
    );

    const accepted = await acceptInvitationResponse(
      ids.invitee,
      foreignOriginPost("/api/invitations/accept", { token: "x".repeat(43) })
    );
    assert.equal(accepted.status, 403);
  });

  it("maps handler outcomes without leaking another centre's rows", async () => {
    const listed = await listInvitationsResponse(
      ids.ownerA,
      new Request("http://localhost/api/institution/staff/invitations")
    );
    assert.equal(listed.status, 200);

    const foreign = await listInvitationsResponse(
      ids.ownerA,
      new Request(`http://localhost/api/institution/staff/invitations?institution=${ids.instB}`)
    );
    assert.equal(foreign.status, 403);

    const created = await createInvitationResponse(
      ids.ownerA,
      sameOriginPost("/api/institution/staff/invitations", {
        email: "siv-handler@test.local",
        role: "TEACHER",
      })
    );
    assert.equal(created.status, 201);
    const payload = (await created.json()) as {
      invitation?: { id: string };
      emailSent?: boolean;
    };
    assert.ok(payload.invitation?.id);
    // No provider is configured in the test environment, so the API must say so
    // and hand over the fallback path instead of claiming a sent email.
    assert.equal(payload.emailSent, false);

    const resend = await resendInvitationResponse({
      userId: ids.adminA,
      invitationId: payload.invitation!.id,
      request: sameOriginPost(
        `/api/institution/staff/invitations/${payload.invitation!.id}`,
        {}
      ),
    });
    assert.equal(resend.status, 200);

    const revoke = await revokeInvitationResponse({
      userId: ids.ownerB,
      invitationId: payload.invitation!.id,
      request: new Request(
        `http://localhost/api/institution/staff/invitations/${payload.invitation!.id}`,
        { method: "DELETE", headers: { origin: "http://localhost" } }
      ),
    });
    assert.equal(revoke.status, 404, "a foreign account cannot reach this invitation");

    await prisma.staffInvitation.delete({ where: { id: payload.invitation!.id } });
    await prisma.auditLog.deleteMany({ where: { entityId: payload.invitation!.id } });
  });

  it("D6 requires a live SUPER_ADMIN and forces CENTER_ADMIN", async () => {
    const anonymous = await listAdminInvitationsResponse(null, ids.instA);
    assert.equal(anonymous.status, 401);

    const nonAdmin = await listAdminInvitationsResponse(
      { user: { id: ids.ownerA } },
      ids.instA
    );
    assert.equal(nonAdmin.status, 403);

    const unknownInstitution = await listAdminInvitationsResponse(
      { user: { id: ids.superAdmin } },
      "siv-does-not-exist"
    );
    assert.equal(unknownInstitution.status, 404);

    const created = await createAdminInvitationResponse(
      { user: { id: ids.superAdmin } },
      ids.instA,
      sameOriginPost("/api/admin/institutions/x/staff", {
        email: "siv-d6-admin@test.local",
        // The D6 body has no role field: this key is ignored, not honoured.
        role: "SUPER_ADMIN",
        title: "مدير مفوّض",
      })
    );
    assert.equal(created.status, 201);
    const payload = (await created.json()) as { invitation?: { id: string; role: string } };
    assert.equal(payload.invitation?.role, "CENTER_ADMIN");

    const row = await prisma.staffInvitation.findUnique({
      where: { id: payload.invitation!.id },
    });
    assert.equal(row?.role, "CENTER_ADMIN");
    assert.equal(row?.institutionId, ids.instA);

    // Without a real SUPER_ADMIN row, the same request is refused and writes nothing.
    const refused = await createAdminInvitationResponse(
      { user: { id: ids.adminA } },
      ids.instA,
      sameOriginPost("/api/admin/institutions/x/staff", {
        email: "siv-d6-denied@test.local",
      })
    );
    assert.equal(refused.status, 403);
    assert.equal(
      await prisma.staffInvitation.count({
        where: { email: "siv-d6-denied@test.local" },
      }),
      0
    );

    const audited = await prisma.auditLog.findFirst({
      where: { entityId: payload.invitation!.id },
    });
    assert.equal(audited?.actorRole, "SUPER_ADMIN");

    await prisma.staffInvitation.delete({ where: { id: payload.invitation!.id } });
    await prisma.auditLog.deleteMany({ where: { entityId: payload.invitation!.id } });
  });
});
