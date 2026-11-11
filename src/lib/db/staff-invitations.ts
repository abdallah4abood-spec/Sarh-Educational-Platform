import type { Prisma, StaffInvitationStatus, StaffRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { acquireAdvisoryLock } from "@/lib/db/advisory-lock";
import {
  requireCapability,
  type InstitutionAccess,
} from "@/lib/institution-access";
import {
  STAFF_ROLE_LABEL,
  canInviteRole,
  effectiveInvitationStatus,
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiry,
  isInvitationLive,
  isPlausibleEmail,
  normalizeInvitationEmail,
  type InvitationActorKind,
} from "@/lib/staff-invitations";

/**
 * Staff invitations — the single write path (phase 4.4).
 *
 * Both the institution roster and the SUPER_ADMIN screen (D6) call these
 * functions; there is deliberately no second implementation. Authorisation
 * comes in as an `InvitationActor` that only server code can build:
 *
 *   • `institutionInvitationActor(access)` — from a database-verified
 *     `InstitutionAccess` (owner or ACTIVE CENTER_ADMIN membership);
 *   • `superAdminInvitationActor(...)` — only after `requireLiveSuperAdmin`
 *     has confirmed the account is still SUPER_ADMIN in the database.
 *
 * The token is never stored, logged or audited in clear. `create`/`resend`
 * return it once so the caller can put it in the emailed link; nothing else
 * reads it.
 *
 * Lifecycle: a PENDING row whose `expiresAt` has passed is expired by
 * derivation and lazily persisted. Resending rotates the token and revives the
 * same row (REVOKED/EXPIRED included), so the history stays in one place and
 * in `AuditLog` — it never creates a second row that could disagree.
 */

/**
 * Budget for the interactive transactions below.
 *
 * Each of them takes an advisory lock, then writes the invitation row and its
 * audit entry. Prisma's default (5 s) starts counting when the transaction
 * opens, so the first request after a cold boot — pool warm-up, first compiled
 * query, slow database connection — can exhaust it before the first write lands
 * and the request fails with `P2028`. The same budget is used by the guardian
 * and join-code flows.
 */
const INVITATION_TX_OPTIONS = { timeout: 15_000, maxWait: 10_000 };

export type StaffInvitationErrorCode =
  | "ROLE_NOT_INVITABLE"
  | "INVALID_EMAIL"
  | "INVITATION_NOT_FOUND"
  | "INVITATION_PENDING"
  | "INVITATION_ALREADY_ACCEPTED"
  | "INVITATION_REVOKED"
  | "INVITATION_EXPIRED"
  | "INVALID_TOKEN"
  | "ALREADY_MEMBER"
  | "MEMBERSHIP_CONFLICT"
  | "EMAIL_MISMATCH"
  | "EMAIL_NOT_VERIFIED";

export class StaffInvitationError extends Error {
  constructor(
    readonly code: StaffInvitationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "StaffInvitationError";
  }
}

export interface InvitationActor {
  userId: string;
  institutionId: string;
  kind: InvitationActorKind;
}

/** Build the actor for a centre page. Throws when the token cannot invite. */
export function institutionInvitationActor(
  access: InstitutionAccess
): InvitationActor {
  requireCapability(access, "staff.invite");
  return {
    userId: access.userId,
    institutionId: access.institutionId,
    kind: access.level,
  };
}

/**
 * Actor for the D6 screen. The caller must already have passed
 * `requireLiveSuperAdmin`; this function only records who is acting and where.
 */
export function superAdminInvitationActor(
  userId: string,
  institutionId: string
): InvitationActor {
  return { userId, institutionId, kind: "SUPER_ADMIN" };
}

export interface StaffInvitationRow {
  id: string;
  email: string;
  role: StaffRole;
  roleLabel: string;
  title: string;
  subjects: string;
  status: StaffInvitationStatus;
  expiresAt: string;
  createdAt: string;
  invitedById: string;
}

type InvitationRecord = {
  id: string;
  email: string;
  role: StaffRole;
  title: string;
  subjects: string[];
  status: StaffInvitationStatus;
  expiresAt: Date;
  createdAt: Date;
  invitedById: string;
};

function toRow(row: InvitationRecord, now: Date = new Date()): StaffInvitationRow {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    roleLabel: STAFF_ROLE_LABEL[row.role],
    title: row.title,
    subjects: row.subjects.join("، "),
    status: effectiveInvitationStatus(row.status, row.expiresAt, now),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    invitedById: row.invitedById,
  };
}

type AuditInput = {
  action: string;
  entityType: "StaffInvitation";
  entityId: string;
  actorId: string;
  actorRole: string;
  institutionId: string;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Audit write inside the caller's transaction.
 *
 * Sharing the transaction is what makes "a successful transition always has a
 * trace" true: an audit failure rolls the transition back instead of leaving a
 * committed change nobody recorded.
 */
async function writeAudit(
  tx: Prisma.TransactionClient,
  input: AuditInput
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      institutionId: input.institutionId,
      metadata: input.metadata,
    },
  });
}

/** Pending and recently-decided invitations for one centre, newest first. */
export async function listStaffInvitations(
  actor: InvitationActor,
  take = 50
): Promise<StaffInvitationRow[]> {
  const rows = await prisma.staffInvitation.findMany({
    where: { institutionId: actor.institutionId },
    orderBy: [{ createdAt: "desc" }],
    take,
  });
  return rows.map((row) => toRow(row));
}

export interface CreateInvitationInput {
  email: string;
  role: StaffRole;
  /** Optional override of the display position; defaults to the role label. */
  title?: string | null;
  subjects?: string[] | null;
}

export interface IssuedInvitation {
  invitation: StaffInvitationRow;
  /** Returned once, for the email link. Never stored in clear. */
  token: string;
}

function cleanSubjects(subjects: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  for (const raw of subjects ?? []) {
    const value = raw.trim();
    if (value) seen.add(value);
    if (seen.size >= 10) break;
  }
  return [...seen];
}

/**
 * Create (or reopen) an invitation.
 *
 * Reopening is chosen over a duplicate row when the same address already had an
 * invitation in this centre: one address has at most one live offer per centre,
 * and the audit trail keeps every transition.
 */
export async function createStaffInvitation(
  actor: InvitationActor,
  input: CreateInvitationInput
): Promise<IssuedInvitation> {
  const email = normalizeInvitationEmail(input.email);
  if (!isPlausibleEmail(email)) {
    throw new StaffInvitationError("INVALID_EMAIL", "البريد الإلكتروني غير صالح");
  }
  if (!canInviteRole(actor.kind, input.role)) {
    throw new StaffInvitationError(
      "ROLE_NOT_INVITABLE",
      "لا تملك صلاحية دعوة هذا الدور"
    );
  }

  const title = (input.title ?? "").trim() || STAFF_ROLE_LABEL[input.role];
  const subjects = cleanSubjects(input.subjects);
  const token = generateInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const now = new Date();
  const expiresAt = invitationExpiry(now);

  const saved = await prisma.$transaction(async (tx) => {
    // Serialise concurrent invitations for the same address in this centre so
    // two parallel submits cannot both pass the "no pending offer" read.
    await acquireAdvisoryLock(
      tx,
      `staff-invitation:issue:${actor.institutionId}:${email}`
    );

    const account = await tx.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (account) {
      const membership = await tx.staffMember.findUnique({
        where: {
          userId_institutionId: {
            userId: account.id,
            institutionId: actor.institutionId,
          },
        },
        select: { id: true, role: true, status: true },
      });
      if (membership) {
        throw new StaffInvitationError(
          membership.status === "ACTIVE" && membership.role === input.role
            ? "ALREADY_MEMBER"
            : "MEMBERSHIP_CONFLICT",
          "هذا الحساب عضو في المركز بالفعل — راجع العضوية القائمة"
        );
      }
    }

    const existing = await tx.staffInvitation.findFirst({
      where: { institutionId: actor.institutionId, email },
      orderBy: { createdAt: "desc" },
    });

    if (existing && isInvitationLive(existing.status, existing.expiresAt, now)) {
      throw new StaffInvitationError(
        "INVITATION_PENDING",
        "توجد دعوة معلّقة لهذا البريد — أعد إرسالها بدل إنشاء دعوة جديدة"
      );
    }

    const data = {
      email,
      role: input.role,
      title,
      subjects,
      tokenHash,
      status: "PENDING" as const,
      invitedById: actor.userId,
      expiresAt,
      acceptedAt: null,
      acceptedById: null,
      revokedAt: null,
      revokedById: null,
    };

    const invitation = existing
      ? await tx.staffInvitation.update({ where: { id: existing.id }, data })
      : await tx.staffInvitation.create({
          data: { ...data, institutionId: actor.institutionId },
        });

    await writeAudit(tx, {
      action: existing
        ? "STAFF_INVITATION.REOPENED"
        : "STAFF_INVITATION.CREATED",
      entityType: "StaffInvitation",
      entityId: invitation.id,
      actorId: actor.userId,
      actorRole: actor.kind,
      institutionId: actor.institutionId,
      metadata: {
        role: input.role,
        previousStatus: existing?.status ?? null,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return invitation;
  }, INVITATION_TX_OPTIONS);

  return { invitation: toRow(saved, now), token };
}

/** Rotate the token and revive a pending/expired/revoked invitation. */
export async function resendStaffInvitation(
  actor: InvitationActor,
  invitationId: string
): Promise<IssuedInvitation> {
  const token = generateInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const now = new Date();
  const expiresAt = invitationExpiry(now);

  const saved = await prisma.$transaction(async (tx) => {
    await acquireAdvisoryLock(tx, `staff-invitation:row:${invitationId}`);

    const existing = await tx.staffInvitation.findUnique({
      where: { id: invitationId },
    });
    if (!existing || existing.institutionId !== actor.institutionId) {
      throw new StaffInvitationError(
        "INVITATION_NOT_FOUND",
        "الدعوة غير موجودة في هذه المؤسسة"
      );
    }
    if (existing.status === "ACCEPTED") {
      throw new StaffInvitationError(
        "INVITATION_ALREADY_ACCEPTED",
        "الدعوة مقبولة بالفعل ولا يمكن إعادة إرسالها"
      );
    }

    const invitation = await tx.staffInvitation.update({
      where: { id: existing.id },
      data: {
        tokenHash,
        status: "PENDING",
        invitedById: actor.userId,
        expiresAt,
        revokedAt: null,
        revokedById: null,
      },
    });

    // The previous token dies with this update: only the newest hash exists, so
    // any older link is rejected on acceptance.
    await writeAudit(tx, {
      action: "STAFF_INVITATION.RESENT",
      entityType: "StaffInvitation",
      entityId: invitation.id,
      actorId: actor.userId,
      actorRole: actor.kind,
      institutionId: actor.institutionId,
      metadata: {
        previousStatus: existing.status,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return invitation;
  }, INVITATION_TX_OPTIONS);

  return { invitation: toRow(saved, now), token };
}

/** Withdraw a pending invitation. Revoking an already-revoked row is a no-op. */
export async function revokeStaffInvitation(
  actor: InvitationActor,
  invitationId: string
): Promise<StaffInvitationRow> {
  const now = new Date();

  const saved = await prisma.$transaction(async (tx) => {
    await acquireAdvisoryLock(tx, `staff-invitation:row:${invitationId}`);

    const existing = await tx.staffInvitation.findUnique({
      where: { id: invitationId },
    });
    if (!existing || existing.institutionId !== actor.institutionId) {
      throw new StaffInvitationError(
        "INVITATION_NOT_FOUND",
        "الدعوة غير موجودة في هذه المؤسسة"
      );
    }
    if (existing.status === "ACCEPTED") {
      throw new StaffInvitationError(
        "INVITATION_ALREADY_ACCEPTED",
        "لا يمكن سحب دعوة قُبلت بالفعل — عدّل العضوية بدلاً من ذلك"
      );
    }
    if (existing.status === "REVOKED") return existing;

    const invitation = await tx.staffInvitation.update({
      where: { id: existing.id },
      data: { status: "REVOKED", revokedAt: now, revokedById: actor.userId },
    });

    await writeAudit(tx, {
      action: "STAFF_INVITATION.REVOKED",
      entityType: "StaffInvitation",
      entityId: invitation.id,
      actorId: actor.userId,
      actorRole: actor.kind,
      institutionId: actor.institutionId,
      metadata: { previousStatus: existing.status },
    });

    return invitation;
  }, INVITATION_TX_OPTIONS);

  return toRow(saved, now);
}

export interface AcceptedInvitation {
  invitationId: string;
  institutionId: string;
  staffMemberId: string;
  role: StaffRole;
}

/**
 * Accept an invitation for the signed-in account.
 *
 * Four checks stand between the token and a membership, all from the database
 * on this request:
 *
 *   1. the token must hash to a live PENDING row;
 *   2. the account's stored (normalised) email must match the invitation;
 *   3. `emailVerified` must be set on the live `User` row — never the JWT, so
 *      an old cookie cannot accept on behalf of an unverified account;
 *   4. no ACTIVE membership may already exist (a different role or an inactive
 *      row is a 409, never silently replaced).
 *
 * The role written to `StaffMember` comes from the invitation row only. The
 * client never sends one. `User.role`/`User.roles` are left untouched: the
 * TEACHER/INSTITUTION_TEACHER tier is derived live from the membership.
 */
export async function acceptStaffInvitation(
  userId: string,
  rawToken: string
): Promise<AcceptedInvitation> {
  const token = rawToken.trim();
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
    throw new StaffInvitationError("INVALID_TOKEN", "رابط الدعوة غير صالح");
  }

  const tokenHash = hashInvitationToken(token);
  const found = await prisma.staffInvitation.findUnique({ where: { tokenHash } });
  if (!found) {
    throw new StaffInvitationError(
      "INVITATION_NOT_FOUND",
      "الدعوة غير موجودة أو تم استبدال رابطها"
    );
  }
  if (found.status === "ACCEPTED") {
    throw new StaffInvitationError(
      "INVITATION_ALREADY_ACCEPTED",
      "تم قبول هذه الدعوة مسبقاً"
    );
  }
  if (found.status === "REVOKED") {
    throw new StaffInvitationError(
      "INVITATION_REVOKED",
      "تم سحب هذه الدعوة — اطلب دعوة جديدة من المركز"
    );
  }
  if (!isInvitationLive(found.status, found.expiresAt)) {
    // Record the transition once; it is a lifecycle fact, not an error state.
    await prisma.staffInvitation.updateMany({
      where: { id: found.id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    throw new StaffInvitationError(
      "INVITATION_EXPIRED",
      "انتهت صلاحية الدعوة — اطلب دعوة جديدة من المركز"
    );
  }

  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, emailVerified: true },
  });
  if (!account) {
    throw new StaffInvitationError("EMAIL_MISMATCH", "الحساب غير موجود");
  }
  if (!account.emailVerified) {
    throw new StaffInvitationError(
      "EMAIL_NOT_VERIFIED",
      "يجب تأكيد بريدك الإلكتروني قبل قبول الدعوة"
    );
  }
  if (normalizeInvitationEmail(account.email) !== found.email) {
    // Same answer for "wrong account" and "no such invitation": an outsider
    // learns nothing about which addresses were invited.
    throw new StaffInvitationError(
      "EMAIL_MISMATCH",
      "هذه الدعوة ليست لبريد هذا الحساب"
    );
  }

  return prisma.$transaction(async (tx) => {
    await acquireAdvisoryLock(tx, `staff-invitation:accept:${found.id}`);

    const invitation = await tx.staffInvitation.findUnique({
      where: { id: found.id },
    });
    if (!invitation || invitation.status !== "PENDING") {
      throw new StaffInvitationError(
        "INVITATION_ALREADY_ACCEPTED",
        "لم تعد هذه الدعوة صالحة للقبول"
      );
    }
    if (!isInvitationLive(invitation.status, invitation.expiresAt)) {
      throw new StaffInvitationError(
        "INVITATION_EXPIRED",
        "انتهت صلاحية الدعوة — اطلب دعوة جديدة من المركز"
      );
    }

    const membership = await tx.staffMember.findUnique({
      where: {
        userId_institutionId: {
          userId,
          institutionId: invitation.institutionId,
        },
      },
      select: { id: true, role: true, status: true },
    });
    if (membership) {
      throw new StaffInvitationError(
        membership.status === "ACTIVE" && membership.role === invitation.role
          ? "ALREADY_MEMBER"
          : "MEMBERSHIP_CONFLICT",
        "لديك عضوية في هذا المركز بالفعل — تواصل مع إدارته لتعديلها"
      );
    }

    const created = await tx.staffMember.create({
      data: {
        userId,
        institutionId: invitation.institutionId,
        title: invitation.title,
        role: invitation.role,
        subjects: invitation.subjects,
        status: "ACTIVE",
        joinedAt: new Date(),
      },
      select: { id: true, role: true },
    });

    await tx.staffInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
        acceptedById: userId,
      },
    });

    await writeAudit(tx, {
      action: "STAFF_INVITATION.ACCEPTED",
      entityType: "StaffInvitation",
      entityId: invitation.id,
      actorId: userId,
      actorRole: "INVITEE",
      institutionId: invitation.institutionId,
      metadata: {
        role: created.role,
        staffMemberId: created.id,
        invitedById: invitation.invitedById,
      },
    });

    return {
      invitationId: invitation.id,
      institutionId: invitation.institutionId,
      staffMemberId: created.id,
      role: created.role,
    };
  }, INVITATION_TX_OPTIONS);
}
