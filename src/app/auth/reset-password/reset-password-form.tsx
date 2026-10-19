"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, CheckCircle2, Lock, ShieldAlert } from "lucide-react";

import {
  AuthHeading,
  AuthNotice,
  AuthSplit,
  PasswordField,
  PasswordStrengthMeter,
} from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n/language-provider";

/**
 * New-password rules. They mirror `/api/auth/reset-password` exactly — a letter
 * and a digit (Latin or Arabic-Indic) in at least 8 characters — so the live
 * meter can never approve something the API rejects.
 */
const resetSchema = z
  .object({
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
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["confirmPassword"],
  });

type ResetValues = z.infer<typeof resetSchema>;

/** Link states, in the order the page moves through them. */
type LinkState =
  | { status: "checking" }
  | { status: "ready"; email: string }
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "error" }
  | { status: "done"; email: string | null };

export default function ResetPasswordForm() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [link, setLink] = useState<LinkState>({ status: "checking" });
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    mode: "onBlur",
    defaultValues: { password: "", confirmPassword: "" },
  });

  const passwordValue = watch("password") ?? "";

  /**
   * The token is validated before the form is shown, so an expired or reused
   * link explains itself instead of failing after the user types a password.
   */
  useEffect(() => {
    if (!token) {
      setLink({ status: "missing" });
      return;
    }

    let cancelled = false;

    const check = async () => {
      try {
        const response = await fetch(
          `/api/auth/reset-password?token=${encodeURIComponent(token)}`
        );
        const payload = (await response.json().catch(() => null)) as
          | { valid?: boolean; email?: string; code?: string }
          | null;

        if (cancelled) return;

        if (payload?.valid) {
          setLink({ status: "ready", email: payload.email ?? "" });
          return;
        }

        // The API distinguishes the three failure modes, so the copy can
        // advise properly instead of blaming the user for a stale link.
        if (payload?.code === "EXPIRED_TOKEN") {
          setLink({ status: "expired" });
        } else if (
          payload?.code === "DB_UNAVAILABLE" ||
          response.status === 503
        ) {
          setLink({ status: "error" });
        } else {
          setLink({ status: "invalid" });
        }
      } catch {
        if (!cancelled) setLink({ status: "error" });
      }
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSubmit = async (values: ResetValues) => {
    setServerError(null);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: values.password }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; email?: string; message?: string }
        | null;

      if (!response.ok || !payload?.success) {
        setServerError(payload?.message ?? t("resetLinkError"));
        return;
      }

      setLink({ status: "done", email: payload.email ?? null });
    } catch {
      setServerError(t("resetLinkError"));
    }
  };

  const backToSignin = (
    <Link
      href="/auth/signin"
      className="inline-flex items-center gap-2 text-sm font-semibold text-sarh-teal underline underline-offset-2 hover:text-sarh-teal/90"
    >
      <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
      {t("forgotPasswordBack")}
    </Link>
  );

  return (
    <AuthSplit
      visual={{ title: t("authVisualResetTitle"), subtitle: t("brandTagline") }}
    >
      <AuthHeading
        title={t("resetPasswordTitle")}
        subtitle={t("resetPasswordSubtitle")}
      />

      {link.status === "checking" ? (
        <div className="sarh-card flex items-center gap-3 p-7">
          <span
            className="h-5 w-5 animate-spin rounded-full border-2 border-sarh-teal border-t-transparent"
            aria-hidden="true"
          />
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {t("resetPasswordChecking")}
          </span>
        </div>
      ) : null}

      {link.status === "done" ? (
        <div className="sarh-card space-y-4 p-7">
          <AuthNotice tone="success">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="leading-7">{t("resetPasswordSuccess")}</span>
          </AuthNotice>
          <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
            {t("resetPasswordSuccessLead")}
          </p>
          <Link
            href="/auth/signin"
            className="sarh-btn-primary flex h-11 items-center justify-center rounded-lg text-sm font-semibold shadow-teal-glow hover:brightness-110"
          >
            {t("forgotPasswordBack")}
          </Link>
        </div>
      ) : null}

      {link.status === "invalid" ||
      link.status === "expired" ||
      link.status === "missing" ||
      link.status === "error" ? (
        <div className="sarh-card space-y-4 p-7">
          <AuthNotice tone="error">
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="leading-7">
              {link.status === "expired"
                ? t("resetLinkExpired")
                : link.status === "error"
                  ? t("resetLinkError")
                  : link.status === "missing"
                    ? t("resetLinkMissing")
                    : t("resetLinkInvalid")}
            </span>
          </AuthNotice>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/auth/forgot-password"
              className="sarh-btn-primary flex h-11 items-center justify-center rounded-lg px-5 text-sm font-semibold shadow-teal-glow hover:brightness-110"
            >
              {t("requestNewLink")}
            </Link>
            {backToSignin}
          </div>
        </div>
      ) : null}

      {link.status === "ready" ? (
        <>
          <div className="sarh-card space-y-5 p-7">
            <p className="flex flex-wrap items-center gap-2 rounded-lg bg-sarh-teal/10 px-4 py-3 text-sm font-medium text-sarh-teal">
              <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t("resetPasswordForAccount")}</span>
              <strong dir="ltr" className="font-bold">
                {link.email}
              </strong>
            </p>

            {serverError ? (
              <AuthNotice tone="error">
                <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{serverError}</span>
              </AuthNotice>
            ) : null}

            <form
              onSubmit={(event) => void handleSubmit(onSubmit)(event)}
              noValidate
              className="space-y-5"
            >
              <div>
                <PasswordField
                  id="password"
                  label={t("newPassword")}
                  placeholder={t("passwordPlaceholder")}
                  autoComplete="new-password"
                  error={errors.password?.message}
                  registration={register("password")}
                />
                <PasswordStrengthMeter password={passwordValue} />
              </div>

              <PasswordField
                id="confirmPassword"
                label={t("confirmNewPassword")}
                placeholder={t("passwordPlaceholder")}
                autoComplete="new-password"
                error={errors.confirmPassword?.message}
                registration={register("confirmPassword")}
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full shadow-teal-glow"
                loading={isSubmitting}
              >
                {isSubmitting ? t("resetPasswordSaving") : t("resetPasswordAction")}
              </Button>
            </form>
          </div>

          <div className="mt-6 flex justify-center">{backToSignin}</div>
        </>
      ) : null}
    </AuthSplit>
  );
}
