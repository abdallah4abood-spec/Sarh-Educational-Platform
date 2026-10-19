import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * POST /api/newsletter — public newsletter subscription (no auth required).
 *
 * This is the honest minimum for a landing page that promises a newsletter:
 * the address is validated, normalised and recorded on the server, and the
 * visitor gets an answer that reflects what actually happened. There is no
 * mailing-list integration yet, so the durable record is the server log — the
 * same contract the contact form uses while Resend is unconfigured.
 *
 * When an email provider and a list are wired up, this handler is the single
 * place that grows: validate → enqueue → send a welcome message. The response
 * shape and the client stay unchanged.
 */
const subscribeSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, { message: "الرجاء إدخال البريد الإلكتروني" })
    .email({ message: "صيغة البريد الإلكتروني غير صحيحة" }),
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

  const parsed = subscribeSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_EMAIL",
        message: parsed.error.issues[0]?.message ?? "بريد إلكتروني غير صالح",
      },
      { status: 400 }
    );
  }

  // ASCII labels keep the log greppable; the address itself round-trips intact.
  console.info(
    [
      "[newsletter] new subscriber",
      `  time:  ${new Date().toISOString()}`,
      `  email: ${parsed.data.email}`,
    ].join("\n")
  );

  return NextResponse.json(
    { success: true, message: "تم تسجيل بريدك في النشرة التعليمية" },
    { status: 200 }
  );
}
