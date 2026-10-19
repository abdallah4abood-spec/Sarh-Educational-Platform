import { NextResponse } from "next/server";
import { z } from "zod";

import { sendContactEmail } from "@/lib/email";

/**
 * POST /api/contact — public contact form (no auth required).
 *
 * Route files may only export HTTP handlers, so the schema stays module-local.
 *
 * Delivery is best-effort by design. The visitor's message is written to the
 * server log first (the durable, always-available trail), then a notification
 * email is attempted. A mail provider that is unconfigured, rate-limited, or
 * rejecting the key must never turn a valid submission into a 5xx — the
 * message is already recorded, so the only honest answer is 202 Accepted.
 * Validation failures are still 400: those are the caller's fault, and the
 * body names the offending `field` so the UI can explain it locally.
 *
 * Lengths are deliberately permissive: a real query like "كم الرسوم؟" is ten
 * characters and must not be rejected as too short. Three characters is enough
 * to tell a real query from an accidental tap on submit.
 */
const contactSchema = z.object({
  name: z.string().trim().min(2, { message: "الرجاء إدخال الاسم" }),
  email: z
    .string()
    .trim()
    .min(1, { message: "الرجاء إدخال البريد الإلكتروني" })
    .email({ message: "صيغة البريد الإلكتروني غير صحيحة" }),
  subject: z.string().trim().min(3, { message: "الرجاء إدخال الموضوع" }),
  message: z
    .string()
    .trim()
    .min(3, { message: "يرجى كتابة رسالة واضحة لا تقل عن 3 أحرف" }),
});

/**
 * Machine-readable success copy for API clients. The AR/EN UI ignores it and
 * renders its own `contactSuccess` dictionary key, so English visitors do not
 * see Arabic text.
 */
const SUCCESS_MESSAGE = "تم إرسال الرسالة بنجاح";

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

  const parsed = contactSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_INPUT",
        // Machine-readable pointer to the offending input so the Arabic-only
        // `message` is never the only thing a bilingual UI can show.
        field: typeof issue?.path[0] === "string" ? issue.path[0] : null,
        message: issue?.message ?? "بيانات غير صالحة",
      },
      { status: 400 }
    );
  }

  const { name, email, subject, message } = parsed.data;

  // Always-on audit trail: the full submission, independent of the mail
  // provider's state. Field labels stay ASCII so the log is greppable.
  console.info(
    [
      "[contact] new submission",
      `  time:      ${new Date().toISOString()}`,
      `  Name:      ${name}`,
      `  Email:     ${email}`,
      `  Subject:   ${subject}`,
      `  Message:   ${message}`,
    ].join("\n")
  );

  // Notification email — informational only. `sendContactEmail` already
  // resolves to `{ sent: false }` instead of throwing; the try/catch is the
  // second line of defence for anything unexpected (e.g. a synchronous
  // template error), so this handler can never answer 500.
  try {
    const result = await sendContactEmail({ name, email, subject, message });

    if (result.sent) {
      console.info(`[contact] notification emailed to the support inbox`);
    } else {
      console.warn(
        `[contact] email not delivered (${result.code ?? "UNKNOWN"}) — submission retained in the server log`
      );
    }
  } catch (error) {
    console.error(
      "[contact] unexpected mail failure — submission retained in the server log:",
      error
    );
  }

  // Deliberately no `emailSent` flag: it would be a lie when the provider is
  // unconfigured, and the visitor cannot act on it anyway. The real delivery
  // outcome is in the server log.
  return NextResponse.json(
    { success: true, message: SUCCESS_MESSAGE },
    { status: 202 }
  );
}
