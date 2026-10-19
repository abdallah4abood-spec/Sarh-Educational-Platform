import { NextResponse } from "next/server";
import { z } from "zod";

import { maskEmail } from "@/lib/identifier";
import { consumeResetToken, peekResetToken } from "@/lib/password-reset";

/**
 * Password recovery redemption.
 *
 *   GET  ?token=…        → is this link still usable? (read-only, for the page)
 *   POST { token, password } → set the new password and burn the token
 *
 * The GET exists so `/auth/reset-password` can explain an expired or already
 * used link instead of showing a form that only fails on submit. It returns a
 * masked address, never the full one.
 */

// Module-local: Next.js only allows HTTP handlers and route config to be
// exported from a route file.
const TOKEN_REASON_CODES = {
  NOT_FOUND: { code: "INVALID_TOKEN", message: "رابط إعادة التعيين غير صالح أو استُخدم من قبل." },
  EXPIRED: { code: "EXPIRED_TOKEN", message: "انتهت صلاحية رابط إعادة التعيين، اطلب رابطاً جديداً." },
  DB_UNAVAILABLE: { code: "DB_UNAVAILABLE", message: "تعذّر التحقق من الرابط الآن، حاول مرة أخرى بعد قليل." },
} as const;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";

  if (!token) {
    return NextResponse.json(
      { valid: false, ...TOKEN_REASON_CODES.NOT_FOUND },
      { status: 400 }
    );
  }

  const lookup = await peekResetToken(token);

  if (!lookup.ok) {
    const mapped = TOKEN_REASON_CODES[lookup.reason];
    return NextResponse.json(
      { valid: false, ...mapped },
      { status: lookup.reason === "DB_UNAVAILABLE" ? 503 : 400 }
    );
  }

  return NextResponse.json(
    { valid: true, email: maskEmail(lookup.email) },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}

/** Mirrors the client-side strength rules so both agree on what is acceptable. */
const resetSchema = z.object({
  token: z.string().trim().min(16, { message: "رابط إعادة التعيين غير صالح" }),
  password: z
    .string()
    .min(8, { message: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" })
    .regex(/[A-Za-z\u0600-\u06FF]/, {
      message: "كلمة المرور يجب أن تحتوي على حروف وأرقام",
    })
    .regex(/[0-9\u0660-\u0669]/, {
      message: "كلمة المرور يجب أن تحتوي على حروف وأرقام",
    }),
});

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_INPUT", message: "صيغة الطلب غير صحيحة" },
      { status: 400 }
    );
  }

  const parsed = resetSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_INPUT",
        message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة",
      },
      { status: 400 }
    );
  }

  const outcome = await consumeResetToken(
    parsed.data.token,
    parsed.data.password
  );

  if (!outcome.ok) {
    const mapped = TOKEN_REASON_CODES[outcome.reason];
    return NextResponse.json(
      { success: false, ...mapped },
      { status: outcome.reason === "DB_UNAVAILABLE" ? 503 : 400 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      email: maskEmail(outcome.email),
      message: "تم تعيين كلمة المرور الجديدة بنجاح، يمكنك تسجيل الدخول الآن.",
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
