"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Loader2, Mail } from "lucide-react";

import { useLanguage } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

type Status = "idle" | "invalid" | "sending" | "success" | "error";

/**
 * Deliberately permissive: one "@", a dot in the domain, no spaces. Anything
 * stricter starts rejecting addresses that are actually valid, and the server
 * validates independently anyway.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Newsletter subscription box with instant validation.
 *
 * "Instant" means two things here: the field is checked as soon as it loses
 * focus (so a typo is caught before the user even reaches the button), and the
 * submit path answers a real API instead of faking a success message. The
 * result is announced through `role="status"` / `role="alert"` so a screen
 * reader hears the outcome without hunting for a colour change.
 */
export function NewsletterForm({
  placeholder,
  cta,
  showHint = true,
  idPrefix = "learn-newsletter",
}: {
  /** Override the field placeholder (the sidebar wants its own copy). */
  placeholder?: string;
  /** Override the submit label (the sidebar uses the shorter "اشترك"). */
  cta?: string;
  /** The long "what you get" hint line — redundant in a narrow sidebar. */
  showHint?: boolean;
  /** Keeps the input/label ids unique when two forms share a page. */
  idPrefix?: string;
} = {}) {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const emailId = `${idPrefix}-email`;
  const hintId = `${idPrefix}-hint`;

  const invalid = status === "invalid";
  const sending = status === "sending";

  /** Validate on blur, but only once the visitor has typed something. */
  const handleBlur = () => {
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) {
      setStatus("invalid");
    } else if (invalid) {
      setStatus("idle");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const candidate = email.trim();
    if (!EMAIL_PATTERN.test(candidate)) {
      setStatus("invalid");
      return;
    }

    setStatus("sending");
    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: candidate }),
      });

      if (!response.ok) {
        setStatus("error");
        return;
      }

      setStatus("success");
      setEmail("");
    } catch {
      // Network failure (or offline) — the visitor can retry.
      setStatus("error");
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full">
      <label htmlFor={emailId} className="sr-only">
        {t("learn_newsEmailLabel")}
      </label>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Mail
            aria-hidden="true"
            // The field is pinned to LTR (an address is an LTR value), so the
            // icon and the text padding are physical, not logical: a logical
            // `ps-10` would pad the right edge in RTL while the text starts on
            // the left, letting a long address slide under the icon.
            className="pointer-events-none absolute inset-y-0 left-3.5 my-auto h-4 w-4 text-slate-400"
          />
          <input
            id={emailId}
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (invalid || status === "error") setStatus("idle");
            }}
            onBlur={handleBlur}
            placeholder={placeholder ?? t("learn_newsPlaceholder")}
            aria-invalid={invalid}
            aria-describedby={showHint ? hintId : undefined}
            className={cn(
              "sarh-input pl-10 text-start",
              invalid && "border-red-500 focus:border-red-500 focus:ring-red-500/30"
            )}
          />
        </div>

        <button
          type="submit"
          disabled={sending}
          className="sarh-btn-primary h-11 shrink-0 px-6 shadow-teal-glow hover:brightness-110"
        >
          {sending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t("learn_newsSending")}
            </>
          ) : (
            (cta ?? t("learn_newsCta"))
          )}
        </button>
      </div>

      {showHint ? (
        <p
          id={hintId}
          className="mt-3 text-xs leading-6 text-slate-500 dark:text-slate-400"
        >
          {t("learn_newsHint")}
        </p>
      ) : null}

      {/* Exactly one live region is rendered at a time, so the message is
          announced once and never duplicated. */}
      {invalid ? (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t("learn_newsInvalid")}
        </p>
      ) : null}

      {status === "error" ? (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t("learn_newsError")}
        </p>
      ) : null}

      {status === "success" ? (
        <p role="status" className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t("learn_newsSuccess")}
        </p>
      ) : null}
    </form>
  );
}
