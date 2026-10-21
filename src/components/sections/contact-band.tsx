"use client";

import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";

import { Reveal } from "@/components/motion/reveal";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { mailtoHref, telHref, whatsappHref } from "@/lib/config/site";
import { useLanguage } from "@/lib/i18n/language-provider";

/**
 * Homepage contact band — the target of the navbar's "تواصل معنا" (`/#contact`).
 *
 * The last navbar entry scrolls here rather than navigating away, so the reader
 * can reach a real support channel without losing the page they were on. The
 * full message form still lives on `/contact`, which this band links to; what
 * it shows inline are the three channels that need no form at all — phone,
 * WhatsApp and email — pulled from the same DB-backed settings the footer uses,
 * so the numbers can never drift between the two.
 */
export function ContactBand() {
  const { t } = useLanguage();
  const { settings } = useSiteSettings();

  const emailHref = mailtoHref(settings.supportEmail);

  const channels = [
    {
      key: "phone",
      href: telHref(settings.supportPhone),
      label: t("contactPhone"),
      value: settings.supportPhone,
      Icon: Phone,
      external: false,
    },
    {
      key: "whatsapp",
      href: whatsappHref(settings.supportWhatsapp),
      label: t("contactWhatsApp"),
      value: settings.supportWhatsapp,
      Icon: MessageCircle,
      external: true,
    },
    ...(emailHref
      ? [
          {
            key: "email",
            href: emailHref,
            label: t("settingEmail"),
            value: settings.supportEmail,
            Icon: Mail,
            external: false,
          },
        ]
      : []),
  ];

  return (
    <section id="contact" className="sarh-section-tight scroll-mt-24 px-6">
      <Reveal className="mx-auto max-w-6xl">
        <div className="sarh-card overflow-hidden p-8 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div className="flex flex-col items-start gap-4">
              <span className="sarh-badge bg-sarh-teal/12 px-3 py-1 text-xs font-bold text-sarh-tealInk ring-1 ring-inset ring-sarh-teal/30 dark:text-sarh-teal">
                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                {t("nav_contact")}
              </span>
              <h2 className="sarh-heading text-sarh-navy dark:text-white">
                {t("contactTitle")}
              </h2>
              <p className="sarh-lead max-w-xl text-slate-600 dark:text-slate-300">
                {t("contactLead")}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/contact" className="sarh-btn-primary shadow-teal-glow">
                  {t("contactFormTitle")}
                </Link>
                <span className="sarh-meta inline-flex items-center gap-1.5 font-medium text-sarh-inkMute dark:text-slate-400">
                  <MapPin className="h-3.5 w-3.5 text-sarh-tealInk dark:text-sarh-teal" aria-hidden="true" />
                  {settings.siteLocation}
                </span>
              </div>
            </div>

            <ul className="flex flex-col gap-3">
              {channels.map(({ key, href, label, value, Icon, external }) => (
                <li key={key}>
                  <a
                    href={href}
                    {...(external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    className="flex items-center gap-3 rounded-xl border border-sarh-borderLight bg-sarh-mist/60 px-4 py-3 transition-colors hover:border-sarh-teal/40 dark:border-sarh-borderDark dark:bg-sarh-cardDark"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sarh-teal/12 text-sarh-tealInk dark:text-sarh-teal">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-sarh-inkMute dark:text-slate-400">
                        {label}
                      </span>
                      <span
                        dir="ltr"
                        className="block truncate text-sm font-bold text-sarh-navy dark:text-slate-100"
                      >
                        {value}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
