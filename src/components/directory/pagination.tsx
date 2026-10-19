"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { useLanguage } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/**
 * Page list with a window around the current page: 1 … 4 [5] 6 … 12.
 *
 * Exported for reuse/testability; kept out of the component body so the array
 * is not rebuilt on every render of the pagination control.
 */
export function pageItems(current: number, total: number): (number | "gap")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const items: (number | "gap")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) items.push("gap");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < total - 1) items.push("gap");
  items.push(total);

  return items;
}

/**
 * Directory pagination.
 *
 * The arrows are direction-aware: in RTL "previous" points right, in LTR it
 * points left, so the glyph is rotated with the `ltr:` variant rather than
 * shipping two icons. Every button keeps a full accessible label ("الصفحة 3")
 * because a bare digit is ambiguous once the page is read aloud.
 */
export function DirectoryPagination({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}) {
  const { t } = useLanguage();
  if (pageCount <= 1) return null;

  const items = pageItems(page, pageCount);

  const arrowClass =
    "grid h-10 w-10 place-items-center rounded-lg border border-sarh-borderLight text-sarh-navy transition-colors hover:border-sarh-teal hover:text-sarh-teal disabled:cursor-not-allowed disabled:opacity-40 dark:border-sarh-borderDark dark:text-slate-200";

  return (
    <nav
      aria-label={t("dir_pageLabel")}
      className="mt-8 flex items-center justify-center gap-1.5"
    >
      <button
        type="button"
        className={arrowClass}
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        aria-label={t("dir_prevPage")}
        title={t("dir_prevPage")}
      >
        <ChevronRight className="h-4 w-4 ltr:rotate-180" aria-hidden="true" />
      </button>

      {items.map((item, index) =>
        item === "gap" ? (
          <span
            key={`gap-${index}`}
            className="px-1 text-sm font-bold text-slate-400"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onPage(item)}
            aria-current={item === page ? "page" : undefined}
            aria-label={`${t("dir_pageLabel")} ${item}`}
            className={cn(
              "grid h-10 w-10 place-items-center rounded-lg border text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal",
              item === page
                ? "border-sarh-teal bg-sarh-teal text-white shadow-teal-glow"
                : "border-sarh-borderLight text-sarh-navy hover:border-sarh-teal hover:text-sarh-teal dark:border-sarh-borderDark dark:text-slate-200"
            )}
          >
            <bdi>{item}</bdi>
          </button>
        )
      )}

      <button
        type="button"
        className={arrowClass}
        onClick={() => onPage(page + 1)}
        disabled={page >= pageCount}
        aria-label={t("dir_nextPage")}
        title={t("dir_nextPage")}
      >
        <ChevronLeft className="h-4 w-4 ltr:rotate-180" aria-hidden="true" />
      </button>
    </nav>
  );
}
