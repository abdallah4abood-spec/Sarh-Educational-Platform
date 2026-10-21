"use client";

import { Search, Send, ShieldCheck } from "lucide-react";

import {
  BoyWithBooksIllustration,
  GirlWithPencilsIllustration,
} from "./hero-illustration";
import { KIND_META, type DirectoryKind } from "@/lib/data/directory";
import { useLanguage } from "@/lib/i18n/language-provider";

/**
 * Tailored hero banner for one directory.
 *
 * Same skeleton for both routes — badge, three-part headline, lead, search —
 * with the illustration swapped (a boy with books for centres, a girl
 * colouring for kindergartens) so the two pages read as siblings rather than
 * clones.
 *
 * The search field is the page's primary input: it filters the grid live and
 * pressing Enter jumps the reader down to the results, which is what makes it
 * feel like the hero "owns" the search rather than duplicating the filter bar.
 */
export function DirectoryHero({
  kind,
  query,
  onQuery,
  onSearch,
}: {
  kind: DirectoryKind;
  query: string;
  onQuery: (value: string) => void;
  onSearch: () => void;
}) {
  const { t } = useLanguage();
  const meta = KIND_META[kind];
  const Illustration =
    kind === "centers" ? BoyWithBooksIllustration : GirlWithPencilsIllustration;

  return (
    <section className="relative overflow-hidden bg-sarh-desk dark:bg-sarh-navyDark">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-sarh-desk-soft dark:opacity-0"
      />

      {/* Dotted trail + paper plane, drawn behind the copy. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 220 90"
        className="pointer-events-none absolute start-[38%] top-8 hidden h-20 w-52 text-sarh-teal/60 lg:block"
      >
        <path
          d="M4 78C34 78 52 66 62 46c8-16 24-26 44-28"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="6 7"
          strokeLinecap="round"
        />
      </svg>
      <Send
        aria-hidden="true"
        className="pointer-events-none absolute start-[62%] top-6 hidden h-8 w-8 -rotate-12 text-sarh-teal lg:block"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 pb-12 pt-10 sm:px-6 sm:pt-12 lg:grid-cols-2 lg:gap-10 lg:pb-16 lg:pt-16">
        {/*
         * Copy comes first in the DOM. In an RTL grid that places it in the
         * right-hand column on `lg`, and on a single-column phone it keeps the
         * headline — not a decorative illustration — as the first thing the
         * reader (and LCP) sees.
         */}
        <div className="flex flex-col items-start gap-4">
          <span className="sarh-badge bg-sarh-teal/12 px-3 py-1 text-xs font-bold text-sarh-tealInk ring-1 ring-inset ring-sarh-teal/30">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {t(meta.badgeKey)}
          </span>

          {/*
           * `sarh-display-sm` replaces the old `leading-tight` stack: 1.25
           * was clipping the Arabic diacritics (the fatha in "صَرْح") against
           * the next line, and the heading needs one fluid size instead of
           * four breakpoint overrides.
           */}
          <h1 className="sarh-display-sm text-sarh-navy dark:text-white">
            {t("dir_heroPre")}{" "}
            <span className="text-sarh-goldInk dark:text-sarh-gold">
              {t("dir_heroAccent")}
            </span>
            <br />
            <span className="text-sarh-tealInk dark:text-sarh-teal">
              {t(meta.heroMainKey)}
            </span>
          </h1>

          <p className="sarh-lead max-w-xl text-slate-600 dark:text-slate-300">
            {t(meta.heroLeadKey)}
          </p>

          <form
            className="relative w-full max-w-xl"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              onSearch();
            }}
          >
            {/* Icon on the *start* edge, matching the mockup: in RTL the
                magnifier sits to the right of the placeholder. */}
            <Search
              className="pointer-events-none absolute inset-y-0 start-4 my-auto h-5 w-5 text-sarh-tealInk dark:text-sarh-teal"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder={t(meta.heroSearchKey)}
              aria-label={t(meta.heroSearchKey)}
              // 16px on every viewport: below that, iOS Safari zooms the whole
              // page when the field takes focus.
              className="h-14 w-full rounded-2xl border border-sarh-borderLight bg-white/95 ps-12 pe-5 text-base text-sarh-navy shadow-soft outline-none transition-colors placeholder:text-slate-500 focus:border-sarh-teal focus:ring-4 focus:ring-sarh-teal/15 dark:border-sarh-borderDark dark:bg-sarh-cardDark dark:text-slate-100"
            />
          </form>
        </div>

        {/* ---- Illustration (end column) ---------------------------- */}
        <div className="flex justify-center lg:justify-end">
          <div className="relative w-64 max-w-full sm:w-80">
            <Illustration className="h-auto w-full" />
            {kind === "kindergartens" ? (
              <span className="absolute bottom-6 end-0 hidden max-w-[10rem] rounded-2xl bg-white/92 px-3 py-2 text-center text-xs font-bold leading-5 text-sarh-tealInk shadow-soft backdrop-blur-sm dark:bg-sarh-cardDark/92 dark:text-sarh-teal sm:block">
                {t("dir_kindergartensHeroNote")}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
