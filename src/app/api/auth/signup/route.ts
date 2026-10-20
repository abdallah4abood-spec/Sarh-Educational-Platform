import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";
import { PUBLIC_SIGNUP_ROLE, SELF_SERVICE_ROLES } from "@/lib/roles";
import {
  isPhoneNumber,
  normalizePhone,
  phoneMatchSuffix,
} from "@/lib/phone";
import {
  buildVerificationUrl,
  createVerificationToken,
} from "@/lib/verification";

/**
 * POST /api/auth/signup — create a SARH account.
 *
 * The password is hashed with bcrypt (cost 12 — the same algorithm the
 * credentials provider compares against), so a freshly created account can
 * sign in immediately through NextAuth.
 *
 * Every credential account starts with `emailVerified = null`: a one-time
 * token is stored and mailed, and `middleware.ts` keeps the portals closed
 * until the link is opened. Google accounts skip this (Google already proved
 * ownership of the address — see the `jwt` callback in src/lib/auth.ts).
 *
 * The tier is decided by the server. `role` may appear in the body (the form
 * still carries the visitor's choice so the refusal can be explained), but it
 * is only ever a *request*: anything outside `SELF_SERVICE_ROLES` is refused
 * with `ROLE_REQUIRES_INVITATION`, and the created row always gets
 * `PUBLIC_SIGNUP_ROLE`. Staff tiers come from a staff membership or an
 * administrative grant, never from this endpoint.
 */
// Route files may only export HTTP handlers, so this schema stays module-local.
const signupRequestSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, { message: "الرجاء إدخال اسمك الكامل" }),
  email: z
    .string()
    .trim()
    .min(1, { message: "الرجاء إدخال البريد الإلكتروني" })
    .email({ message: "صيغة البريد الإلكتروني غير صحيحة" }),
  password: z
    .string()
    .min(8, { message: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" })
    .regex(/[A-Za-z]/, { message: "كلمة المرور يجب أن تحتوي على حروف وأرقام" })
    .regex(/[0-9]/, { message: "كلمة المرور يجب أن تحتوي على حروف وأرقام" }),
  // Optional alternate identifier — an account can always sign in with it.
  phoneNumber: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined))
    .refine((value) => value === undefined || isPhoneNumber(value), {
      message: "رقم الجوال غير صحيح",
    }),
  // Not even representable: platform administration is granted, never
  // registered for. A body carrying it fails validation (400) below.
  role: z
    .enum(["PARENT", "INSTITUTION_TEACHER", "TEACHER", "SUPERVISOR"])
    .default(PUBLIC_SIGNUP_ROLE),
  // Enforced server-side too: a client that skips the checkbox cannot create
  // an account, and the moment of consent is recorded on the row.
  acceptedTerms: z.literal(true, {
    message: "يجب الموافقة على الشروط وسياسة الخصوصية للمتابعة",
  }),
});

/** Stable machine codes so the client can localize every failure. */
export type SignupErrorCode =
  | "INVALID_INPUT"
  | "EMAIL_IN_USE"
  | "PHONE_IN_USE"
  | "ROLE_REQUIRES_INVITATION"
  | "DB_UNAVAILABLE"
  | "UNKNOWN";

function fail(code: SignupErrorCode, status: number, message: string) {
  return NextResponse.json({ success: false, code, message }, { status });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return fail("INVALID_INPUT", 400, "صيغة الطلب غير صحيحة");
  }

  const parsed = signupRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return fail(
      "INVALID_INPUT",
      400,
      parsed.error.issues[0]?.message ?? "بيانات غير صالحة"
    );
  }

  // Fail closed on the tier before touching the database: the public form may
  // create the general account only.
  if (!SELF_SERVICE_ROLES.includes(parsed.data.role)) {
    return fail(
      "ROLE_REQUIRES_INVITATION",
      403,
      "حساب المعلم أو المشرف أو إدارة المؤسسة يُمنح من المؤسسة أو من إدارة المنصة، ولا يُنشأ من التسجيل العام"
    );
  }

  const { fullName, password } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  const phoneNumber = parsed.data.phoneNumber
    ? normalizePhone(parsed.data.phoneNumber)
    : null;

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      return fail("EMAIL_IN_USE", 409, "هذا البريد الإلكتروني مسجل بالفعل");
    }

    if (phoneNumber) {
      // Compared on the normalised form, plus the national-number suffix, so
      // `0599000000` cannot register a second account beside `+970599000000`.
      const suffix = phoneMatchSuffix(phoneNumber);
      const phoneTaken = await prisma.user.findFirst({
        where: suffix
          ? {
              OR: [
                { phoneNumber },
                { phoneNumber: { endsWith: suffix } },
              ],
            }
          : { phoneNumber },
        select: { id: true },
      });

      if (phoneTaken) {
        return fail("PHONE_IN_USE", 409, "رقم الجوال مسجل بالفعل");
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        fullName: fullName.trim(),
        email,
        phoneNumber,
        passwordHash,
        // The constant, never the request value: the two are equal today, and
        // this line is what keeps them equal if the schema is ever widened.
        role: PUBLIC_SIGNUP_ROLE,
        emailVerified: null,
        termsAcceptedAt: new Date(),
      },
      select: { id: true, email: true, fullName: true, role: true },
    });

    // Issue the single-use link and mail it. A failing mail provider must not
    // fail the signup: the account exists, the link is logged below, and the
    // UI tells the user a verification email is on the way.
    const token = await createVerificationToken(email);
    const url = buildVerificationUrl(token);
    const delivery = await sendVerificationEmail({
      to: email,
      name: user.fullName,
      url,
    });

    if (!delivery.sent) {
      console.warn(
        `[signup] verification email not delivered (${delivery.code ?? "unknown"}) — link for ${email}: ${url}`
      );
    }

    return NextResponse.json(
      {
        success: true,
        user,
        verification: { required: true, emailSent: delivery.sent },
      },
      { status: 201 }
    );
  } catch (error) {
    // A racing duplicate registration still resolves to the friendly 409 —
    // the conflicting column decides which message the user sees.
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "P2002"
    ) {
      const target = String(
        (error as { meta?: { target?: string[] | string } }).meta?.target ?? ""
      );
      return target.includes("phoneNumber")
        ? fail("PHONE_IN_USE", 409, "رقم الجوال مسجل بالفعل")
        : fail("EMAIL_IN_USE", 409, "هذا البريد الإلكتروني مسجل بالفعل");
    }

    console.error("[signup] failed:", error);
    const unreachable =
      typeof error === "object" &&
      error !== null &&
      ["P1001", "P1000", "P1017"].includes((error as { code?: string }).code ?? "");

    return fail(
      unreachable ? "DB_UNAVAILABLE" : "UNKNOWN",
      unreachable ? 503 : 500,
      "تعذّر إنشاء الحساب، حاول مرة أخرى بعد قليل."
    );
  }
}
