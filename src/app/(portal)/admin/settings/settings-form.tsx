"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Save,
  Settings2,
  ShieldAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useLanguage } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { SITE_SETTING_FIELDS } from "@/lib/config/site";

/**
 * Platform & contact settings editor (Design.md — admin console).
 *
 * Writes to `SiteSetting` through PATCH /api/settings, which is restricted to
 * SUPER_ADMIN on the server. The live values shown in the footer and on the
 * contact page are read from the same rows.
 */
const ICONS = {
  settingPhone: Phone,
  settingWhatsapp: MessageCircle,
  settingEmail: Mail,
  settingLocation: MapPin,
} as const;

export function SettingsForm() {
  const { t } = useLanguage();
  const { settings, loading, refresh } = useSiteSettings();
  const [values, setValues] = useState(settings);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Hydrate the form once the DB values arrive (the first paint uses the
  // siteConfig fallback so an admin still sees something editable offline).
  useEffect(() => {
    setValues(settings);
  }, [settings]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("saving");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; message?: string; settings?: typeof values }
        | null;

      if (!response.ok || !payload?.success) {
        setStatus("error");
        setErrorMessage(payload?.message ?? t("settingFailed"));
        return;
      }

      if (payload.settings) setValues(payload.settings);
      setStatus("saved");
      await refresh();
    } catch {
      setStatus("error");
      setErrorMessage(t("settingFailed"));
    }
  };

  const fieldClass = "sarh-input w-full text-start placeholder:text-slate-400";
  const labelClass =
    "mb-1.5 flex items-center gap-2 text-sm font-medium text-sarh-navy dark:text-slate-200";

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-5">
      <div className="sarh-card space-y-5 p-6">
        {status === "saved" ? (
          <p
            role="status"
            className="flex items-center gap-2 rounded-lg bg-sarh-teal/10 px-4 py-3 text-sm font-medium text-sarh-teal"
          >
            <BadgeCheck className="h-4 w-4" aria-hidden="true" />
            {t("settingSaved")}
          </p>
        ) : null}

        {status === "error" ? (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600 dark:bg-red-950/50 dark:text-red-300"
          >
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            {errorMessage ?? t("settingFailed")}
          </p>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          {SITE_SETTING_FIELDS.map(({ field, labelKey, inputType, placeholder }) => {
            const Icon = ICONS[labelKey];
            return (
              <div key={field}>
                <label htmlFor={field} className={labelClass}>
                  <Icon className="h-4 w-4 text-sarh-teal" aria-hidden="true" />
                  {t(labelKey)}
                </label>
                <input
                  id={field}
                  name={field}
                  type={inputType}
                  dir={inputType === "text" ? undefined : "ltr"}
                  placeholder={placeholder}
                  value={values[field]}
                  onChange={(event) =>
                    setValues((previous) => ({
                      ...previous,
                      [field]: event.target.value,
                    }))
                  }
                  className={cn(fieldClass, inputType !== "text" && "text-start")}
                />
              </div>
            );
          })}
        </div>

        <p className="flex items-start gap-2 rounded-lg bg-sarh-gold/10 px-3 py-3 text-xs font-medium leading-6 text-[#C9741F] dark:text-sarh-gold">
          <Settings2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t("settingHint")}
        </p>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full shadow-teal-glow sm:w-auto"
          disabled={loading}
        >
          {status === "saving" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t("settingSaving")}
            </>
          ) : (
            <>
              <Save className="h-4 w-4" aria-hidden="true" />
              {t("settingSave")}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
