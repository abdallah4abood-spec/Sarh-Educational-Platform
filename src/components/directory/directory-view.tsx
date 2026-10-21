"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, SearchX, SlidersHorizontal } from "lucide-react";

import { CenterCard } from "./center-card";
import { DirectoryFilterBar, EMPTY_FILTERS, type DirectoryFilters } from "./filter-bar";
import { DirectoryHero } from "./directory-hero";
import { DocumentTitle } from "./document-title";
import { DirectoryPagination } from "./pagination";
import { DirectorySidebar } from "./directory-sidebar";
import { KindergartenCard } from "./kindergarten-card";
import { Button } from "@/components/ui/button";
import { KIND_META, listingsFor, type DirectoryKind } from "@/lib/data/directory";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { useLanguage } from "@/lib/i18n/language-provider";

type SortKey = "rating" | "reviews" | "priceLow" | "priceHigh" | "name";

const PAGE_SIZE = 9;
const DEBOUNCE_MS = 250;

/** Sort dropdown options, in display order. */
const SORT_OPTIONS: { key: SortKey; labelKey: DictionaryKey }[] = [
  { key: "rating", labelKey: "dir_sortRating" },
  { key: "reviews", labelKey: "dir_sortReviews" },
  { key: "priceLow", labelKey: "dir_sortPriceLow" },
  { key: "priceHigh", labelKey: "dir_sortPriceHigh" },
  { key: "name", labelKey: "dir_sortName" },
];

/**
 * Client shell for one directory route.
 *
 * Owns the whole filter → sort → paginate pipeline in one place, so the hero
 * search, the advanced filter bar and the sidebar categories are three views of
 * the same state instead of three independent filters that can disagree.
 *
 * `listingsFor(kind)` is a bundled, offline-safe catalogue (the same pattern the
 * rest of the app uses) — the route itself stays a Server Component and only
 * hands this component a `kind`.
 */
export function DirectoryView({ kind }: { kind: DirectoryKind }) {
  const { t, lang } = useLanguage();
  const meta = KIND_META[kind];
  const all = listingsFor(kind);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filters, setFilters] = useState<DirectoryFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>("rating");
  const [page, setPage] = useState(1);

  const resultsTop = useRef<HTMLDivElement>(null);
  const firstRun = useRef(true);
  const reduceMotion = useReducedMotion();

  // Debounce the hero/filter text so each keystroke does not re-sort the grid.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Any change to the result set sends the reader back to page one.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setPage(1);
  }, [debouncedQuery, filters, sort]);

  const patchFilters = (patch: Partial<DirectoryFilters>) =>
    setFilters((current) => ({ ...current, ...patch }));

  const filtered = useMemo(() => {
    const needle = debouncedQuery.toLowerCase();

    return all.filter((listing) => {
      if (needle) {
        const haystack = `${listing.name.ar} ${listing.name.en}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (filters.region !== "all" && listing.cityKey !== filters.region) return false;
      if (filters.category !== "all" && listing.category !== filters.category) return false;
      if (
        filters.stage !== "any" &&
        !listing.stageKeys.includes(filters.stage as DictionaryKey)
      )
        return false;
      if (filters.rating !== "any" && listing.rating < Number(filters.rating)) return false;
      if (filters.price === "low" && listing.priceMin >= 400) return false;
      if (filters.price === "mid" && (listing.priceMin < 400 || listing.priceMin > 800))
        return false;
      if (filters.price === "high" && listing.priceMin <= 800) return false;
      return true;
    });
  }, [all, debouncedQuery, filters]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      switch (sort) {
        case "reviews":
          return b.reviewsCount - a.reviewsCount;
        case "priceLow":
          return a.priceMin - b.priceMin;
        case "priceHigh":
          return b.priceMax - a.priceMax;
        case "name":
          return a.name[lang].localeCompare(b.name[lang], lang === "ar" ? "ar" : "en");
        default:
          return b.rating - a.rating;
      }
    });
    return rows;
  }, [filtered, sort, lang]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const clearAll = () => {
    setQuery("");
    setDebouncedQuery("");
    setFilters(EMPTY_FILTERS);
    setSort("rating");
  };

  // `smooth` is itself motion: honour the OS setting and jump instead.
  const scrollToResults = () =>
    resultsTop.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });

  const goToPage = (next: number) => {
    setPage(Math.min(Math.max(1, next), pageCount));
    scrollToResults();
  };

  return (
    <>
      {/* Server metadata pins the SEO / share title; this keeps the browser
          tab in step once the reader flips the language toggle. */}
      <DocumentTitle titleKey={meta.docTitleKey} />

      <DirectoryHero
        kind={kind}
        query={query}
        onQuery={setQuery}
        onSearch={scrollToResults}
      />

      <div className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <DirectoryFilterBar
          kind={kind}
          filters={filters}
          onChange={patchFilters}
          onSearch={scrollToResults}
        />

        <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
          {/*
           * The sidebar is second in the DOM and promoted to the first column
           * on `lg` with `order`. It used to rely on DOM order alone, which put
           * the whole sidebar — category list, "why Sarh", newsletter — between
           * the filter bar and the first card on phones: the reader had to
           * scroll past three panels to reach any result. `order` works on
           * grid items in any track count, so the same swap that makes it the
           * first column on desktop makes it the last block on mobile.
           */}
          <aside className="order-2 lg:order-1">
            <DirectorySidebar
              kind={kind}
              selectedCategory={filters.category}
              onCategory={(id) => patchFilters({ category: id })}
            />
          </aside>

          {/*
           * `lg:scroll-mt-[13rem]` clears the pinned filter bar (4rem header +
           * ~7.2rem bar) so a programmatic scroll to the results — the empty
           * state's "clear filters", the hero search, a page change — never
           * parks the first row of cards underneath it. Below `lg` the bar is
           * not sticky, so the plain 10rem offset is enough.
           */}
          <div
            ref={resultsTop}
            className="order-1 scroll-mt-40 lg:order-2 lg:scroll-mt-[13rem]"
          >
            {/* ---- Results header -------------------------------- */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p
                aria-live="polite"
                className="text-base font-bold text-sarh-navy dark:text-white"
              >
                {t("dir_resultsPre")}{" "}
                <bdi>{sorted.length}</bdi> {t(meta.resultsUnitKey)}
              </p>

              <label className="relative flex items-center gap-2">
                <span className="sr-only">{t("dir_sortBy")}</span>
                <span className="flex items-center gap-1.5 rounded-lg border border-sarh-borderLight bg-sarh-cardLight px-3 text-xs font-semibold text-sarh-inkMute dark:border-sarh-borderDark dark:bg-sarh-cardDark dark:text-slate-400">
                  <SlidersHorizontal
                    className="h-3.5 w-3.5 text-sarh-tealInk dark:text-sarh-teal"
                    aria-hidden="true"
                  />
                  {t("dir_sortBy")}
                </span>
                <span className="relative">
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SortKey)}
                    aria-label={t("dir_sortBy")}
                    className="h-10 appearance-none rounded-lg border border-sarh-borderLight bg-sarh-cardLight pe-8 ps-3 text-sm font-semibold text-sarh-navy outline-none transition-colors focus:border-sarh-teal focus:ring-2 focus:ring-sarh-teal/30 dark:border-sarh-borderDark dark:bg-sarh-cardDark dark:text-slate-100"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute inset-y-0 end-2.5 my-auto h-4 w-4 text-sarh-inkMute dark:text-slate-400"
                    aria-hidden="true"
                  />
                </span>
              </label>
            </div>

            {/* ---- Grid ------------------------------------------ */}
            {visible.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="sarh-card flex flex-col items-center gap-3 px-6 py-16 text-center"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-sarh-gold/15 text-sarh-goldInk dark:text-sarh-gold">
                  <SearchX className="h-7 w-7" aria-hidden="true" />
                </span>
                <h2 className="text-lg font-bold text-sarh-navy dark:text-white">
                  {t("dir_emptyTitle")}
                </h2>
                <p className="sarh-body max-w-md text-sarh-inkMute dark:text-slate-400">
                  {t("dir_emptyLead")}
                </p>
                <Button variant="outline" size="sm" className="mt-2" onClick={clearAll}>
                  {t("dir_clearFilters")}
                </Button>
              </motion.div>
            ) : (
              /*
               * The grid itself is stable and only the cards animate.
               *
               * Keying the *container* on the filter state made every filter
               * change tear the whole grid down and rebuild it, and during the
               * exit animation the previous page's cards were still in the DOM
               * alongside the new ones — the grid briefly rendered 11 cards for
               * 2+9 results, with the old list visible through the new one.
               * Keying each card by its id means exactly the cards that
               * changed animate, and unmount cleanup happens immediately.
               */
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence mode="popLayout" initial={false}>
                  {visible.map((listing, index) =>
                    kind === "centers" ? (
                      <CenterCard key={listing.id} center={listing} index={index} />
                    ) : (
                      <KindergartenCard
                        key={listing.id}
                        kindergarten={listing}
                        index={index}
                      />
                    )
                  )}
                </AnimatePresence>
              </div>
            )}

            <DirectoryPagination page={safePage} pageCount={pageCount} onPage={goToPage} />
          </div>
        </div>
      </div>
    </>
  );
}
