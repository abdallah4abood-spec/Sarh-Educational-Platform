"use client";

import Link from "next/link";
import { ChevronDown, HelpCircle } from "lucide-react";

import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { useLanguage } from "@/lib/i18n/language-provider";

/** Question/answer pairs backed by the bilingual dictionary. */
const ITEMS: { questionKey: DictionaryKey; answerKey: DictionaryKey }[] = [
  { questionKey: "faqQ1", answerKey: "faqA1" },
  { questionKey: "faqQ2", answerKey: "faqA2" },
  { questionKey: "faqQ3", answerKey: "faqA3" },
  { questionKey: "faqQ4", answerKey: "faqA4" },
  { questionKey: "faqQ5", answerKey: "faqA5" },
];

export function FaqContent() {
  const { t } = useLanguage();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-12 sm:px-6">
      <header className="mb-8 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sarh-teal/10 text-sarh-teal mx-auto">
          <HelpCircle className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-3 text-3xl font-bold text-sarh-navy dark:text-white md:text-4xl">
          {t("faqTitle")}
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-500 dark:text-slate-400">
          {t("faqLead")}
        </p>
      </header>

      {/*
        Native <details>/<summary>: an accessible accordion that still works
        when JavaScript is unavailable (offline-first platform).
      */}
      <div className="space-y-3">
        {ITEMS.map(({ questionKey, answerKey }, index) => (
          <details
            key={questionKey}
            open={index === 0}
            className="sarh-card group overflow-hidden p-0 [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-start text-sm font-bold text-sarh-navy transition-colors hover:text-sarh-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal dark:text-white sm:text-base">
              <span className="flex items-center gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sarh-gold/15 text-xs font-bold text-sarh-gold">
                  {index + 1}
                </span>
                {t(questionKey)}
              </span>
              <ChevronDown
                className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <p className="border-t border-sarh-borderLight px-5 py-4 text-sm leading-8 text-slate-600 dark:border-sarh-borderDark dark:text-slate-300">
              {t(answerKey)}
            </p>
          </details>
        ))}
      </div>

      <div className="mt-10 rounded-2xl border border-sarh-borderLight bg-sarh-cardLight p-6 text-center shadow-soft dark:border-sarh-borderDark dark:bg-sarh-cardDark">
        <p className="text-sm font-medium text-sarh-navy dark:text-slate-200">
          {t("contactLead")}
        </p>
        <Link
          href="/contact"
          className="sarh-btn-primary mt-4 inline-flex h-10 rounded-lg text-sm shadow-teal-glow hover:brightness-110"
        >
          {t("contactTitle")}
        </Link>
      </div>
    </div>
  );
}
