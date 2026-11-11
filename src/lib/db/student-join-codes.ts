import { prisma } from "@/lib/prisma";
import { acquireAdvisoryLock } from "@/lib/db/advisory-lock";
import { resolveGuardianAccess } from "@/lib/guardian-access";
import { refreshLinkSummary } from "@/lib/db/guardian-approvals";
import {
  requireCapability,
  type InstitutionAccess,
} from "@/lib/institution-access";
import {
  formatJoinCode,
  generateJoinCode,
  hashJoinCode,
  joinCodeExpiry,
  JOIN_CODE_PATTERN,
  normalizeJoinCode,
} from "@/lib/join-codes";

/**
 * Guardian linking — phase 4.1 codes, phase 4.2 approval, phase 4.3 grants.
 *
 * The rules, and why each exists:
 *
 *   • **The institution issues, the guardian redeems.** An owner or
 *     CENTER_ADMIN of the student's own centre creates the code
 *     (`guardians.manage`); a live, verified PARENT account consumes it. A
 *     teacher or secretary cannot invite a family, and a guardian cannot invite
 *     themselves into a centre.
 *   • **`StudentJoinCode.code` holds a digest, never the code.** The plaintext
 *     is returned once by `issueStudentJoinCode` and exists nowhere else. No
 *     schema change was needed: the column is already `String @unique`, and the
 *     `sha256:` prefix makes its contents self-describing.
 *   • **Single use, fourteen days, one live code per student per institution.**
 *     Issuing again expires the previous code; `revoke…` expires the current
 *     one. "Expired" covers both natural expiry and revocation, which is why no
 *     `revokedAt` column is required. Issue and revoke take the **same**
 *     per-student advisory lock, so the expire-then-create pair cannot
 *     interleave with itself and leave two live codes behind.
 *   • **A code opens a request, never access.** Every redemption leaves a
 *     `PENDING` `StudentGuardianGrant` for the issuing centre with a
 *     `REQUESTED` audit row; the guardian sees nothing until an owner or
 *     CENTER_ADMIN approves it. A code that leaks therefore cannot read a
 *     child's records, and approval at one centre never opens another.
 *   • **A code never overrules an explicit decision.** If the pair already has a
 *     `REJECTED` or `REVOKED` grant at this centre, redemption reopens it as
 *     `PENDING`; the centre decides again. `isPrimary` is untouched.
 *   • **`Student.parentId` is never consulted.** Authority is the APPROVED
 *     `StudentGuardianGrant` row, exactly as `resolveGuardianAccess` reads it.
 *   • **One transaction.** The link, its audit event and the code's consumption
 *     commit together, so a failed redemption cannot burn a code.
 */

export type JoinCodeErrorCode =
  | "STUDENT_NOT_IN_INSTITUTION"
  | "INVALID_CODE"
  | "NOT_A_GUARDIAN"
  | "CODE_NOT_FOUND"
  | "CODE_EXPIRED"
  | "CODE_ALREADY_USED"
  | "STUDENT_NOT_ENROLLED";

export class JoinCodeError extends Error {
  constructor(
    readonly code: JoinCodeErrorCode,
    message: string
  ) {
    super(message);
    this.name = "JoinCodeError";
  }
}

/**
 * The lock behind every mutation of "which code is live for this student".
 *
 * Issue and revoke share it on purpose: an issue that has decided to expire the
 * current code must not be overtaken by a revoke (or another issue) that then
 * writes a fresh one. Redemption keeps its own per-code lock instead — it
 * consumes one specific code and never changes which one is live.
 */
function issueLockKey(institutionId: string, studentId: string): string {
  return `join-code-issue:${institutionId}:${studentId}`;
}

export interface ActiveJoinCodeStatus {
  /** True when a code is live right now. The code itself is never returned. */
  active: boolean;
  /** ISO timestamps of the live code, when there is one. */
  createdAt?: string;
  expiresAt?: string;
}

export interface IssuedJoinCode {
  codeId: string;
  /** Plaintext, returned exactly once. */
  code: string;
  /** `XXXX-XXXX-XX`, what the UI renders and the guardian reads aloud. */
  displayCode: string;
  /** ISO timestamp. */
  expiresAt: string;
}

export interface RedeemedJoinCode {
  studentId: string;
  linkId: string;
  /** The institution-scoped grant this code asked for. */
  grantId: string;
  institutionId: string;
  /** `APPROVED` only when the grant was already approved before this call. */
  status: "APPROVED" | "PENDING";
  /** True when an existing PENDING/APPROVED grant already matched the code. */
  alreadyLinked: boolean;
}

/**
 * Issue a code for one student of the caller's centre.
 *
 * The student must have an ACTIVE enrollment in *this* institution — a
 * withdrawn seat has no family to link yet, and an id from another centre is
 * indistinguishable from an unknown one.
 */
export async function issueStudentJoinCode(
  access: InstitutionAccess,
  studentId: string
): Promise<IssuedJoinCode> {
  requireCapability(access, "guardians.manage");

  const id = studentId?.trim();
  if (!id) {
    throw new JoinCodeError(
      "STUDENT_NOT_IN_INSTITUTION",
      "الطالب غير موجود في هذه المؤسسة"
    );
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      studentId: id,
      institutionId: access.institutionId,
      enrollmentStatus: "ACTIVE",
    },
    select: { id: true },
  });
  if (!enrollment) {
    throw new JoinCodeError(
      "STUDENT_NOT_IN_INSTITUTION",
      "الطالب غير موجود في هذه المؤسسة"
    );
  }

  const now = new Date();
  const expiresAt = joinCodeExpiry(now);
  const code = generateJoinCode();

  const created = await prisma.$transaction(async (tx) => {
    // Serialise the whole expire-then-create pair. Without it two concurrent
    // issues both expire the old rows and both insert, leaving two live codes;
    // the frontend guard alone cannot close that, because the API is public to
    // any holder of the capability.
    await acquireAdvisoryLock(tx, issueLockKey(access.institutionId, id));

    // One live code per student per institution: the previous one dies now,
    // so a lost SMS cannot stay valid behind the newest code.
    await tx.studentJoinCode.updateMany({
      where: {
        studentId: id,
        institutionId: access.institutionId,
        redeemedAt: null,
        expiresAt: { gt: now },
      },
      data: { expiresAt: now },
    });

    return tx.studentJoinCode.create({
      data: {
        // Digest only — the plaintext below never reaches the database.
        code: hashJoinCode(code),
        studentId: id,
        institutionId: access.institutionId,
        createdById: access.userId,
        expiresAt,
      },
      select: { id: true },
    });
  });

  return {
    codeId: created.id,
    code,
    displayCode: formatJoinCode(code),
    expiresAt: expiresAt.toISOString(),
  };
}

/** Expire every unused code of one student in the caller's centre. */
export async function revokeStudentJoinCodes(
  access: InstitutionAccess,
  studentId: string
): Promise<number> {
  requireCapability(access, "guardians.manage");

  const id = studentId?.trim() ?? "";
  return prisma.$transaction(async (tx) => {
    // Same key as issuing: a revoke cannot slip between "expire the old code"
    // and "insert the new one" and leave the result ambiguous.
    await acquireAdvisoryLock(tx, issueLockKey(access.institutionId, id));

    const now = new Date();
    const result = await tx.studentJoinCode.updateMany({
      where: {
        studentId: id,
        institutionId: access.institutionId,
        redeemedAt: null,
        expiresAt: { gt: now },
      },
      data: { expiresAt: now },
    });
    return result.count;
  });
}

/**
 * Whether the student has a live code — **without** the code itself.
 *
 * The plaintext exists only in the issuing response, so a dialog that is
 * reopened can honestly say "a code is active until …" and must not pretend it
 * can show the value again.
 */
export async function loadActiveJoinCode(
  access: InstitutionAccess,
  studentId: string
): Promise<ActiveJoinCodeStatus> {
  requireCapability(access, "guardians.read");

  const row = await prisma.studentJoinCode.findFirst({
    where: {
      studentId: studentId?.trim(),
      institutionId: access.institutionId,
      redeemedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, expiresAt: true },
  });

  return row
    ? {
        active: true,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      }
    : { active: false };
}

/**
 * Redeem a code for the signed-in guardian.
 *
 * All checks run inside one transaction under two advisory locks (the code,
 * then the pair), so two simultaneous submissions cannot both create a link and
 * a replay is answered with the original link instead of an error.
 */
export async function redeemStudentJoinCode(
  userId: string,
  rawCode: string
): Promise<RedeemedJoinCode> {
  const guardian = await resolveGuardianAccess(userId);
  if (!guardian.ok) {
    throw new JoinCodeError(
      "NOT_A_GUARDIAN",
      "استخدام الرمز متاح لحساب ولي أمر موثّق البريد"
    );
  }

  const normalized = normalizeJoinCode(rawCode ?? "");
  if (!JOIN_CODE_PATTERN.test(normalized)) {
    throw new JoinCodeError("INVALID_CODE", "صيغة الرمز غير صحيحة");
  }

  const hash = hashJoinCode(normalized);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    // Serialise redemptions of this code. The lock is released on commit, so a
    // second request sees `redeemedAt` set rather than a second link.
    await acquireAdvisoryLock(tx, `join-code:${hash}`);

    const row = await tx.studentJoinCode.findUnique({
      where: { code: hash },
      select: {
        id: true,
        studentId: true,
        institutionId: true,
        expiresAt: true,
        redeemedAt: true,
        redeemedById: true,
      },
    });
    if (!row) {
      throw new JoinCodeError(
        "CODE_NOT_FOUND",
        "الرمز غير صحيح — تحقق من الرمز الذي أرسله المركز"
      );
    }

    const linkAndGrantOf = async () => {
      const link = await tx.studentGuardian.findUnique({
        where: {
          studentId_userId: { studentId: row.studentId, userId },
        },
        select: { id: true, status: true },
      });
      if (!link) return { link: null, grant: null };
      const grant = await tx.studentGuardianGrant.findUnique({
        where: {
          linkId_institutionId: {
            linkId: link.id,
            institutionId: row.institutionId,
          },
        },
        select: { id: true, status: true },
      });
      return { link, grant };
    };

    // A replay by the same guardian is a success, not an error: the grant is
    // what the caller asked for.
    if (row.redeemedAt) {
      if (row.redeemedById !== userId) {
        throw new JoinCodeError(
          "CODE_ALREADY_USED",
          "هذا الرمز مستخدم بالفعل — اطلب رمزاً جديداً من المركز"
        );
      }
      const current = await linkAndGrantOf();
      if (
        current.link &&
        current.grant &&
        (current.grant.status === "APPROVED" ||
          current.grant.status === "PENDING")
      ) {
        return {
          studentId: row.studentId,
          linkId: current.link.id,
          grantId: current.grant.id,
          institutionId: row.institutionId,
          status: current.grant.status,
          alreadyLinked: true,
        };
      }
      throw new JoinCodeError(
        "CODE_ALREADY_USED",
        "هذا الرمز مستخدم ولم يعد صالحاً"
      );
    }

    if (row.expiresAt.getTime() <= now.getTime()) {
      throw new JoinCodeError(
        "CODE_EXPIRED",
        "انتهت صلاحية الرمز — اطلب رمزاً جديداً من المركز"
      );
    }

    // The code names a student; that student must still sit in the issuing
    // centre. This is what stops a code from another tenant being replayed.
    const enrollment = await tx.enrollment.findFirst({
      where: {
        studentId: row.studentId,
        institutionId: row.institutionId,
        enrollmentStatus: "ACTIVE",
      },
      select: { id: true },
    });
    if (!enrollment) {
      throw new JoinCodeError(
        "STUDENT_NOT_ENROLLED",
        "الطالب لم يعد مسجلاً في المركز الذي أصدر الرمز"
      );
    }

    // One lock for every mutation of this family link, shared with decisions.
    await acquireAdvisoryLock(
      tx,
      `guardian-link:${row.studentId}:${userId}`
    );

    // Consume the code first, guarded on `redeemedAt`.
    const claimed = await tx.studentJoinCode.updateMany({
      where: { id: row.id, redeemedAt: null },
      data: { redeemedAt: now, redeemedById: userId },
    });
    if (claimed.count !== 1) {
      throw new JoinCodeError(
        "CODE_ALREADY_USED",
        "هذا الرمز مستخدم بالفعل — اطلب رمزاً جديداً من المركز"
      );
    }

    let link = await tx.studentGuardian.findUnique({
      where: {
        studentId_userId: { studentId: row.studentId, userId },
      },
      select: { id: true, status: true },
    });
    if (!link) {
      link = await tx.studentGuardian.create({
        data: {
          studentId: row.studentId,
          userId,
          status: "PENDING",
          isPrimary: false,
          requestedAt: now,
          approvedAt: null,
        },
        select: { id: true, status: true },
      });
    }

    let grant = await tx.studentGuardianGrant.findUnique({
      where: {
        linkId_institutionId: {
          linkId: link.id,
          institutionId: row.institutionId,
        },
      },
      select: { id: true, status: true },
    });

    if (grant && (grant.status === "PENDING" || grant.status === "APPROVED")) {
      return {
        studentId: row.studentId,
        linkId: link.id,
        grantId: grant.id,
        institutionId: row.institutionId,
        status: grant.status,
        alreadyLinked: true,
      };
    }

    if (grant) {
      // REJECTED / REVOKED: an explicit past decision for THIS institution is
      // reopened, but no other institution's grant or the link's isPrimary is
      // touched.
      grant = await tx.studentGuardianGrant.update({
        where: { id: grant.id },
        data: {
          status: "PENDING",
          requestedAt: now,
          approvedAt: null,
          approvedById: null,
          revokedAt: null,
          revokedById: null,
        },
        select: { id: true, status: true },
      });
    } else {
      grant = await tx.studentGuardianGrant.create({
        data: {
          linkId: link.id,
          institutionId: row.institutionId,
          status: "PENDING",
          requestedAt: now,
          approvedAt: null,
          approvedById: null,
        },
        select: { id: true, status: true },
      });
    }

    await tx.studentGuardianEvent.create({
      data: {
        studentId: row.studentId,
        linkId: link.id,
        guardianId: userId,
        institutionId: row.institutionId,
        action: "REQUESTED",
        dedupeKey: `grant-request:${row.id}`,
        note: "رمز انضمام أصدرته المؤسسة — ينتظر موافقة المركز",
      },
    });

    await refreshLinkSummary(tx, link.id);

    return {
      studentId: row.studentId,
      linkId: link.id,
      grantId: grant.id,
      institutionId: row.institutionId,
      status: "PENDING" as const,
      alreadyLinked: false,
    };
  });
}
