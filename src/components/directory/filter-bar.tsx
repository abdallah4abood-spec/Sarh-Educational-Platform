"use client";

import type { ReactNode } from "react";
import {
  CalendarCheck,
  ChevronDown,
  Layers,
  MapPin,
  Search,
  SlidersHorizontal,
  Star,
} from "lucide-react";

import {
  DIRECTORY_REGIONS,
  KIND_META,
  categoriesFor,
  stagesFor,
  type DirectoryKind,
} from "@/lib/data/directory";
import { useLanguage } from "@/lib/i18n/language-provider";

/** Filter state owned by the directory view; every value is a plain string id. */
export interface DirectoryFilters {
  region: string;
  category: string;
  stage: string;
  rating: string;
  price: string;
}

export const EMPTY_FILTERS: DirectoryFilters = {
  region: "all",
  category: "all",
  stage: "any",
  rating: "any",
  price: "any",
};

function SelectShell({
  label,
  icon,
  value,
  onChange,
  children,
}: {
  label: string;
  icon: ReactNode;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="relative flex min-w-[8rem] flex-1 flex-col gap-1 sm:min-w-[9rem]">
      <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </span>
      <span className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          className="h-10 w-full appearance-none rounded-lg border border-sarh-borderLight bg-sarh-cardLight pe-8 ps-3 text-sm font-medium text-sarh-navy outline-none transition-colors focus:border-sarh-teal focus:ring-2 focus:ring-sarh-teal/30 dark:border-sarh-borderDark dark:bg-sarh-cardDark dark:text-slate-100"
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute inset-y-0 end-2.5 my-auto h-4 w-4 text-slate-400"
          aria-hidden="true"
        />
      </span>
    </label>
  );
}

/**
 * Advanced filter bar — sits directly under the hero and stays pinned while the
 * results scroll.
 *
 * The sticky contract (this is the z-index/offset fix called out in the design
 * review):
 *   - the site header is `sticky top-0 z-50` and is 4rem tall;
 *   - from `lg` up — the only widths where the six controls fit on one row —
 *     this bar pins at `sticky top-16 z-30`: exactly below the header and one
 *     layer under it, so it can never cover the navigation;
 *   - it paints a near-opaque page-coloured backdrop of its own, so cards
 *     scroll *under* the panel instead of showing through the blur;
 *   - cards carry no z-index of their own, so nothing in the grid can rise
 *     above it and "cut off" the bar or vice-versa;
 *   - below `lg` the controls wrap onto several rows, so the bar stays in the
 *     normal flow instead of pinning a 300px-tall panel over the results — the
 *     reason the old always-sticky version obscured the cards on phones;
 *   - the results container carries a scroll margin large enough to clear the
 *     pinned bar (`lg:scroll-mt-[13rem]`), so programmatic scrolls and the
 *     hero's search never park the first row of cards behind it.
 */
export function DirectoryFilterBar({
  kind,
  filters,
  onChange,
  onSearch,
}: {
  kind: DirectoryKind;
  filters: DirectoryFilters;
  onChange: (patch: Partial<DirectoryFilters>) => void;
  onSearch: () => void;
}) {
  const { t } = useLanguage();
  const meta = KIND_META[kind];
  const categories = categoriesFor(kind);
  const stages = stagesFor(kind);

  return (
    <div className="relative -mx-4 mb-8 border-b border-sarh-borderLight/70 bg-sarh-bgLight/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:sticky lg:top-16 lg:z-30 dark:border-sarh-borderDark/70 dark:bg-sarh-bgDark/90">
      <div className="sarh-card mx-auto flex flex-wrap items-end gap-3 rounded-2xl p-3.5 shadow-soft">
        <SelectShell
          label={t(meta.filterRegionKey)}
          icon={<MapPin className="h-3.5 w-3.5" aria-hidden="true" />}
          value={filters.region}
          onChange={(value) => onChange({ region: value })}
        >
          <option value="all">{t("dir_filterAllRegions")}</option>
          {DIRECTORY_REGIONS.map((key) => (
            <option key={key} value={key}>
              {t(key)}
            </option>
          ))}
        </SelectShell>

        <SelectShell
          label={t(meta.filterTypeKey)}
          icon={<Layers className="h-3.5 w-3.5" aria-hidden="true" />}
          value={filters.category}
          onChange={(value) => onChange({ category: value })}
        >
          <option value="all">{t("dir_filterAllTypes")}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {t(category.labelKey)}
            </option>
          ))}
        </SelectShell>

        <SelectShell
          label={t(meta.filterStageKey)}
          icon={<CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />}
          value={filters.stage}
          onChange={(value) => onChange({ stage: value })}
        >
          <option value="any">{t(meta.filterAllStagesKey)}</option>
          {stages.map((key) => (
            <option key={key} value={key}>
              {t(key)}
            </option>
          ))}
        </SelectShell>

        <SelectShell
          label={t("dir_filterRating")}
          icon={<Star className="h-3.5 w-3.5" aria-hidden="true" />}
          value={filters.rating}
          onChange={(value) => onChange({ rating: value })}
        >
          <option value="any">{t("dir_filterAnyRating")}</option>
          <option value="4">{t("dir_filterRating4")}</option>
          <option value="4.5">{t("dir_filterRating45")}</option>
        </SelectShell>

        <SelectShell
          label={t(meta.filterPriceKey)}
          icon={<SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />}
          value={filters.price}
          onChange={(value) => onChange({ price: value })}
        >
          <option value="any">{t("dir_filterAnyPrice")}</option>
          <option value="low">{t("dir_filterPriceLow")}</option>
          <option value="mid">{t("dir_filterPriceMid")}</option>
          <option value="high">{t("dir_filterPriceHigh")}</option>
        </SelectShell>

        <button
          type="button"
          onClick={onSearch}
          className="sarh-btn-primary h-10 min-w-[7rem] flex-none rounded-lg shadow-teal-glow hover:brightness-110"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          {t("dir_searchAction")}
        </button>
      </div>
    </div>
  );
}
