"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  HeartHandshake,
  Mail,
  ShieldCheck,
  Sparkles,
  WifiOff,
  type LucideIcon,
} from "lucide-react";

import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { useLanguage } from "@/lib/i18n/language-provider";

/**
 * Shared shell for the static informational routes (/about, /privacy, /terms).
 *
 * Every string is a dictionary key resolved on the client, so the whole page
 * flips between Arabic and English with the navbar language toggle. Icons are
 * referenced by name (not passed as components) because a Server Component
 * cannot hand a React component to a Client Component.
 */

export interface InfoSection {
  titleKey: DictionaryKey;
  bodyKey: DictionaryKey;
}

export interface InfoCard extends InfoSection {
  icon: InfoIconName;
}

export type InfoIconName = "offline" | "trust" | "local" | "ai" | "kids" | "center";

const ICONS: Record<InfoIconName, LucideIcon> = {
  offline: WifiOff,
  trust: ShieldCheck,
  local: HeartHandshake,
  ai: Sparkles,
  kids: BadgeCheck,
  center: Building2,
};

export function InfoPage({
  badgeKey,
  titleKey,
  leadKey,
  metaKey,
  sections,
  cards,
  cardsTitleKey,
  showContactCta = true,
}: {
  badgeKey: DictionaryKey;
  titleKey: DictionaryKey;
  leadKey: DictionaryKey;
  metaKey?: DictionaryKey;
  sections?: InfoSection[];
  cards?: InfoCard[];
  cardsTitleKey?: DictionaryKey;
  showContactCta?: boolean;
}) {
  const { t } = useLanguage();

  return (
    <article className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12 sm:px-6">
      <header className="mb-10">
        <span className="sarh-badge bg-sarh-teal/10 text-sarh-teal ring-1 ring-inset ring-sarh-teal/30">
          {t(badgeKey)}
        </span>
        <h1 className="mt-3 text-3xl font-bold text-sarh-navy dark:text-white md:text-4xl">
          {t(titleKey)}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-8 text-slate-600 dark:text-slate-300 md:text-base">
          {t(leadKey)}
        </p>
        {metaKey ? (
          <p className="mt-3 text-xs font-medium text-slate-400 dark:text-slate-500">
            {t(metaKey)}
          </p>
        ) : null}
      </header>

      {sections && sections.length > 0 ? (
        <div className="space-y-5">
          {sections.map(({ titleKey: sectionTitle, bodyKey }, index) => (
            <section key={sectionTitle} className="sarh-card p-6">
              <h2 className="mb-2 flex items-center gap-2 text-base font-bold text-sarh-navy dark:text-white">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sarh-teal/10 text-xs font-bold text-sarh-teal">
                  {index + 1}
                </span>
                {t(sectionTitle)}
              </h2>
              <p className="text-sm leading-8 text-slate-600 dark:text-slate-300">
                {t(bodyKey)}
              </p>
            </section>
          ))}
        </div>
      ) : null}

      {cards && cards.length > 0 ? (
        <section className="mt-10">
          {cardsTitleKey ? (
            <h2 className="mb-4 text-xl font-bold text-sarh-navy dark:text-white">
              {t(cardsTitleKey)}
            </h2>
          ) : null}
          <div className="grid gap-5 sm:grid-cols-2">
            {cards.map(({ icon, titleKey: cardTitle, bodyKey }) => {
              const Icon = ICONS[icon];
              return (
                <section key={cardTitle} className="sarh-card p-6">
                  <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-sarh-gold/15 text-sarh-gold">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h2 className="mb-2 text-base font-bold text-sarh-navy dark:text-white">
                    {t(cardTitle)}
                  </h2>
                  <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
                    {t(bodyKey)}
                  </p>
                </section>
              );
            })}
          </div>
        </section>
      ) : null}

      {showContactCta ? (
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-sarh-borderLight bg-sarh-cardLight p-6 shadow-soft dark:border-sarh-borderDark dark:bg-sarh-cardDark">
          <p className="text-sm font-medium text-sarh-navy dark:text-slate-200">
            {t("contactLead")}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/contact"
              className="sarh-btn-primary h-10 rounded-lg text-sm shadow-teal-glow hover:brightness-110"
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              {t("contactTitle")}
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <Link
              href="/faq"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-sarh-borderLight px-4 text-sm font-semibold text-sarh-navy transition-colors hover:border-sarh-teal hover:text-sarh-teal dark:border-sarh-borderDark dark:text-slate-100"
            >
              {t("nav_faq")}
            </Link>
          </div>
        </div>
      ) : null}
    </article>
  );
}
