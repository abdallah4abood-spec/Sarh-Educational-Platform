"use client";

import { useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, MailCheck, Phone, ShieldAlert, User } from "lucide-react";

import {
  AuthDivider,
  AuthHeading,
  AuthNotice,
  AuthSplit,
  GoogleAuthButton,
  PasswordField,
  PasswordStrengthMeter,
  RoleTabs,
  TextField,
  type AuthRole,
} from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n/language-provider";
import { isPhoneNumber } from "@/lib/phone";
import { dashboardFor } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * Registration schema.
 *
 * Email stays the required account anchor because it is also the verification
 * channel that unlocks the portals; the phone number is an optional *alternate*
 * identifier that can be used to sign in or recover later. A phone-only account
 * is deliberately not offered: without an SMS provider it could never be
 * verified, so it would be created locked out of its own portal.
 */
const signupSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, { message: "الرجاء إدخال اسمك الكامل" }),
    email: z
      .string()
      .trim()
      .min(1, { message: "الرجاء إدخال البريد الإلكتروني" })
      .email({ message: "صيغة البريد الإلكتروني غير صحيحة" }),
    phoneNumber: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || isPhoneNumber(value), {
        message: "رقم الجوال غير صحيح",
      }),
    password: z
      .string()
      .min(8, { message: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" })
      .regex(/[A-Za-z\u0600-\u06FF]/, {
        message: "كلمة المرور يجب أن تحتوي على حروف وأرقام",
      })
      .regex(/[0-9\u0660-\u0669]/, {
        message: "كلمة المرور يجب أن تحتوي على حروف وأرقام",
      }),
    confirmPassword: z.string(),
    // Typed `boolean` (not `literal(true)`) so the unchecked default is a
    // legal form value; the refine is what actually requires consent.
    acceptedTerms: z.boolean().refine((checked) => checked, {
      message: "يجب الموافقة على الشروط وسياسة الخصوصية للمتابعة",
    }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["confirmPassword"],
  });

type SignupValues = z.infer<typeof signupSchema>;

/**
 * Per-role form copy.
 *
 * The account type is not cosmetic: a parent is enrolling a child, a center
 * owner is submitting something that gets licence-checked, and a teacher is
 * joining an existing center. Each case needs to say what the *name* field
 * means and what happens after submitting, so the tab genuinely adapts the
 * registration form instead of just switching a highlighted border.
 *
 * `nameLabel: null` reuses the neutral “full name” label.
 */
const ROLE_COPY = {
  PARENT: {
    subtitle: "signupSubtitleParent",
    nameLabel: null,
    nameHint: "signupNameHintParent",
  },
  INSTITUTION_TEACHER: {
    subtitle: "signupSubtitleInstitution",
    nameLabel: "signupNameLabelInstitution",
    nameHint: "signupNameHintInstitution",
  },
  TEACHER: {
    subtitle: "signupSubtitleTeacher",
    nameLabel: null,
    nameHint: "signupNameHintTeacher",
  },
  SUPERVISOR: {
    subtitle: "signupSubtitleSupervisor",
    nameLabel: null,
    nameHint: "signupNameHintSupervisor",
  },
} as const satisfies Record<
  AuthRole,
  { subtitle: string; nameLabel: string | null; nameHint: string }
>;

/** Server error codes → dictionary keys (see /api/auth/signup). */
const ERROR_KEYS = {
  EMAIL_IN_USE: "emailInUse",
  PHONE_IN_USE: "phoneInUse",
  INVALID_INPUT: null,
  DB_UNAVAILABLE: "registrationFailed",
  UNKNOWN: "registrationFailed",
} as const;

/**
 * `?role=` slug → account type.
 *
 * Lets a campaign link open the form already on the right tab — the teachers'
 * academy's "انضم كمعلم" button is the first caller, and /auth/signup?role=teacher
 * is the URL it hands out. An unknown or missing slug simply falls back to the
 * parent tab, so a hand-typed link can never land on an invalid state.
 */
const ROLE_PARAM: Record<string, AuthRole> = {
  parent: "PARENT",
  institution: "INSTITUTION_TEACHER",
  teacher: "TEACHER",
  supervisor: "SUPERVISOR",
};

export default function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const [role, setRole] = useState<AuthRole>(
    () => ROLE_PARAM[(searchParams.get("role") ?? "").toLowerCase()] ?? "PARENT"
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  // Once the account exists the portals stay closed until the emailed link is
  // opened, so the form is replaced by the "check your inbox" screen.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    mode: "onBlur",
    defaultValues: {
      fullName: "",
      email: "",
      phoneNumber: "",
      password: "",
      confirmPassword: "",
      acceptedTerms: false,
    },
  });

  const passwordValue = watch("password") ?? "";
  const copy = ROLE_COPY[role];

  const onSubmit = async (values: SignupValues) => {
    setServerError(null);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: values.fullName,
          email: values.email,
          phoneNumber: values.phoneNumber || undefined,
          password: values.password,
          role,
          acceptedTerms: true,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            code?: keyof typeof ERROR_KEYS;
            message?: string;
            verification?: { required: boolean; emailSent: boolean };
          }
        | null;

      if (!response.ok) {
        const key = payload?.code ? ERROR_KEYS[payload.code] : null;
        setServerError(
          key ? t(key) : (payload?.message ?? t("registrationFailed"))
        );
        return;
      }

      if (payload?.verification?.required) {
        setEmailSent(Boolean(payload.verification.emailSent));
        setPendingEmail(values.email);
        return;
      }

      // Verification disabled in this environment: sign the new user straight in.
      const result = await signIn("credentials", {
        identifier: values.email,
        password: values.password,
        redirect: false,
      });

      if (!result || result.error) {
        setServerError(t("invalidCredentials"));
        return;
      }

      const explicit = searchParams.get("callbackUrl");
      if (explicit) {
        router.push(explicit);
      } else {
        const session = await getSession();
        router.push(
          dashboardFor(session?.user?.activeRole ?? session?.user?.role ?? role)
        );
      }
      router.refresh();
    } catch {
      setServerError(t("registrationFailed"));
    }
  };

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    setServerError(null);
    try {
      const result = await signIn("google", {
        redirect: false,
        callbackUrl: searchParams.get("callbackUrl") ?? "/",
      });
      if (result?.error) setServerError(t("googleSignupError"));
    } catch {
      setServerError(t("googleSignupError"));
    } finally {
      setGoogleLoading(false);
    }
  };

  if (pendingEmail) {
    return (
      <AuthSplit
        visual={{ title: t("authVisualSignupTitle"), subtitle: t("brandTagline") }}
      >
        <AuthHeading
          title={t("verifyEmailTitle")}
          subtitle={t("verifyEmailLead")}
        />

        <div className="sarh-card space-y-4 p-7">
          <p
            role="status"
            className="flex flex-wrap items-center gap-2 rounded-lg bg-sarh-teal/10 px-4 py-3 text-sm font-medium text-sarh-teal"
          >
            <MailCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t("verifyEmailSentTo")}</span>
            <strong dir="ltr" className="font-bold">
              {pendingEmail}
            </strong>
          </p>

          {emailSent ? (
            <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
              {t("verifyEmailResendHint")}
            </p>
          ) : (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-xs font-medium leading-6 text-red-600 dark:bg-red-950/50 dark:text-red-300"
            >
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t("verifyEmailNotSent")}
            </p>
          )}

          <Link
            href="/auth/signin"
            className="sarh-btn-primary flex h-11 items-center justify-center rounded-lg text-sm font-semibold shadow-teal-glow hover:brightness-110"
          >
            {t("signIn")}
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
          {t("signupFooterHint")}
        </p>
      </AuthSplit>
    );
  }

  return (
    <AuthSplit      visual={{ title: t("authVisualSignupTitle"), subtitle: t("brandTagline") }}>
      <AuthHeading title={t("signUp")} subtitle={t(copy.subtitle)} />

      <form
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        noValidate
        className="sarh-card space-y-5 p-7"
      >
        {serverError ? (
          <AuthNotice tone="error">
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{serverError}</span>
          </AuthNotice>
        ) : null}

        <TextField
          id="fullName"
          label={copy.nameLabel ? t(copy.nameLabel) : t("fullName")}
          icon={User}
          type="text"
          dir="rtl"
          autoComplete="name"
          placeholder={t("fullNamePlaceholder")}
          hint={t(copy.nameHint)}
          error={errors.fullName?.message}
          registration={register("fullName")}
        />

        <TextField
          id="email"
          label={t("email")}
          icon={Mail}
          type="email"
          autoComplete="email"
          spellCheck={false}
          placeholder={t("emailPlaceholder")}
          error={errors.email?.message}
          registration={register("email")}
        />

        <TextField
          id="phoneNumber"
          label={t("phoneLabel")}
          icon={Phone}
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder={t("phonePlaceholder")}
          hint={t("phoneHint")}
          error={errors.phoneNumber?.message}
          registration={register("phoneNumber")}
        />

        <div>
          <PasswordField
            id="password"
            label={t("password")}
            placeholder={t("passwordPlaceholder")}
            autoComplete="new-password"
            error={errors.password?.message}
            registration={register("password")}
          />
          <PasswordStrengthMeter password={passwordValue} />
        </div>

        <PasswordField
          id="confirmPassword"
          label={t("confirmPassword")}
          placeholder={t("passwordPlaceholder")}
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          registration={register("confirmPassword")}
        />

        <RoleTabs value={role} onChange={setRole} legend={t("roleLabel")} />

        <div>
          <label
            htmlFor="acceptedTerms"
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm transition-colors",
              errors.acceptedTerms
                ? "border-red-400 bg-red-50/60 dark:bg-red-950/20"
                : "border-sarh-borderLight dark:border-sarh-borderDark"
            )}
          >
            <input
              id="acceptedTerms"
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-sarh-teal focus:ring-sarh-teal dark:border-slate-600 dark:bg-sarh-cardDark"
              {...register("acceptedTerms")}
            />
            <span className="leading-6 text-slate-600 dark:text-slate-300">
              {t("agreeToTerms")}{" "}
              <Link
                href="/terms"
                target="_blank"
                className="font-semibold text-sarh-teal underline underline-offset-2"
              >
                {t("termsOfService")}
              </Link>{" "}
              {t("andWord")}{" "}
              <Link
                href="/privacy"
                target="_blank"
                className="font-semibold text-sarh-teal underline underline-offset-2"
              >
                {t("privacyPolicy")}
              </Link>
            </span>
          </label>
          {errors.acceptedTerms ? (
            <p className="mt-1.5 text-xs font-medium text-red-500">
              {errors.acceptedTerms.message}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full shadow-teal-glow"
          loading={isSubmitting}
        >
          {isSubmitting ? t("creatingAccount") : t("signUp")}
        </Button>

        <AuthDivider label={t("orContinueWith")} />

        <GoogleAuthButton
          label={t("signUpWithGoogle")}
          loading={googleLoading}
          onClick={() => void handleGoogleSignUp()}
        />

        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          {t("alreadyHaveAccount")}{" "}
          <Link
            href="/auth/signin"
            className="font-semibold text-sarh-teal underline underline-offset-2 hover:text-sarh-teal/90"
          >
            {t("signIn")}
          </Link>
        </p>
      </form>

      <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
        {t("signupFooterHint")}
      </p>
    </AuthSplit>
  );
}
