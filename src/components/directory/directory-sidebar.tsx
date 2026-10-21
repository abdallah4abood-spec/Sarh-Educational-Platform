"use client";

import {
  BookOpen,
  Boxes,
  Check,
  Cog,
  GraduationCap,
  Home,
  Landmark,
  Laptop,
  Languages,
  LayoutGrid,
  Palette,
  School,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";

import { NewsletterForm } from "@/components/sections/newsletter-form";
import {
  KIND_META,
  categoriesFor,
  type CategoryIcon,
  type DirectoryKind,
} from "@/lib/data/directory";
import { useLanguage } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/** Category icon tokens → components (keeps lucide out of the data module). */
const ICONS: Record<CategoryIcon, LucideIcon> = {
  school: School,
  book: BookOpen,
  users: Users,
  languages: Languages,
  cog: Cog,
  palette: Palette,
  laptop: Laptop,
  home: Home,
  landmark: Landmark,
  blocks: Boxes,
  star: Star,
};

/**
 * Directory sidebar.
 *
 * Three stacked panels, exactly as the approved layout: the category taxonomy
 * that doubles as a filter, the trust-building "why Sarh" widget, and the
 * newsletter capture. It is the first column on `lg` and collapses under the
 * grid on small screens so the results are never pushed below the fold.
 */
export function DirectorySidebar({
  kind,
  selectedCategory,
  onCategory,
}: {
  kind: DirectoryKind;
  selectedCategory: string;
  onCategory: (id: string) => void;
}) {
  const { t } = useLanguage();
  const meta = KIND_META[kind];
  const categories = categoriesFor(kind);

  return (
    <div className="flex flex-col gap-5">
      {/* ---- Categories -------------------------------------------- */}
      <section className="sarh-card p-5">
        <h2 className="mb-4 flex items-center gap-2 text-base font-bold leading-7 text-sarh-navy dark:text-white">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-sarh-teal/10 text-sarh-tealInk dark:text-sarh-teal">
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          </span>
          {t("dir_sidebarCategories")}
        </h2>

        <ul className="flex flex-col gap-1">
          <li>
            <button
              type="button"
              onClick={() => onCategory("all")}
              aria-pressed={selectedCategory === "all"}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-tealInk",
                selectedCategory === "all"
                  ? "bg-sarh-teal/10 text-sarh-tealInk dark:text-sarh-teal"
                  : "text-sarh-navy hover:bg-sarh-teal/5 hover:text-sarh-tealInk dark:text-slate-200 dark:hover:text-sarh-teal"
              )}
            >
              <span className="flex items-center gap-2.5">
                <LayoutGrid
                  className="h-4 w-4 text-sarh-tealInk dark:text-sarh-teal"
                  aria-hidden="true"
                />
                {t("dir_allCategories")}
              </span>
            </button>
          </li>
          {categories.map((category) => {
            const Icon = ICONS[category.icon];
            const active = selectedCategory === category.id;
            return (
              <li key={category.id}>
                <button
                  type="button"
                  onClick={() => onCategory(active ? "all" : category.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-tealInk",
                    active
                      ? "bg-sarh-teal/10 text-sarh-tealInk dark:text-sarh-teal"
                      : "text-sarh-navy hover:bg-sarh-teal/5 hover:text-sarh-tealInk dark:text-slate-200 dark:hover:text-sarh-teal"
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon
                      className="h-4 w-4 text-sarh-tealInk dark:text-sarh-teal"
                      aria-hidden="true"
                    />
                    {t(category.labelKey)}
                  </span>
                  <span className="shrink-0 text-xs font-bold text-sarh-inkMute dark:text-slate-400">
                    <bdi>({category.count})</bdi>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---- Why choose Sarh -------------------------------------- */}
      <section className="relative overflow-hidden rounded-2xl bg-sarh-mist p-5 ring-1 ring-inset ring-sarh-teal/15 dark:bg-sarh-cardDark">
        <h2 className="mb-4 text-base font-bold leading-7 text-sarh-navy dark:text-white">
          {t("dir_whyTitle")}
        </h2>
        <ul className="flex flex-col gap-2.5">
          {[t("dir_why1"), t("dir_why2"), t(meta.why3Key), t(meta.why4Key)].map(
            (line) => (
              <li
                key={line}
                className="flex items-start gap-2 text-sm font-medium leading-6 text-slate-600 dark:text-slate-300"
              >
                <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-sarh-tealInk text-white">
                  <Check className="h-3 w-3" aria-hidden="true" />
                </span>
                {line}
              </li>
            )
          )}
        </ul>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-4 -end-4 grid h-24 w-24 place-items-center rounded-full bg-sarh-teal/10 text-sarh-tealInk dark:text-sarh-teal"
        >
          <GraduationCap className="h-12 w-12" />
        </span>
      </section>

      {/* ---- Newsletter ------------------------------------------- */}
      <section className="sarh-card p-5">
        <h2 className="text-base font-bold leading-7 text-sarh-navy dark:text-white">
          {t("dir_newsletterTitle")}
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-sarh-inkMute dark:text-slate-400">
          {t(meta.newsletterLeadKey)}
        </p>
        <div className="mt-4">
          <NewsletterForm
            placeholder={t("dir_newsletterPlaceholder")}
            cta={t("dir_newsletterCta")}
            showHint={false}
            idPrefix="dir-newsletter"
          />
        </div>
      </section>
    </div>
  );
}
