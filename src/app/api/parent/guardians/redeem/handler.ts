import { NextResponse } from "next/server";
import { z } from "zod";

import {
  redeemStudentJoinCode,
  JoinCodeError,
  type JoinCodeErrorCode,
} from "@/lib/db/student-join-codes";
import {
  checkRateLimit,
  clearFailures,
  recordFailure,
} from "@/lib/rate-limit";

/**
 * HTTP mapping for `POST /api/parent/guardians/redeem`.
 *
 * The body names a **code**, never a student: the code alone decides which
 * child the institution is offering, so a crafted payload cannot ask for
 * someone else's records.
 *
 * Failed attempts are throttled per signed-in account (10 failures / 15 min,
 * `429` + `Retry-After`). The counter is **in-process only**: it resets on
 * restart, is not shared between instances, and is an abuse brake rather than
 * a security boundary. Successes clear it; server errors never consume it; the
 * submitted code is never logged.
 */

const bodySchema = z.object({
  code: z.string().trim().min(4, "أدخل رمز الدعوة").max(40),
});

const ERROR_STATUS: Record<JoinCodeErrorCode, number> = {
  STUDENT_NOT_IN_INSTITUTION: 404,
  INVALID_CODE: 400,
  NOT_A_GUARDIAN: 403,
  CODE_NOT_FOUND: 404,
  CODE_EXPIRED: 410,
  CODE_ALREADY_USED: 409,
  STUDENT_NOT_ENROLLED: 409,
};

/**
 * Only a guess or a stale input consumes quota.
 *
 * `STUDENT_NOT_ENROLLED` is a *valid* code whose child left the centre, and
 * `NOT_A_GUARDIAN` is an account-eligibility refusal: neither is a guess, and
 * counting them would let either lock a legitimate guardian out.
 */
const COUNTED_FAILURES: ReadonlySet<JoinCodeErrorCode> = new Set([
  "INVALID_CODE",
  "CODE_NOT_FOUND",
  "CODE_EXPIRED",
  "CODE_ALREADY_USED",
]);

export async function redeemJoinCodeResponse(userId: string, request: Request) {
  const limitKey = `redeem:${userId}`;
  const limit = checkRateLimit(limitKey);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        success: false,
        code: "RATE_LIMITED",
        message: "محاولات كثيرة — انتظر قليلاً ثم حاول مجدداً",
      },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      }
    );
  }

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

  try {
    const redeemed = await redeemStudentJoinCode(userId, parsed.data.code);
    // A success is not a failure: forget the account's failed attempts.
    clearFailures(limitKey);
    return NextResponse.json({ success: true, ...redeemed }, { status: 200 });
  } catch (error) {
    if (error instanceof JoinCodeError) {
      if (COUNTED_FAILURES.has(error.code)) recordFailure(limitKey);
      return NextResponse.json(
        { success: false, code: error.code, message: error.message },
        { status: ERROR_STATUS[error.code] }
      );
    }
    console.error("[parent/guardians/redeem] failed:", error);
    return NextResponse.json(
      {
        success: false,
        code: "INTERNAL_ERROR",
        message: "تعذّر ربط الطالب — حاول مجدداً",
      },
      { status: 500 }
    );
  }
}
