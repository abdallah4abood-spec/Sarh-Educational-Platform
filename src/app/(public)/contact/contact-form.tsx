"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { mailtoHref, telHref, whatsappHref } from "@/lib/config/site";
import { useLanguage } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

interface FormState {
  name: string;
  email: string;
  subject: string;
  message: string;
}

const EMPTY: FormState = { name: "", email: "", subject: "", message: "" };

/**
 * Maps the API's `field` pointer (400 INVALID_INPUT) onto a localized hint.
 * Without this a validation slip would render the generic `contactFailed`
 * copy and read as if delivery itself had broken.
 */
const FIELD_ERROR_KEYS = {
  name: "contactInvalidName",
  email: "contactInvalidEmail",
  subject: "contactInvalidSubject",
  message: "contactInvalidMessage",
} as const;

type FieldErrorKey = (typeof FIELD_ERROR_KEYS)[keyof typeof FIELD_ERROR_KEYS];

/** Shape of the error body returned by POST /api/contact. */
interface ContactErrorBody {
  code?: string;
  field?: string | null;
  message?: string;
}

export function ContactContent() {
  const { t } = useLanguage();
  // Contact metadata is admin-editable (SiteSetting rows) with a siteConfig
  // fallback, so the block renders instantly and updates once the API answers.
  const { settings } = useSiteSettings();
  const [values, setValues] = useState<FormState>(EMPTY);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  /** Why the last attempt failed — null renders the generic failure copy. */
  const [errorKey, setErrorKey] = useState<FieldErrorKey | null>(null);

  const update = (field: keyof FormState) => (value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    // Editing clears a stale validation hint so it never contradicts what the
    // visitor has just typed. Kept outside the state updater, which must stay
    // pure.
    setErrorKey(null);
    setStatus((current) => (current === "error" ? "idle" : current));
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("sending");
    setErrorKey(null);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        // A 400 names the offending field; anything else (401/500/…)
        // keeps the generic "could not send" copy.
        const payload = (await response.json().catch(() => null)) as
          | ContactErrorBody
          | null;
        setErrorKey(
          payload?.field && payload.field in FIELD_ERROR_KEYS
            ? FIELD_ERROR_KEYS[payload.field as keyof typeof FIELD_ERROR_KEYS]
            : null
        );
        setStatus("error");
        return;
      }

      setValues(EMPTY);
      setErrorKey(null);
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  const infoRows: {
    icon: typeof Mail;
    label: string;
    value: string;
    href: string | null;
  }[] = [
    {
      icon: MessageCircle,
      label: t("contactWhatsapp"),
      value: settings.supportWhatsapp,
      href: whatsappHref(settings.supportWhatsapp),
    },
    {
      icon: Phone,
      label: t("contactPhone"),
      value: settings.supportPhone,
      href: telHref(settings.supportPhone),
    },
    {
      icon: Mail,
      label: t("email"),
      value: settings.supportEmail,
      href: mailtoHref(settings.supportEmail),
    },
    {
      icon: MapPin,
      label: t("contactLocation"),
      value: settings.siteLocation || t("contactLocationValue"),
      href: null,
    },
  ];

  const fieldClass =
    "sarh-input w-full text-start placeholder:text-slate-400";
  const labelClass =
    "mb-1.5 block text-sm font-medium text-sarh-navy dark:text-slate-200";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-12 sm:px-6">
      <header className="mb-10">
        <span className="sarh-badge bg-sarh-teal/10 text-sarh-teal ring-1 ring-inset ring-sarh-teal/30">
          {t("brand")}
        </span>
        <h1 className="mt-3 text-3xl font-bold text-sarh-navy dark:text-white md:text-4xl">
          {t("contactTitle")}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-8 text-slate-600 dark:text-slate-300 md:text-base">
          {t("contactLead")}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ----------------------------- Form ----------------------------- */}
        <form
          onSubmit={(event) => void onSubmit(event)}
          noValidate
          className="sarh-card space-y-5 p-6 lg:col-span-3"
        >
          <h2 className="text-lg font-bold text-sarh-navy dark:text-white">
            {t("contactFormTitle")}
          </h2>

          {status === "sent" ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-lg bg-sarh-teal/10 px-4 py-3 text-sm font-medium text-sarh-teal"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {t("contactSuccess")}
            </p>
          ) : null}

          {status === "error" ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600 dark:bg-red-950/50 dark:text-red-300"
            >
              {errorKey ? t(errorKey) : t("contactFailed")}
            </p>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className={labelClass}>
                {t("contactNameLabel")}
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                autoComplete="name"
                value={values.name}
                onChange={(event) => update("name")(event.target.value)}
                placeholder={t("contactNamePlaceholder")}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="email" className={labelClass}>
                {t("email")}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                dir="ltr"
                autoComplete="email"
                value={values.email}
                onChange={(event) => update("email")(event.target.value)}
                placeholder={t("emailPlaceholder")}
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="subject" className={labelClass}>
              {t("contactSubjectLabel")}
            </label>
            <input
              id="subject"
              name="subject"
              type="text"
              required
              value={values.subject}
              onChange={(event) => update("subject")(event.target.value)}
              placeholder={t("contactSubjectPlaceholder")}
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="message" className={labelClass}>
              {t("contactMessageLabel")}
            </label>
            <textarea
              id="message"
              name="message"
              required
              rows={6}
              value={values.message}
              onChange={(event) => update("message")(event.target.value)}
              placeholder={t("contactMessagePlaceholder")}
              className={cn(fieldClass, "resize-y leading-7")}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full shadow-teal-glow sm:w-auto"
            loading={status === "sending"}
          >
            {status === "sending" ? (
              t("contactSending")
            ) : (
              <>
                <Send className="h-4 w-4" aria-hidden="true" />
                {t("contactSend")}
              </>
            )}
          </Button>
        </form>

        {/* --------------------------- Metadata --------------------------- */}
        <aside className="lg:col-span-2">
          <section className="sarh-card h-full p-6">
            <h2 className="mb-4 text-lg font-bold text-sarh-navy dark:text-white">
              {t("contactInfoTitle")}
            </h2>
            <ul className="space-y-4">
              {infoRows.map(({ icon: Icon, label, value, href }) => (
                <li key={label} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sarh-teal/10 text-sarh-teal">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {label}
                    </span>
                    {href ? (
                      <a
                        href={href}
                        target={href.startsWith("http") ? "_blank" : undefined}
                        rel={
                          href.startsWith("http")
                            ? "noopener noreferrer"
                            : undefined
                        }
                        className="block break-all text-sm font-medium text-sarh-navy transition-colors hover:text-sarh-teal dark:text-slate-200"
                      >
                        {value}
                      </a>
                    ) : (
                      <span className="block text-sm font-medium text-sarh-navy dark:text-slate-200">
                        {value}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-6 flex items-start gap-2 rounded-lg bg-sarh-gold/10 px-3 py-3 text-xs font-medium leading-6 text-[#C9741F] dark:text-sarh-gold">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t("platformTagline")}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
