import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createInstitutionStudent,
  InstitutionStudentError,
  type InstitutionStudentErrorCode,
} from "@/lib/db/institution-students";
import {
  InstitutionAccessDeniedError,
  resolveInstitutionAccess,
} from "@/lib/institution-access";

/**
 * The authenticated part of `POST /api/institution/students`.
 *
 * Split from `route.ts` for two reasons: a Next.js route module may only export
 * route handlers (so a helper cannot live there), and the HTTP status codes
 * need to be testable without minting a NextAuth session cookie.
 *
 * Authorisation is resolved from the **database** on every call
 * (`resolveInstitutionAccess`: ownership or an ACTIVE `CENTER_ADMIN`
 * membership). `institutionId` in the body is a selector, never a grant: a
 * centre the account does not own or administer resolves to `null` and is
 * answered with 403, exactly like a non-existent one.
 *
 * `Idempotency-Key` (optional, one per form submission) makes a retried
 * submission answer with the original ids instead of `409`. The duplicate rule
 * itself does not depend on the header — it is enforced in the service under an
 * advisory lock.
 */

const bodySchema = z.object({
  /** Optional selector; omitted means the account's default centre. */
  institutionId: z.string().trim().min(1).max(64).optional(),
  fullName: z.string().trim().min(2, "اسم الطالب قصير جداً").max(120),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ الميلاد غير صالح"),
  gradeLevel: z.string().trim().min(1, "الصف الدراسي مطلوب").max(40),
  /** Optional class placement; must belong to the same centre. */
  classId: z.string().trim().min(1).max(64).nullable().optional(),
});

const ERROR_STATUS: Record<InstitutionStudentErrorCode, number> = {
  CLASS_NOT_IN_INSTITUTION: 400,
  DUPLICATE_STUDENT: 409,
  INVALID_IDEMPOTENCY_KEY: 400,
  INVALID_NAME: 400,
  INVALID_DATE_OF_BIRTH: 400,
  INVALID_GRADE_LEVEL: 400,
};

export async function createStudentResponse(userId: string, request: Request) {
  const parsed = bodySchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_BODY",
        message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { institutionId, classId, ...rest } = parsed.data;
  const access = await resolveInstitutionAccess(userId, institutionId);
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
    const created = await createInstitutionStudent(access, {
      fullName: rest.fullName,
      dateOfBirth: new Date(`${rest.dateOfBirth}T00:00:00`),
      gradeLevel: rest.gradeLevel,
      classId: classId ?? null,
      idempotencyKey: request.headers.get("idempotency-key"),
    });

    // 201 for a new student, 200 when this exact submission is being replayed.
    // Both are written only after the transaction committed.
    const { replayed, ...ids } = created;
    return NextResponse.json(
      { success: true, ...ids, ...(replayed ? { replayed: true } : {}) },
      { status: replayed ? 200 : 201 }
    );
  } catch (error) {
    if (error instanceof InstitutionAccessDeniedError) {
      return NextResponse.json(
        {
          success: false,
          code: "FORBIDDEN",
          message: "لا تملك صلاحية إضافة الطلاب في هذه المؤسسة",
        },
        { status: 403 }
      );
    }
    if (error instanceof InstitutionStudentError) {
      return NextResponse.json(
        { success: false, code: error.code, message: error.message },
        { status: ERROR_STATUS[error.code] }
      );
    }
    console.error("[institution/students] create failed:", error);
    return NextResponse.json(
      {
        success: false,
        code: "INTERNAL_ERROR",
        message: "تعذّر حفظ الطالب — حاول مجدداً",
      },
      { status: 500 }
    );
  }
}
