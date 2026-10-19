"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, KeyRound, MailCheck, ShieldAlert } from "lucide-react";

import {
  AuthHeading,
  AuthNotice,
  AuthSplit,
  TextField,
} from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n/language-provider";
import { isPhoneNumber, looksLikeEmail } from "@/lib/phone";

const requestSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, { message: "أدخل البريد الإلكتروني أو رقم الجوال" })
    .refine((value) => looksLikeEmail(value) || isPhoneNumber(value), {
      message: "أدخل بريداً إلكترونياً صحيحاً أو رقم جوال صحيحاً",
    }),
});

type RequestValues = z.infer<typeof requestSchema>;

/**
 * The only two reachable outcomes, and both describe the *platform* rather
 * than the account: whether a mail provider is configured at all. Saying
 * anything about the account here would leak which addresses are registered.
 */
type Delivery = "configured" | "unavailable";

export default function ForgotPasswordForm() {
  const { t } = useLanguage();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RequestValues>({
    resolver: zodResolver(requestSchema),
    mode: "onBlur",
    defaultValues: { identifier: "" },
  });

  const onSubmit = async (values: RequestValues) => {
    setServerError(null);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: values.identifier }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; delivery?: Delivery; message?: string }
        | null;

      if (!response.ok || !payload?.success) {
        setServerError(payload?.message ?? t("registrationFailed"));
        return;
      }

      setDelivery(payload.delivery ?? "unavailable");
    } catch {
      setServerError(t("registrationFailed"));
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

  if (delivery) {
    return (
      <AuthSplit
        visual={{ title: t("authVisualForgotTitle"), subtitle: t("brandTagline") }}
      >
        <AuthHeading
          title={t("forgotPasswordTitle")}
          subtitle={t("forgotPasswordSubtitle")}
        />

        <div className="sarh-card space-y-4 p-7">
          <AuthNotice tone={delivery === "configured" ? "success" : "info"}>
            <MailCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="leading-7">
              {delivery === "configured"
                ? t("forgotPasswordSent")
                : t("forgotPasswordUnavailable")}
            </span>
          </AuthNotice>

          <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
            {t("forgotPasswordInstructions")}
          </p>
          <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
            {t("recoveryUnverifiedHint")}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {backToSignin}
            <button
              type="button"
              onClick={() => {
                setDelivery(null);
                reset();
              }}
              className="text-sm font-medium text-slate-500 underline underline-offset-2 hover:text-sarh-teal dark:text-slate-400"
            >
              {t("requestNewLink")}
            </button>
          </div>
        </div>
      </AuthSplit>
    );
  }

  return (
    <AuthSplit
      visual={{ title: t("authVisualForgotTitle"), subtitle: t("brandTagline") }}
    >
      <AuthHeading
        title={t("forgotPasswordTitle")}
        subtitle={t("forgotPasswordSubtitle")}
      />

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
          id="identifier"
          label={t("identifierLabel")}
          icon={KeyRound}
          type="text"
          autoComplete="username"
          spellCheck={false}
          placeholder={t("identifierPlaceholder")}
          hint={t("forgotPasswordInstructions")}
          error={errors.identifier?.message}
          registration={register("identifier")}
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full shadow-teal-glow"
          loading={isSubmitting}
        >
          {isSubmitting ? t("forgotPasswordSending") : t("forgotPasswordAction")}
        </Button>

        <div className="flex justify-center">{backToSignin}</div>
      </form>

      <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
        {t("platformTagline")}
      </p>
    </AuthSplit>
  );
}
