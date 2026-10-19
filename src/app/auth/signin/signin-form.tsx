"use client";

import { useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Info, Mail, ShieldAlert } from "lucide-react";

import {
  AuthDivider,
  AuthHeading,
  AuthNotice,
  AuthSplit,
  GoogleAuthButton,
  PasswordField,
  TextField,
} from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n/language-provider";
import { isPhoneNumber, looksLikeEmail } from "@/lib/phone";
import { dashboardFor, portalForPath } from "@/lib/roles";

const signinSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, { message: "الرجاء إدخال البريد الإلكتروني أو رقم الجوال" })
    .refine((value) => looksLikeEmail(value) || isPhoneNumber(value), {
      message: "أدخل بريداً إلكترونياً صحيحاً أو رقم جوال صحيحاً",
    }),
  password: z
    .string()
    .min(8, { message: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" }),
  remember: z.boolean(),
});

type SigninValues = z.infer<typeof signinSchema>;

/** Hint cookie read by the NextAuth route to size the session cookie. */
const REMEMBER_HINT_COOKIE = "sarh-remember";

interface LoginNotice {
  tone: "success" | "info" | "error";
  text: string;
  email: string | null;
}

/**
 * Tier named by a ?callbackUrl, so the "we will take you to your portal"
 * notice can be specific instead of generic. Returns null for a link that
 * points at the public site.
 */
function portalLabelFromCallbackUrl(callbackUrl: string | null): string | null {
  if (!callbackUrl) return null;
  const path = callbackUrl.replace(/^https?:\/\/[^/]+/, "");
  return portalForPath(path)?.caption ?? null;
}

function writeRememberHint(remember: boolean): void {
  // Not httpOnly on purpose: only the NextAuth route reads it, and it carries
  // no secret — just the user's choice about cookie lifetime.
  document.cookie = `${REMEMBER_HINT_COOKIE}=${remember ? "1" : "0"}; path=/; samesite=lax`;
}

export default function SigninForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const [serverError, setServerError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const callbackUrl = searchParams.get("callbackUrl");
  const requestedPortal = portalLabelFromCallbackUrl(callbackUrl);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SigninValues>({
    resolver: zodResolver(signinSchema),
    mode: "onBlur",
    defaultValues: { identifier: "", password: "", remember: true },
  });

  /**
   * Notices produced by the surrounding flows:
   *   ?verified=1                    → the email was just confirmed
   *   ?verify=expired|invalid|error  → the link could not be redeemed
   *   ?unverified=1&email=           → RBAC middleware blocked a portal login
   */
  const notice: LoginNotice | null = (() => {
    if (searchParams.get("verified") === "1") {
      return { tone: "success", text: t("verifyEmailSuccess"), email: null };
    }

    if (searchParams.get("unverified") === "1") {
      return {
        tone: "info",
        text: t("loginUnverifiedNotice"),
        email: searchParams.get("email"),
      };
    }

    const failure = searchParams.get("verify");
    if (failure === "expired") {
      return { tone: "error", text: t("verifyEmailExpired"), email: null };
    }
    if (failure === "error") {
      return { tone: "error", text: t("verifyEmailError"), email: null };
    }
    if (failure === "invalid") {
      return { tone: "error", text: t("verifyEmailInvalid"), email: null };
    }

    return null;
  })();

  /**
   * Sign-in is role-agnostic by design (Pillar 1 — smart auto-routing).
   *
   * There is no account-type picker: the credentials provider resolves the
   * account, the JWT is minted from the database tier set, and the redirect
   * target is derived from the account itself (`session.user.activeRole`).
   * That removes the whole class of "account type mismatch" friction — the
   * user cannot pick the wrong door because there is no door to pick.
   */
  const onSubmit = async (values: SigninValues) => {
    setServerError(null);
    writeRememberHint(values.remember);

    const result = await signIn("credentials", {
      identifier: values.identifier,
      password: values.password,
      redirect: false,
    });

    if (!result || result.error) {
      setServerError(t("invalidCredentials"));
      return;
    }

    // An explicit callbackUrl is the user's own instruction and always wins —
    // and if it names a portal their account cannot enter, the middleware
    // bounces them to their own dashboard instead of showing a 403.
    if (callbackUrl && callbackUrl !== "/") {
      router.push(callbackUrl);
      router.refresh();
      return;
    }

    const session = await getSession();
    // `activeRole` is the tier the session starts on — the account's primary
    // role straight from the database.
    router.push(
      dashboardFor(session?.user?.activeRole ?? session?.user?.role)
    );
    router.refresh();
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setServerError(null);
    try {
      const result = await signIn("google", {
        redirect: false,
        callbackUrl: callbackUrl ?? "/",
      });
      if (result?.error) setServerError(t("googleLoginError"));
    } catch {
      setServerError(t("googleLoginError"));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <AuthSplit
      visual={{ title: t("authVisualSigninTitle"), subtitle: t("brandTagline") }}
    >
      <AuthHeading title={t("login")} subtitle={t("loginSubtitle")} />

      {notice ? (
        <AuthNotice tone={notice.tone}>
          {notice.tone === "error" ? (
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{notice.text}</span>
          {notice.email ? (
            <strong dir="ltr" className="font-bold">
              {notice.email}
            </strong>
          ) : null}
        </AuthNotice>
      ) : null}

      {/* Smart auto-routing: name the portal this account will land on when
          the visitor arrived from a portal deep link, otherwise state the
          rule plainly. */}
      <AuthNotice tone="info">
        <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="leading-7">
          {requestedPortal ? `${requestedPortal}: ` : ""}
          {t("loginAutoRouteHint")}
        </span>
      </AuthNotice>

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
          icon={Mail}
          type="text"
          autoComplete="username"
          spellCheck={false}
          placeholder={t("identifierPlaceholder")}
          error={errors.identifier?.message}
          registration={register("identifier")}
        />

        <PasswordField
          id="password"
          label={t("password")}
          placeholder={t("passwordPlaceholder")}
          autoComplete="current-password"
          error={errors.password?.message}
          registration={register("password")}
        />

        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="remember"
            className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300"
          >
            <input
              id="remember"
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-sarh-teal focus:ring-sarh-teal dark:border-slate-600 dark:bg-sarh-cardDark"
              {...register("remember")}
            />
            {t("rememberMe")}
          </label>

          <Link
            href="/auth/forgot-password"
            className="text-sm font-semibold text-sarh-teal underline underline-offset-2 hover:text-sarh-teal/90"
          >
            {t("forgotPassword")}
          </Link>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full shadow-teal-glow"
          loading={isSubmitting}
        >
          {t("login")}
        </Button>

        <AuthDivider label={t("orContinueWith")} />

        <GoogleAuthButton
          label={t("signUpWithGoogle")}
          loading={googleLoading}
          onClick={() => void handleGoogleSignIn()}
        />

        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          {t("noAccountYet")}{" "}
          <Link
            href="/auth/signup"
            className="font-semibold text-sarh-teal underline underline-offset-2 hover:text-sarh-teal/90"
          >
            {t("signUp")}
          </Link>
        </p>
      </form>

      <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
        {t("platformTagline")}
      </p>
    </AuthSplit>
  );
}


