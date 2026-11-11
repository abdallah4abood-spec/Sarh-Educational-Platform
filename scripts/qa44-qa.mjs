/**
 * Temporary QA driver for phase 4.4 + D6 manual verification.
 *
 * Talks to the running dev server exactly like the browser does (NextAuth
 * credentials cycle + same-origin JSON calls) and uses Prisma read-only for
 * assertions. Never prints a token, hash, or cookie value.
 *
 * Deleted after the run; results are kept in dev-artifacts/qa44-results.json.
 */
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3000";
const PASSWORD = "Parent123!";
const prisma = new PrismaClient();
const results = [];
let failures = 0;

function record(id, ok, details) {
  results.push({ id, ok, details });
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${id} :: ${JSON.stringify(details)}`);
}

/* ---------------- cookie-aware HTTP client ---------------- */

function newSession(label) {
  return { label, cookies: new Map() };
}

function storeCookies(session, response) {
  const list =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  for (const raw of list) {
    const [pair] = raw.split(";");
    const index = pair.indexOf("=");
    if (index > 0) {
      session.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }
}

function cookieHeader(session) {
  return [...session.cookies.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function request(session, method, path, { body, headers = {}, redirect } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    redirect: redirect ?? "follow",
    headers: {
      origin: BASE,
      ...(session.cookies.size ? { cookie: cookieHeader(session) } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  storeCookies(session, response);
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: response.status, headers: response.headers, json, text };
}

async function signIn(email, password = PASSWORD) {
  const session = newSession(email);
  const csrf = await request(session, "GET", "/api/auth/csrf");
  const response = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      origin: BASE,
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(session),
    },
    body: new URLSearchParams({
      csrfToken: csrf.json.csrfToken,
      identifier: email,
      password,
      json: "true",
    }),
  });
  storeCookies(session, response);
  const payload = await response.json().catch(() => ({}));
  return { session, status: response.status, payload };
}

/** Create (or reset) a PARENT account fixture through the real signup route. */
async function ensureAccount(email, fullName) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    const signup = await fetch(`${BASE}/api/auth/signup`, {
      method: "POST",
      headers: { origin: BASE, "content-type": "application/json" },
      body: JSON.stringify({ fullName, email, password: PASSWORD, acceptedTerms: true }),
    });
    const body = await signup.json().catch(() => ({}));
    if (!body?.success) {
      throw new Error(`signup failed for ${email}: ${signup.status} ${body?.code ?? ""}`);
    }
  }
  return prisma.user.update({
    where: { email },
    data: { emailVerified: new Date(), role: "PARENT", roles: [] },
    select: { id: true, email: true },
  });
}

function maskLink(path) {
  if (!path) return null;
  const token = new URL(`http://x${path}`).searchParams.get("token") ?? "";
  return { path: path.split("?")[0], tokenLength: token.length };
}

/* ---------------- checks ---------------- */

const INST1 = "seed-inst-1";
const INST2 = "seed-inst-2";
const inviteIds = [];
const auditSeen = [];

async function resetFixtures() {
  const old = await prisma.staffInvitation.findMany({
    where: { OR: [{ email: { startsWith: "qa44-" } }] },
    select: { id: true },
  });
  const ids = old.map((row) => row.id);
  if (ids.length) {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.staffInvitation.deleteMany({ where: { id: { in: ids } } });
  }
  const fixtures = await prisma.user.findMany({
    where: { email: { startsWith: "qa44-" } },
    select: { id: true },
  });
  const userIds = fixtures.map((row) => row.id);
  if (userIds.length) {
    await prisma.staffMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

async function main() {
  await resetFixtures();

  /* 1. acceptPath / headers review */
  const owner = (await signIn("center@sarh.ps")).session;

  const anonymous = await request(newSession("anon"), "GET",
    "/invitations/accept?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", { redirect: "manual" });
  record("accept.anon", anonymous.status === 307 || anonymous.status === 302, {
    status: anonymous.status,
    location: anonymous.headers.get("location")?.split("?")[0],
  });

  const page = await request(owner, "GET",
    "/invitations/accept?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  record("accept.headers", page.status === 200, {
    status: page.status,
    cacheControl: page.headers.get("cache-control"),
    referrerPolicy: page.headers.get("referrer-policy"),
    robots: page.headers.get("x-robots-tag"),
  });

  /* 2. create invitation — OWNER, TEACHER */
  const teacherEmail = "qa44-inv-teacher@test.local";
  const created = await request(owner, "POST",
    `/api/institution/staff/invitations?institution=${INST1}`,
    { body: { email: teacherEmail, role: "TEACHER", title: "معلم اختبار" } });
  const createdInv = created.json?.invitation;
  if (createdInv?.id) inviteIds.push(createdInv.id);
  record("create.owner.teacher", created.status === 201 && createdInv?.status === "PENDING", {
    status: created.status,
    emailSent: created.json?.emailSent,
    emailFailure: created.json?.emailFailure,
    acceptPath: maskLink(created.json?.acceptPath),
    role: createdInv?.role,
    status2: createdInv?.status,
    expiresInDays: createdInv
      ? Math.round((new Date(createdInv.expiresAt) - Date.now()) / 86400000)
      : null,
  });

  /* duplicate create must be 409 */
  const duplicate = await request(owner, "POST",
    `/api/institution/staff/invitations?institution=${INST1}`,
    { body: { email: teacherEmail, role: "TEACHER" } });
  record("create.duplicate", duplicate.status === 409 && duplicate.json?.code === "INVITATION_PENDING", {
    status: duplicate.status,
    code: duplicate.json?.code,
  });

  /* 3. resend rotates the token */
  const resend = await request(owner, "POST",
    `/api/institution/staff/invitations/${createdInv.id}?institution=${INST1}`);
  const rotated = resend.json?.invitation;
  record("resend.rotate", resend.status === 200 && rotated?.status === "PENDING", {
    status: resend.status,
    emailSent: resend.json?.emailSent,
    acceptPath: maskLink(resend.json?.acceptPath),
    expiresAtChanged: rotated?.expiresAt !== createdInv?.expiresAt,
  });

  /* old token must be dead: INVITATION_NOT_FOUND (the hash was replaced) */
  const oldToken = new URL(`http://x${created.json?.acceptPath}`).searchParams.get("token");
  const newToken = new URL(`http://x${resend.json?.acceptPath}`).searchParams.get("token");
  const oldAttempt = await request(owner, "POST", "/api/invitations/accept",
    { body: { token: oldToken } });
  record("resend.oldTokenRejected", oldAttempt.status === 404 && oldAttempt.json?.code === "INVITATION_NOT_FOUND", {
    status: oldAttempt.status,
    code: oldAttempt.json?.code,
  });

  /* new token is live: wrong account → EMAIL_MISMATCH (not NOT_FOUND) */
  const wrongAccount = await request(owner, "POST", "/api/invitations/accept",
    { body: { token: newToken } });
  record("resend.newTokenLive", wrongAccount.status === 403 && wrongAccount.json?.code === "EMAIL_MISMATCH", {
    status: wrongAccount.status,
    code: wrongAccount.json?.code,
  });

  /* 4. revoke a second invitation */
  const revokeEmail = "qa44-inv-revoke@test.local";
  const toRevoke = await request(owner, "POST",
    `/api/institution/staff/invitations?institution=${INST1}`,
    { body: { email: revokeEmail, role: "SECRETARY" } });
  if (toRevoke.json?.invitation?.id) inviteIds.push(toRevoke.json.invitation.id);
  const revoke = await request(owner, "DELETE",
    `/api/institution/staff/invitations/${toRevoke.json?.invitation?.id}?institution=${INST1}`);
  record("revoke.transition", revoke.status === 200 && revoke.json?.invitation?.status === "REVOKED", {
    status: revoke.status,
    status2: revoke.json?.invitation?.status,
  });

  const revokedToken = new URL(`http://x${toRevoke.json?.acceptPath}`).searchParams.get("token");
  const revokedAttempt = await request(owner, "POST", "/api/invitations/accept",
    { body: { token: revokedToken } });
  record("revoke.useRejected", revokedAttempt.status === 409 && revokedAttempt.json?.code === "INVITATION_REVOKED", {
    status: revokedAttempt.status,
    code: revokedAttempt.json?.code,
  });

  /* 5. expiry via fixture: move expiresAt into the past, then accept */
  const expireEmail = "qa44-inv-expire@test.local";
  const toExpire = await request(owner, "POST",
    `/api/institution/staff/invitations?institution=${INST1}`,
    { body: { email: expireEmail, role: "TEACHER" } });
  const expireId = toExpire.json?.invitation?.id;
  if (expireId) inviteIds.push(expireId);
  const past = new Date(Date.now() - 60_000);
  await prisma.staffInvitation.update({ where: { id: expireId }, data: { expiresAt: past } });

  const expiredToken = new URL(`http://x${toExpire.json?.acceptPath}`).searchParams.get("token");
  const expireAttempt = await request(owner, "POST", "/api/invitations/accept",
    { body: { token: expiredToken } });
  const expireRow = await prisma.staffInvitation.findUnique({
    where: { id: expireId }, select: { status: true },
  });
  record("expiry.rejectedAndPersisted",
    expireAttempt.status === 409 &&
    expireAttempt.json?.code === "INVITATION_EXPIRED" &&
    expireRow?.status === "EXPIRED",
    { status: expireAttempt.status, code: expireAttempt.json?.code, stored: expireRow?.status });

  /* 6. OWNER may invite CENTER_ADMIN (role matrix) */
  const adminInviteEmail = "qa44-inv-center-admin@test.local";
  const ownerAdminInvite = await request(owner, "POST",
    `/api/institution/staff/invitations?institution=${INST1}`,
    { body: { email: adminInviteEmail, role: "CENTER_ADMIN" } });
  if (ownerAdminInvite.json?.invitation?.id) inviteIds.push(ownerAdminInvite.json.invitation.id);
  record("owner.inviteCenterAdmin", ownerAdminInvite.status === 201 &&
    ownerAdminInvite.json?.invitation?.role === "CENTER_ADMIN", {
    status: ownerAdminInvite.status,
    role: ownerAdminInvite.json?.invitation?.role,
  });

  /* 7. CENTER_ADMIN fixture */
  const adminAccount = await ensureAccount("qa44-admin@test.local", "مدير مركز اختبار");
  await prisma.staffMember.upsert({
    where: { userId_institutionId: { userId: adminAccount.id, institutionId: INST1 } },
    update: { role: "CENTER_ADMIN", status: "ACTIVE", title: "مدير اختبار" },
    create: {
      userId: adminAccount.id,
      institutionId: INST1,
      role: "CENTER_ADMIN",
      status: "ACTIVE",
      title: "مدير اختبار",
      subjects: [],
    },
  });
  const centerAdmin = (await signIn("qa44-admin@test.local")).session;

  const caTeacher = await request(centerAdmin, "POST",
    `/api/institution/staff/invitations?institution=${INST1}`,
    { body: { email: "qa44-ca-teacher@test.local", role: "TEACHER" } });
  if (caTeacher.json?.invitation?.id) inviteIds.push(caTeacher.json.invitation.id);
  const caSecretary = await request(centerAdmin, "POST",
    `/api/institution/staff/invitations?institution=${INST1}`,
    { body: { email: "qa44-ca-secretary@test.local", role: "SECRETARY" } });
  if (caSecretary.json?.invitation?.id) inviteIds.push(caSecretary.json.invitation.id);
  const caAdmin = await request(centerAdmin, "POST",
    `/api/institution/staff/invitations?institution=${INST1}`,
    { body: { email: "qa44-ca-admin@test.local", role: "CENTER_ADMIN" } });
  record("centerAdmin.matrix", caTeacher.status === 201 && caSecretary.status === 201 &&
    caAdmin.status === 403 && caAdmin.json?.code === "ROLE_NOT_INVITABLE", {
    teacher: caTeacher.status,
    secretary: caSecretary.status,
    centerAdmin: caAdmin.status,
    code: caAdmin.json?.code,
  });

  const caOtherCentre = await request(centerAdmin, "GET",
    `/api/institution/staff/invitations?institution=${INST2}`);
  record("centerAdmin.otherCentreForbidden", caOtherCentre.status === 403, {
    status: caOtherCentre.status,
    code: caOtherCentre.json?.code,
  });

  /* UI role options come from the verified access level */
  const caStaffPage = await request(centerAdmin, "GET", `/institution/staff?institution=${INST1}`);
  const hasCenterAdminOption = /value="CENTER_ADMIN"/.test(caStaffPage.text);
  record("centerAdmin.uiRoleOptions", caStaffPage.status === 200 && !hasCenterAdminOption, {
    status: caStaffPage.status,
    offersCenterAdmin: hasCenterAdminOption,
  });

  /* 8. D6 — SUPER_ADMIN */
  const superAdmin = (await signIn("admin@sarh.ps")).session;
  const d6Page = await request(superAdmin, "GET", `/admin/institutions/${INST1}/staff`);
  const d6Api = await request(superAdmin, "GET", `/api/admin/institutions/${INST1}/staff`);
  record("d6.readAccess", d6Page.status === 200 && d6Api.status === 200 &&
    /دعوات مدير المركز/.test(d6Page.text), {
    page: d6Page.status,
    api: d6Api.status,
    invitationsListed: d6Api.json?.invitations?.length,
  });

  const d6Create = await request(superAdmin, "POST", `/api/admin/institutions/${INST1}/staff`,
    { body: { email: "qa44-d6-admin@test.local", role: "TEACHER", title: "مدير دعوة" } });
  if (d6Create.json?.invitation?.id) inviteIds.push(d6Create.json.invitation.id);
  record("d6.roleFixed", d6Create.status === 201 && d6Create.json?.invitation?.role === "CENTER_ADMIN", {
    status: d6Create.status,
    role: d6Create.json?.invitation?.role,
  });

  const d6Resend = await request(superAdmin, "POST",
    `/api/admin/institutions/${INST1}/staff/${d6Create.json?.invitation?.id}`);
  record("d6.resend", d6Resend.status === 200 && d6Resend.json?.invitation?.status === "PENDING", {
    status: d6Resend.status,
    emailSent: d6Resend.json?.emailSent,
  });

  const d6Revoke = await request(superAdmin, "DELETE",
    `/api/admin/institutions/${INST1}/staff/${d6Create.json?.invitation?.id}`);
  record("d6.revoke", d6Revoke.status === 200 && d6Revoke.json?.invitation?.status === "REVOKED", {
    status: d6Revoke.status,
    status2: d6Revoke.json?.invitation?.status,
  });

  const d6AsOwner = await request(owner, "GET", `/api/admin/institutions/${INST1}/staff`);
  const d6PageAsOwner = await request(owner, "GET", `/admin/institutions/${INST1}/staff`, { redirect: "manual" });
  record("d6.nonAdminDenied", d6AsOwner.status === 403 &&
    (d6PageAsOwner.status === 307 || d6PageAsOwner.status === 302), {
    api: d6AsOwner.status,
    page: d6PageAsOwner.status,
  });

  /* cross-institution id must 404, not act */
  const inst2Invite = await request(owner, "POST",
    `/api/institution/staff/invitations?institution=${INST2}`,
    { body: { email: "qa44-inst2@test.local", role: "TEACHER" } });
  if (inst2Invite.json?.invitation?.id) inviteIds.push(inst2Invite.json.invitation.id);
  const crossDelete = await request(superAdmin, "DELETE",
    `/api/admin/institutions/${INST1}/staff/${inst2Invite.json?.invitation?.id}`);
  record("d6.crossInstitution", crossDelete.status === 404 &&
    crossDelete.json?.code === "INVITATION_NOT_FOUND", {
    status: crossDelete.status,
    code: crossDelete.json?.code,
  });

  /* 9. stale JWT: demote a live SUPER_ADMIN while the cookie still says so */
  const superFixture = await ensureAccount("qa44-super@test.local", "مشرف منصة اختبار");
  await prisma.user.update({
    where: { id: superFixture.id },
    data: { role: "SUPER_ADMIN", roles: ["SUPER_ADMIN"] },
  });
  const staleSession = (await signIn("qa44-super@test.local")).session;
  const beforeDemotion = await request(staleSession, "GET",
    `/api/admin/institutions/${INST1}/staff`);
  await prisma.user.update({
    where: { id: superFixture.id },
    data: { role: "PARENT", roles: [] },
  });
  const afterDemotion = await request(staleSession, "GET",
    `/api/admin/institutions/${INST1}/staff`);
  const afterDemotionPage = await request(staleSession, "GET",
    `/admin/institutions/${INST1}/staff`, { redirect: "manual" });
  // With streaming already started Next answers 200 plus a meta-refresh
  // redirect; what matters is that no institution data is in the payload.
  const pageRedirects = afterDemotionPage.status === 307 ||
    afterDemotionPage.status === 302 ||
    /__next-page-redirect/.test(afterDemotionPage.text);
  const pageLeaks = /qa44-[a-z-]+@test\.local/.test(afterDemotionPage.text) ||
    afterDemotionPage.text.includes("مركز النور للتحضير والتوجيهي");
  record("d6.liveCheck", beforeDemotion.status === 200 && afterDemotion.status === 403 &&
    pageRedirects && !pageLeaks, {
    before: beforeDemotion.status,
    after: afterDemotion.status,
    afterPage: afterDemotionPage.status,
    pageRedirectsViaMeta: /__next-page-redirect/.test(afterDemotionPage.text),
    pageLeaksData: pageLeaks,
  });

  /* 10. isolation + audit integrity */
  const inst1Rows = await prisma.staffInvitation.findMany({
    where: { institutionId: INST1, email: { startsWith: "qa44-" } },
    select: { id: true, email: true, institutionId: true, status: true },
  });
  const leaked = inst1Rows.filter((row) => row.institutionId !== INST1);
  const inst2Rows = await prisma.staffInvitation.findMany({
    where: { email: "qa44-inst2@test.local" },
    select: { id: true, institutionId: true },
  });
  record("isolation.listScope", leaked.length === 0 && inst2Rows.length === 1 &&
    inst2Rows[0].institutionId === INST2, {
    inst1FixtureRows: inst1Rows.length,
    leaked: leaked.length,
    inst2Rows: inst2Rows.length,
  });

  const audit = await prisma.auditLog.findMany({
    where: { entityId: { in: inviteIds } },
    select: { action: true, entityId: true, actorRole: true, metadata: true },
    orderBy: { createdAt: "asc" },
  });
  audit.forEach((row) => auditSeen.push(row.action));
  const metadataText = JSON.stringify(audit.map((row) => row.metadata));
  const tokenLeak = /sha256:|[A-Za-z0-9_-]{40,}/.test(metadataText);
  const required = ["STAFF_INVITATION.CREATED", "STAFF_INVITATION.RESENT",
    "STAFF_INVITATION.REVOKED"];
  record("audit.transitions", required.every((action) => auditSeen.includes(action)), {
    actions: [...new Set(auditSeen)].sort(),
    rows: audit.length,
    tokenOrHashInMetadata: tokenLeak,
  });

  const adminMemberships = await prisma.staffMember.count({
    where: { userId: adminAccount.id, institutionId: INST1 },
  });
  const adminUser = await prisma.user.findUnique({
    where: { id: adminAccount.id }, select: { role: true, roles: true },
  });
  record("db.noDuplicateMembership", adminMemberships === 1, {
    centerAdminMembershipsInInst1: adminMemberships,
    userRoleUntouched: adminUser?.role === "PARENT" && (adminUser?.roles ?? []).length === 0,
  });

  /* an invitation must never create an account or a membership by itself */
  const autoAccounts = await prisma.user.count({
    where: { email: { startsWith: "qa44-inv-" } },
  });
  const inviteMemberships = await prisma.staffMember.count({
    where: { user: { email: { startsWith: "qa44-inv-" } } },
  });
  const duplicateRows = await prisma.staffInvitation.groupBy({
    by: ["institutionId", "email"],
    where: { email: { startsWith: "qa44-" } },
    _count: { _all: true },
  });
  record("db.invitationCreatesNothing", autoAccounts === 0 && inviteMemberships === 0 &&
    duplicateRows.every((row) => row._count._all === 1), {
    accountsForInvitedEmails: autoAccounts,
    membershipsForInvitedEmails: inviteMemberships,
    maxRowsPerEmailPerCentre: Math.max(...duplicateRows.map((row) => row._count._all)),
  });

  await prisma.$disconnect();
  console.log(`\nFAILURES=${failures}`);
  const fs = await import("node:fs/promises");
  await fs.writeFile(
    "dev-artifacts/qa44-results.json",
    JSON.stringify({ ranAt: new Date().toISOString(), failures, results }, null, 2)
  );
}

main().catch(async (error) => {
  console.error("QA DRIVER ABORTED:", error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
