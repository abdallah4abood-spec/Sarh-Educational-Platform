import { NextResponse } from "next/server";

import {
  GuardianApprovalError,
  revokeGuardianGrant,
  type GuardianApprovalErrorCode,
} from "@/lib/db/guardian-approvals";
import {
  InstitutionAccessDeniedError,
  resolveInstitutionAccess,
} from "@/lib/institution-access";

/**
 * HTTP mapping for `POST /api/institution/guardians/grants/[id]/revoke`.
 *
 * The id is a `StudentGuardianGrant` id, not a family-link id: revoking at one
 * centre must never touch the same family's grant at another centre. The
 * institution selector is a selector only; it is resolved against the caller's
 * real ownership/membership rows.
 */
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
        message: "لا تملك صلاحية سحب منح أولياء الأمور في هذه المؤسسة",
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
  console.error("[institution/guardians/revoke] failed:", error);
  return NextResponse.json(
    {
      success: false,
      code: "INTERNAL_ERROR",
      message: "تعذّر سحب المنحة — حاول مجدداً",
    },
    { status: 500 }
  );
}

export async function revokeGuardianGrantResponse(
  userId: string,
  grantId: string,
  request: Request
) {
  const fromQuery = new URL(request.url).searchParams.get("institution");
  let bodyInstitution: string | null = null;
  if (request.headers.get("content-type")?.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as
      | { institutionId?: unknown }
      | null;
    if (typeof body?.institutionId === "string") {
      bodyInstitution = body.institutionId.trim() || null;
    }
  }

  const access = await resolveInstitutionAccess(
    userId,
    fromQuery || bodyInstitution
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
    const result = await revokeGuardianGrant(access, grantId);
    return NextResponse.json({
      success: true,
      grant: {
        id: result.grantId,
        linkId: result.linkId,
        status: result.status,
      },
    });
  } catch (error) {
    return failure(error);
  }
}
