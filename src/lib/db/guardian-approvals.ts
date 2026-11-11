import { prisma } from "@/lib/prisma";
import { acquireAdvisoryLock } from "@/lib/db/advisory-lock";
import {
  requireCapability,
  type InstitutionAccess,
} from "@/lib/institution-access";
import { effectiveRoles } from "@/lib/roles";
import type {
  ApprovedGuardianRow,
  GuardianApprovalRow,
} from "@/lib/data/institution";
import type { GuardianRequestRow } from "@/lib/data/portal";

/**
 * Guardianship approval queue — phase 4.3.
 *
 * The only decision is per institution: `StudentGuardianGrant`. The family
 * link (`StudentGuardian`) is not approved globally any more; its `status` is
 * a synchronised summary of its grants. `isPrimary` is a one-time family
 * designation and is never changed by adding, rejecting, revoking or
 * re-requesting a grant.
 */

export type GuardianApprovalErrorCode =
  | "LINK_NOT_FOUND"
  | "LINK_NOT_PENDING"
  | "GRANT_NOT_FOUND"
  | "GRANT_NOT_PENDING"
  | "GRANT_NOT_APPROVED"
  | "MISSING_REQUEST_EVENT"
  | "GUARDIAN_NOT_ELIGIBLE";

export class GuardianApprovalError extends Error {
  constructor(
    readonly code: GuardianApprovalErrorCode,
    message: string
  ) {
    super(message);
    this.name = "GuardianApprovalError";
  }
}

export type GuardianDecision = "APPROVE" | "REJECT";

export interface GuardianDecisionResult {
  linkId: string;
  status: "APPROVED" | "REJECTED";
  isPrimary: boolean;
}

export interface GrantDecisionResult extends GuardianDecisionResult {
  grantId: string;
  institutionId: string;
}

export interface GrantRevokeResult {
  grantId: string;
  linkId: string;
  status: "REVOKED";
}

/** Pending grants this centre may decide, oldest first. */
export async function loadPendingGuardianApprovals(
  access: InstitutionAccess,
  take = 50
): Promise<GuardianApprovalRow[]> {
  requireCapability(access, "guardians.read");

  const rows = await prisma.studentGuardianGrant.findMany({
    where: {
      institutionId: access.institutionId,
      status: "PENDING",
      link: {
        student: {
          enrollments: {
            some: {
              institutionId: access.institutionId,
              enrollmentStatus: "ACTIVE",
            },
          },
        },
      },
    },
    select: {
      id: true,
      requestedAt: true,
      institutionId: true,
      link: {
        select: {
          id: true,
          studentId: true,
          relation: true,
          student: { select: { fullName: true } },
          user: { select: { fullName: true, email: true } },
        },
      },
    },
    orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
    take,
  });

  return rows.map((row) => ({
    grantId: row.id,
    linkId: row.link.id,
    studentId: row.link.studentId,
    studentName: row.link.student.fullName,
    guardianName: row.link.user.fullName,
    guardianEmail: row.link.user.email,
    relation: row.link.relation,
    requestedAt: row.requestedAt.toISOString(),
    institutionId: row.institutionId,
    originInstitutionId: row.institutionId,
  }));
}

/** Approved grants at this centre for actively enrolled students. */
export async function loadApprovedGuardians(
  access: InstitutionAccess,
  take = 100
): Promise<ApprovedGuardianRow[]> {
  requireCapability(access, "guardians.read");

  const rows = await prisma.studentGuardianGrant.findMany({
    where: {
      institutionId: access.institutionId,
      status: "APPROVED",
      link: {
        student: {
          enrollments: {
            some: {
              institutionId: access.institutionId,
              enrollmentStatus: "ACTIVE",
            },
          },
        },
      },
    },
    select: {
      id: true,
      institutionId: true,
      approvedAt: true,
      link: {
        select: {
          id: true,
          isPrimary: true,
          student: { select: { fullName: true } },
          user: { select: { fullName: true, email: true } },
        },
      },
    },
    orderBy: [
      { link: { isPrimary: "desc" } },
      { approvedAt: "asc" },
      { id: "asc" },
    ],
    take,
  });

  return rows.map((row) => ({
    grantId: row.id,
    linkId: row.link.id,
    institutionId: row.institutionId,
    studentName: row.link.student.fullName,
    guardianName: row.link.user.fullName,
    guardianEmail: row.link.user.email,
    isPrimary: row.link.isPrimary,
    approvedAt: row.approvedAt?.toISOString() ?? null,
  }));
}

/** The signed-in guardian's own PENDING/REJECTED grant requests. */
export async function loadOwnLinkRequests(
  userId: string,
  take = 20
): Promise<GuardianRequestRow[]> {
  const rows = await prisma.studentGuardianGrant.findMany({
    where: {
      status: { in: ["PENDING", "REJECTED", "REVOKED"] },
      link: { userId },
    },
    select: {
      id: true,
      status: true,
      requestedAt: true,
      institution: { select: { name: true } },
      link: {
        select: {
          id: true,
          student: { select: { fullName: true } },
        },
      },
    },
    orderBy: [{ requestedAt: "desc" }, { id: "asc" }],
    take,
  });

  return rows.map((row) => ({
    grantId: row.id,
    linkId: row.link.id,
    studentName: row.link.student.fullName,
    institutionName: row.institution.name,
    status:
      row.status === "REJECTED"
        ? "REJECTED"
        : row.status === "REVOKED"
          ? "REVOKED"
          : "PENDING",
    requestedAt: row.requestedAt.toISOString(),
  }));
}

/**
 * Recompute the display summary on `StudentGuardian` from its grants.
 * This is not an authorisation source; access always reads the grant row.
 */
export async function refreshLinkSummary(
  tx: Parameters<typeof acquireAdvisoryLock>[0],
  linkId: string
): Promise<"APPROVED" | "PENDING" | "REJECTED" | "REVOKED"> {
  const grants = await tx.studentGuardianGrant.findMany({
    where: { linkId },
    select: { status: true, approvedAt: true, revokedAt: true },
  });

  const approved = grants.filter((grant) => grant.status === "APPROVED");
  const status =
    approved.length > 0
      ? "APPROVED"
      : grants.some((grant) => grant.status === "PENDING")
        ? "PENDING"
        : grants.some((grant) => grant.status === "REJECTED")
          ? "REJECTED"
          : grants.some((grant) => grant.status === "REVOKED")
            ? "REVOKED"
            : null;

  if (!status) return "PENDING";

  const approvedAt = approved.length
    ? new Date(
        Math.min(...approved.map((grant) => grant.approvedAt?.getTime() ?? 0))
      )
    : null;
  const revokedAt = status === "REVOKED"
    ? new Date(
        Math.max(
          ...grants
            .filter((grant) => grant.status === "REVOKED")
            .map((grant) => grant.revokedAt?.getTime() ?? 0)
        )
      )
    : null;

  await tx.studentGuardian.update({
    where: { id: linkId },
    data: {
      status,
      approvedAt: status === "APPROVED" ? approvedAt : null,
      revokedAt,
    },
  });

  return status;
}

async function latestRequestEvent(
  tx: Parameters<typeof acquireAdvisoryLock>[0],
  linkId: string,
  institutionId: string
) {
  return tx.studentGuardianEvent.findFirst({
    where: {
      linkId,
      action: "REQUESTED",
      OR: [{ institutionId }, { institutionId: null }],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, institutionId: true },
  });
}

async function decideGrant(
  access: InstitutionAccess,
  grantId: string,
  decision: GuardianDecision
): Promise<GrantDecisionResult> {
  requireCapability(access, "guardians.approve");

  const id = grantId?.trim();
  if (!id) {
    throw new GuardianApprovalError("GRANT_NOT_FOUND", "طلب الربط غير موجود");
  }

  return prisma.$transaction(
    async (tx) => {
      const grant = await tx.studentGuardianGrant.findUnique({
        where: { id },
        select: {
          id: true,
          institutionId: true,
          status: true,
          link: {
            select: {
              id: true,
              studentId: true,
              userId: true,
              status: true,
              isPrimary: true,
              approvedAt: true,
              user: { select: { role: true, roles: true, emailVerified: true } },
            },
          },
        },
      });
      if (!grant || grant.institutionId !== access.institutionId) {
        throw new GuardianApprovalError("GRANT_NOT_FOUND", "طلب الربط غير موجود");
      }
      if (grant.status !== "PENDING") {
        throw new GuardianApprovalError(
          "GRANT_NOT_PENDING",
          "تمت معالجة هذا الطلب مسبقاً"
        );
      }

      if (decision === "APPROVE") {
        const enrollment = await tx.enrollment.findFirst({
          where: {
            studentId: grant.link.studentId,
            institutionId: access.institutionId,
            enrollmentStatus: "ACTIVE",
          },
          select: { id: true },
        });
        if (!enrollment) {
          throw new GuardianApprovalError(
            "GRANT_NOT_FOUND",
            "طلب الربط غير موجود"
          );
        }
        if (
          !grant.link.user.emailVerified ||
          !effectiveRoles(grant.link.user.role, grant.link.user.roles).includes(
            "PARENT"
          )
        ) {
          throw new GuardianApprovalError(
            "GUARDIAN_NOT_ELIGIBLE",
            "حساب ولي الأمر لم يعد مؤهلاً — يبقى الطلب معلّقاً"
          );
        }
      }

      // One lock for the whole family link: decisions at A and B for the same
      // child/guardian cannot lose each other's summary or primary update.
      await acquireAdvisoryLock(
        tx,
        `guardian-link:${grant.link.studentId}:${grant.link.userId}`
      );

      const fresh = await tx.studentGuardianGrant.findUnique({
        where: { id },
        select: { status: true },
      });
      if (fresh?.status !== "PENDING") {
        throw new GuardianApprovalError(
          "GRANT_NOT_PENDING",
          "تمت معالجة هذا الطلب مسبقاً"
        );
      }

      const requestEvent = await latestRequestEvent(
        tx,
        grant.link.id,
        access.institutionId
      );
      if (!requestEvent) {
        throw new GuardianApprovalError(
          "MISSING_REQUEST_EVENT",
          "لا يوجد حدث طلب صحيح لهذا الربط — يحتاج مراجعة يدوية"
        );
      }

      const now = new Date();

      if (decision === "REJECT") {
        const rejected = await tx.studentGuardianGrant.updateMany({
          where: { id, status: "PENDING" },
          data: {
            status: "REJECTED",
            approvedAt: null,
            approvedById: null,
            revokedAt: null,
            revokedById: null,
          },
        });
        if (rejected.count !== 1) {
          throw new GuardianApprovalError(
            "GRANT_NOT_PENDING",
            "تمت معالجة هذا الطلب مسبقاً"
          );
        }

        await tx.studentGuardianEvent.create({
          data: {
            studentId: grant.link.studentId,
            linkId: grant.link.id,
            guardianId: access.userId,
            institutionId: access.institutionId,
            action: "REJECTED",
            dedupeKey: `grant-decision:${requestEvent.id}`,
            note: "رفض طلب ربط ولي أمر من المركز",
          },
        });

        await refreshLinkSummary(tx, grant.link.id);
        return {
          grantId: id,
          institutionId: access.institutionId,
          linkId: grant.link.id,
          status: "REJECTED" as const,
          isPrimary: grant.link.isPrimary,
        };
      }

      // `isPrimary` is a one-time family designation. It may be set only on
      // the first-ever approval of a link, and only when no other link is
      // already primary. A grant that was approved before and later revoked
      // still counts as a prior approval, so re-requesting after a withdrawal
      // can never flip the flag.
      const priorApprovals = await tx.studentGuardianGrant.count({
        where: {
          linkId: grant.link.id,
          id: { not: id },
          approvedAt: { not: null },
        },
      });
      const firstApprovalForLink =
        priorApprovals === 0 && grant.link.status !== "APPROVED";
      await tx.studentGuardianGrant.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedAt: now,
          approvedById: access.userId,
          revokedAt: null,
          revokedById: null,
        },
      });

      let isPrimary = grant.link.isPrimary;
      if (firstApprovalForLink) {
        await acquireAdvisoryLock(tx, `guardian-primary:${grant.link.studentId}`);
        const otherPrimary = await tx.studentGuardian.count({
          where: {
            studentId: grant.link.studentId,
            isPrimary: true,
            id: { not: grant.link.id },
          },
        });
        if (otherPrimary === 0 && !grant.link.isPrimary) {
          await tx.studentGuardian.update({
            where: { id: grant.link.id },
            data: { isPrimary: true, approvedAt: grant.link.approvedAt ?? now },
          });
          isPrimary = true;
        } else if (!grant.link.approvedAt) {
          await tx.studentGuardian.update({
            where: { id: grant.link.id },
            data: { approvedAt: now },
          });
        }
      }

      await tx.studentGuardianEvent.create({
        data: {
          studentId: grant.link.studentId,
          linkId: grant.link.id,
          guardianId: access.userId,
          institutionId: access.institutionId,
          action: "APPROVED",
          dedupeKey: `grant-decision:${requestEvent.id}`,
          note: "اعتماد طلب ربط ولي أمر من المركز",
        },
      });

      await refreshLinkSummary(tx, grant.link.id);

      return {
        grantId: id,
        institutionId: access.institutionId,
        linkId: grant.link.id,
        status: "APPROVED" as const,
        isPrimary,
      };
    },
    { timeout: 15_000, maxWait: 10_000 }
  );
}

/** Approve or reject one pending grant. */
export async function decideGuardianGrant(
  access: InstitutionAccess,
  grantId: string,
  decision: GuardianDecision
): Promise<GrantDecisionResult> {
  return decideGrant(access, grantId, decision);
}

/**
 * Revoke an approved grant. Allowed even if the seat is now withdrawn: the
 * institution may cut historical access without deleting records.
 */
export async function revokeGuardianGrant(
  access: InstitutionAccess,
  grantId: string
): Promise<GrantRevokeResult> {
  requireCapability(access, "guardians.approve");

  const id = grantId?.trim();
  if (!id) {
    throw new GuardianApprovalError("GRANT_NOT_FOUND", "المنحة غير موجودة");
  }

  return prisma.$transaction(
    async (tx) => {
      const grant = await tx.studentGuardianGrant.findUnique({
        where: { id },
        select: {
          id: true,
          institutionId: true,
          status: true,
          approvedAt: true,
          link: { select: { id: true, studentId: true, userId: true } },
        },
      });
      if (!grant || grant.institutionId !== access.institutionId) {
        throw new GuardianApprovalError("GRANT_NOT_FOUND", "المنحة غير موجودة");
      }
      if (grant.status !== "APPROVED") {
        throw new GuardianApprovalError(
          "GRANT_NOT_APPROVED",
          "لا يمكن سحب منحة غير معتمدة"
        );
      }

      await acquireAdvisoryLock(
        tx,
        `guardian-link:${grant.link.studentId}:${grant.link.userId}`
      );

      const fresh = await tx.studentGuardianGrant.findUnique({
        where: { id },
        select: { status: true },
      });
      if (fresh?.status !== "APPROVED") {
        throw new GuardianApprovalError(
          "GRANT_NOT_APPROVED",
          "لا يمكن سحب منحة غير معتمدة"
        );
      }

      const now = new Date();
      await tx.studentGuardianGrant.update({
        where: { id },
        data: {
          status: "REVOKED",
          revokedAt: now,
          revokedById: access.userId,
        },
      });

      // isPrimary is deliberately untouched.
      await refreshLinkSummary(tx, grant.link.id);

      await tx.studentGuardianEvent.create({
        data: {
          studentId: grant.link.studentId,
          linkId: grant.link.id,
          guardianId: access.userId,
          institutionId: access.institutionId,
          action: "REVOKED",
          dedupeKey: `grant-revoke:${grant.id}:${grant.approvedAt?.toISOString() ?? "none"}`,
          note: "سحب اعتماد ولي أمر من المركز",
        },
      });

      return {
        grantId: id,
        linkId: grant.link.id,
        status: "REVOKED" as const,
      };
    },
    { timeout: 15_000, maxWait: 10_000 }
  );
}

/**
 * Backward-compatible link-based decision used by the 4.2 tests and any
 * caller that only knows a link id. It resolves the grant for the caller's
 * institution (creating a PENDING row for a legacy request) and delegates to
 * `decideGuardianGrant`. New UI/API code uses grant ids directly.
 */
export async function decideGuardianLink(
  access: InstitutionAccess,
  linkId: string,
  decision: GuardianDecision
): Promise<GuardianDecisionResult> {
  requireCapability(access, "guardians.approve");

  const id = linkId?.trim();
  if (!id) {
    throw new GuardianApprovalError("LINK_NOT_FOUND", "طلب الربط غير موجود");
  }

  const link = await prisma.studentGuardian.findUnique({
    where: { id },
    select: { id: true, studentId: true, userId: true, status: true },
  });
  if (!link) {
    throw new GuardianApprovalError("LINK_NOT_FOUND", "طلب الربط غير موجود");
  }

  let grant = await prisma.studentGuardianGrant.findUnique({
    where: {
      linkId_institutionId: {
        linkId: link.id,
        institutionId: access.institutionId,
      },
    },
    select: { id: true },
  });

  if (!grant) {
    // A centre can only decide a request it actually opened. Without this
    // guard, a foreign centre would create its own PENDING grant here and
    // then fail with a confusing MISSING_REQUEST_EVENT instead of 404.
    const requestEvent = await prisma.studentGuardianEvent.findFirst({
      where: {
        linkId: link.id,
        action: "REQUESTED",
        OR: [
          { institutionId: access.institutionId },
          { institutionId: null },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    if (!requestEvent) {
      const anyRequest = await prisma.studentGuardianEvent.findFirst({
        where: { linkId: link.id, action: "REQUESTED" },
        select: { id: true },
      });
      throw new GuardianApprovalError(
        anyRequest ? "LINK_NOT_FOUND" : "MISSING_REQUEST_EVENT",
        anyRequest
          ? "طلب الربط غير موجود"
          : "لا يوجد حدث طلب صحيح لهذا الربط — يحتاج مراجعة يدوية"
      );
    }
    if (link.status !== "PENDING") {
      throw new GuardianApprovalError(
        "LINK_NOT_PENDING",
        "تمت معالجة هذا الطلب مسبقاً"
      );
    }
    grant = await prisma.studentGuardianGrant.create({
      data: {
        linkId: link.id,
        institutionId: access.institutionId,
        status: "PENDING",
        requestedAt: new Date(),
      },
      select: { id: true },
    });
  }

  try {
    const result = await decideGuardianGrant(access, grant.id, decision);
    return {
      linkId: result.linkId,
      status: result.status,
      isPrimary: result.isPrimary,
    };
  } catch (error) {
    if (error instanceof GuardianApprovalError) {
      if (error.code === "GRANT_NOT_FOUND") {
        throw new GuardianApprovalError("LINK_NOT_FOUND", "طلب الربط غير موجود");
      }
      if (error.code === "GRANT_NOT_PENDING") {
        throw new GuardianApprovalError(
          "LINK_NOT_PENDING",
          "تمت معالجة هذا الطلب مسبقاً"
        );
      }
    }
    throw error;
  }
}
