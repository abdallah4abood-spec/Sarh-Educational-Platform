"use client";

import Link from "next/link";
import { ArrowLeft, Compass, Home } from "lucide-react";

import { useLanguage } from "@/lib/i18n/language-provider";

/**
 * Localised 404 for every public route.
 *
 * `notFound()` in a Server Component (an unknown center id, for example) still
 * answers with a real HTTP 404 — this file only replaces Next's English default
 * screen with the platform's own chrome, Arabic copy and two ways forward. It is
 * a Client Component so the AR/EN toggle applies here like everywhere else.
 */
export default function PublicNotFound() {
  const { t } = useLanguage();

  return (
    <section className="sarh-section mx-auto flex max-w-2xl flex-col items-center px-6 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-sarh-teal/12 text-sarh-tealInk ring-1 ring-inset ring-sarh-teal/25 dark:bg-sarh-teal/15 dark:text-sarh-teal">
        <Compass className="h-7 w-7" aria-hidden="true" />
      </span>

      <p
        aria-hidden="true"
        className="mt-6 text-5xl font-bold tracking-tight text-sarh-navy/15 dark:text-white/15"
      >
        404
      </p>

      <h1 className="sarh-heading mt-2 text-sarh-navy dark:text-white">
        {t("notFoundTitle")}
      </h1>
      <p className="sarh-body mt-3 max-w-md text-sarh-inkMute dark:text-slate-300">
        {t("notFoundLead")}
      </p>

      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link href="/explore/centers" className="sarh-btn-primary shadow-teal-glow">
          {t("notFoundExplore")}
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border border-sarh-borderLight bg-white px-5 py-2.5 font-semibold text-sarh-navy transition-colors hover:border-sarh-teal hover:text-sarh-tealInk focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-tealInk dark:border-sarh-borderDark dark:bg-transparent dark:text-slate-100 dark:hover:text-sarh-teal"
        >
          <Home className="h-4 w-4" aria-hidden="true" />
          {t("notFoundHome")}
        </Link>
      </div>
    </section>
  );
}
