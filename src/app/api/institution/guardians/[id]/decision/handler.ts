import { NextResponse } from "next/server";
import { z } from "zod";

import {
  decideGuardianLink,
  GuardianApprovalError,
  type GuardianApprovalErrorCode,
} from "@/lib/db/guardian-approvals";
import {
  InstitutionAccessDeniedError,
  resolveInstitutionAccess,
} from "@/lib/institution-access";

/**
 * HTTP mapping for `POST /api/institution/guardians/[id]/decision`.
 *
 * Split from `route.ts` (a Next.js route module may only export handlers) so the
 * status codes are testable without a NextAuth session. Authorisation is the
 * database-backed institution token, exactly as on the join-code route: the
 * `institution` selector chooses among the caller's real grants, it never
 * grants one.
 */

const bodySchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  /** Optional selector; the server still resolves it against the database. */
  institutionId: z.string().trim().min(1).max(64).optional(),
});

const ERROR_STATUS: Record<GuardianApprovalErrorCode, number> = {
  LINK_NOT_FOUND: 404,
  LINK_NOT_PENDING: 409,
  GRANT_NOT_FOUND: 404,
  GRANT_NOT_PENDING: 409,
  GRANT_NOT_APPROVED: 409,
  MISSING_REQUEST_EVENT: 409,
  GUARDIAN_NOT_ELIGIBLE: 409,
};

function failure(error: unknown) {
  if (error instanceof InstitutionAccessDeniedError) {
    return NextResponse.json(
      {
        success: false,
        code: "FORBIDDEN",
        message: "لا تملك صلاحية اعتماد طلبات الربط في هذه المؤسسة",
      },
      { status: 403 }
    );
  }
  if (error instanceof GuardianApprovalError) {
    return NextResponse.json(
      { success: false, code: error.code, message: error.message },
      { status: ERROR_STATUS[error.code] }
    );
  }
  console.error("[institution/guardians/decision] failed:", error);
  return NextResponse.json(
    {
      success: false,
      code: "INTERNAL_ERROR",
      message: "تعذّر تنفيذ الطلب — حاول مجدداً",
    },
    { status: 500 }
  );
}

export async function decideGuardianLinkResponse(
  userId: string,
  linkId: string,
  request: Request
) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_BODY",
        message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة",
      },
      { status: 400 }
    );
  }

  // A query selector wins over the body one; both are only selectors.
  const fromQuery = new URL(request.url).searchParams.get("institution");
  const access = await resolveInstitutionAccess(
    userId,
    fromQuery || parsed.data.institutionId || null
  );
  if (!access) {
    return NextResponse.json(
      {
        success: false,
        code: "FORBIDDEN",
        message: "لا تملك صلاحية إدارة هذه المؤسسة",
      },
      { status: 403 }
    );
  }

  try {
    const result = await decideGuardianLink(
      access,
      linkId,
      parsed.data.decision
    );
    return NextResponse.json({
      success: true,
      link: {
        id: result.linkId,
        status: result.status,
        isPrimary: result.isPrimary,
      },
    });
  } catch (error) {
    return failure(error);
  }
}
