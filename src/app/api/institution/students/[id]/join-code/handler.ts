import { NextResponse } from "next/server";

import {
  issueStudentJoinCode,
  loadActiveJoinCode,
  revokeStudentJoinCodes,
  JoinCodeError,
  type JoinCodeErrorCode,
} from "@/lib/db/student-join-codes";
import {
  InstitutionAccessDeniedError,
  resolveInstitutionAccess,
} from "@/lib/institution-access";

/**
 * HTTP mapping for `/api/institution/students/[id]/join-code`.
 *
 * Split from `route.ts` (a Next.js route module may only export handlers) so the
 * status codes are testable without a NextAuth session. Authorisation is the
 * database-backed institution token, exactly as on the intake route: the
 * `institution` selector is a choice, never a grant.
 */

const ERROR_STATUS: Record<JoinCodeErrorCode, number> = {
  STUDENT_NOT_IN_INSTITUTION: 404,
  INVALID_CODE: 400,
  NOT_A_GUARDIAN: 403,
  CODE_NOT_FOUND: 404,
  CODE_EXPIRED: 410,
  CODE_ALREADY_USED: 409,
  STUDENT_NOT_ENROLLED: 409,
};

/** `?institution=` or `{ institutionId }`; absent means the default centre. */
async function selectedInstitution(request: Request): Promise<string | null> {
  const fromQuery = new URL(request.url).searchParams.get("institution");
  if (fromQuery) return fromQuery;

  const body = (await request.json().catch(() => null)) as
    | { institutionId?: unknown }
    | null;
  return typeof body?.institutionId === "string" ? body.institutionId : null;
}

function failure(error: unknown) {
  if (error instanceof InstitutionAccessDeniedError) {
    return NextResponse.json(
      {
        success: false,
        code: "FORBIDDEN",
        message: "لا تملك صلاحية دعوة أولياء الأمور في هذه المؤسسة",
      },
      { status: 403 }
    );
  }
  if (error instanceof JoinCodeError) {
    return NextResponse.json(
      { success: false, code: error.code, message: error.message },
      { status: ERROR_STATUS[error.code] }
    );
  }
  console.error("[institution/join-code] failed:", error);
  return NextResponse.json(
    {
      success: false,
      code: "INTERNAL_ERROR",
      message: "تعذّر تنفيذ الطلب — حاول مجدداً",
    },
    { status: 500 }
  );
}

export async function issueJoinCodeResponse(
  userId: string,
  studentId: string,
  request: Request
) {
  const access = await resolveInstitutionAccess(
    userId,
    await selectedInstitution(request)
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
    const issued = await issueStudentJoinCode(access, studentId);
    // The only response that ever contains the plaintext code.
    return NextResponse.json({ success: true, ...issued }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

/**
 * Read-only status: is a code live, and until when?
 *
 * Never returns the code itself — it is not stored. This is what lets the
 * dialog open without issuing anything and still tell the operator the truth.
 */
export async function getJoinCodeStatusResponse(
  userId: string,
  studentId: string,
  request: Request
) {
  const access = await resolveInstitutionAccess(
    userId,
    await selectedInstitution(request)
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
    const status = await loadActiveJoinCode(access, studentId);
    return NextResponse.json({ success: true, ...status });
  } catch (error) {
    return failure(error);
  }
}

export async function revokeJoinCodeResponse(
  userId: string,
  studentId: string,
  request: Request
) {
  const access = await resolveInstitutionAccess(
    userId,
    await selectedInstitution(request)
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
    const revoked = await revokeStudentJoinCodes(access, studentId);
    return NextResponse.json({ success: true, revoked });
  } catch (error) {
    return failure(error);
  }
}
