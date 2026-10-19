import { NextResponse } from "next/server";
import { z } from "zod";

import { isEmailConfigured, sendPasswordResetEmail } from "@/lib/email";
import { findUserByIdentifier } from "@/lib/identifier";
import { buildResetUrl, createResetToken } from "@/lib/password-reset";
import { isPhoneNumber, looksLikeEmail } from "@/lib/phone";

/**
 * POST /api/auth/forgot-password — request a recovery link.
 *
 * The identifier may be the account email or a registered phone number; both
 * resolve through the same lookup the sign-in form uses.
 *
 * The response is deliberately identical whether or not an account exists, so
 * the endpoint cannot be used to enumerate registered parents. The only thing
 * that varies is the *delivery* state, which reports whether a mail provider is
 * configured at all — never the outcome of the lookup. Reporting the real send
 * result would leak existence, because a missing account never attempts one.
 *
 * When no provider is configured the token is still issued and its URL is
 * logged, which keeps recovery usable on an offline dev machine. The link is
 * never returned in the response body: that would hand a hostile caller a
 * working reset for any address they can type.
 */
const requestSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, { message: "أدخل البريد الإلكتروني أو رقم الجوال" })
    .refine((value) => looksLikeEmail(value) || isPhoneNumber(value), {
      message: "أدخل بريداً إلكترونياً صحيحاً أو رقم جوال صحيحاً",
    }),
});

/** Same shape for every outcome — see the note about enumeration above. */
function uniformResponse() {
  const configured = isEmailConfigured();
  return NextResponse.json(
    {
      success: true,
      delivery: configured ? "configured" : "unavailable",
      message: configured
        ? "إن كان الحساب مسجّلاً فسنرسل رابط إعادة التعيين إلى بريده الإلكتروني."
        : "تعذّر إرسال البريد الآن (مزوّد البريد غير مُهيّأ). تواصل معنا لاستعادة حسابك.",
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_INPUT",
        message: "صيغة الطلب غير صحيحة",
      },
      { status: 400 }
    );
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_IDENTIFIER",
        message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة",
      },
      { status: 400 }
    );
  }

  try {
    const user = await findUserByIdentifier(parsed.data.identifier);

    // Unknown identifier: answer exactly as we would for a known one.
    if (!user) return uniformResponse();

    const token = await createResetToken(user.email);
    const url = buildResetUrl(token);

    const delivery = await sendPasswordResetEmail({
      to: user.email,
      name: user.fullName,
      url,
    });

    if (!delivery.sent) {
      console.warn(
        `[forgot-password] reset email not delivered (${delivery.code ?? "unknown"}) — link for ${user.email}: ${url}`
      );
    }

    return uniformResponse();
  } catch (error) {
    console.error("[forgot-password] failed:", error);
    const unreachable =
      typeof error === "object" &&
      error !== null &&
      ["P1001", "P1000", "P1017"].includes(
        (error as { code?: string }).code ?? ""
      );

    return NextResponse.json(
      {
        success: false,
        code: unreachable ? "DB_UNAVAILABLE" : "UNKNOWN",
        message: "تعذّر تنفيذ الطلب الآن، حاول مرة أخرى بعد قليل.",
      },
      { status: unreachable ? 503 : 500 }
    );
  }
}
