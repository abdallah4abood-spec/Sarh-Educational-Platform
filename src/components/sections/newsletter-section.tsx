"use client";

import { Mail } from "lucide-react";

import { NewsletterForm } from "@/components/sections/newsletter-form";
import { Reveal } from "@/components/motion/reveal";
import { useLanguage } from "@/lib/i18n/language-provider";

/**
 * Lead-generation band: the newsletter pitch plus the form itself.
 *
 * Rendered as a tinted panel rather than a plain white strip so the eye reads it
 * as the last call to action before the footer. The tint is teal-over-ivory
 * instead of the old navy block: the platform's default surface stays light
 * everywhere, and the form's teal button is still the highest-contrast object
 * on the screen.
 */
export function NewsletterSection() {
  const { t } = useLanguage();

  return (
    <section
      id="newsletter"
      aria-labelledby="learn-newsletter-title"
      className="scroll-mt-24 px-6 py-20"
    >
      <Reveal className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-3xl border border-sarh-teal/20 bg-gradient-to-br from-sarh-mist via-white to-sarh-beige p-8 shadow-soft-lg dark:border-sarh-teal/25 dark:from-sarh-cardDark dark:via-sarh-cardDark dark:to-sarh-cardDark sm:p-12">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(0,169,157,0.12),transparent_55%),radial-gradient(circle_at_85%_85%,rgba(242,153,74,0.12),transparent_55%)]"
          />

          <div className="relative grid items-center gap-8 lg:grid-cols-2">
            <div className="flex flex-col items-start gap-4">
              <span className="sarh-badge gap-1.5 bg-white/80 text-sarh-teal ring-1 ring-inset ring-sarh-teal/30">
                <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                {t("learn_footerLinkNewsletter")}
              </span>
              <h2
                id="learn-newsletter-title"
                className="text-2xl font-bold text-balance text-sarh-navy md:text-3xl dark:text-white"
              >
                {t("learn_newsTitle")}
              </h2>
              <p className="max-w-xl text-sm leading-8 text-sarh-inkMute dark:text-slate-300">
                {t("learn_newsLead")}
              </p>
            </div>

            {/* The form keeps its own solid surface so the input stays legible
                in both themes. */}
            <div className="rounded-2xl border border-sarh-borderLight bg-white p-5 text-sarh-navy shadow-soft dark:border-sarh-borderDark dark:bg-sarh-cardDark/95 dark:text-slate-100">
              <NewsletterForm />
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
