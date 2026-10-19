"use client";

import { useLanguage } from "@/lib/i18n/language-provider";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

interface Ribbon {
  labelKey: DictionaryKey;
  /** Brand surface for the strip. */
  className: string;
}

const RIBBONS: Ribbon[] = [
  { labelKey: "home_ribbonEducation", className: "bg-sarh-teal" },
  { labelKey: "home_ribbonFuture", className: "bg-sarh-navy" },
  { labelKey: "home_ribbonChildren", className: "bg-sarh-orange" },
];

/**
 * The vertical ribbon badges pinned to the far edge of the hero.
 *
 * They sit on the *logical* `end` edge, which is the far left in the default
 * Arabic RTL layout (matching the reference composition) and mirrors to the
 * right once the language switcher flips the document to LTR.
 *
 * The strips are a real list with a group label rather than three decorative
 * divs: they carry actual words, so a screen reader should announce them as a
 * set of values instead of silently skipping them. They are hidden below `md`,
 * where there is no margin to hold them without covering the copy.
 */
export function EdgeRibbons({ className }: { className?: string }) {
  const { t } = useLanguage();

  return (
    <ul
      aria-label={t("home_ribbonLabel")}
      className={cn(
        "absolute end-2 top-1/2 z-10 hidden -translate-y-1/2 flex-col items-end gap-2.5 md:flex",
        className
      )}
    >
      {RIBBONS.map((ribbon) => (
        <li
          key={ribbon.labelKey}
          data-hero="ribbon"
          className={cn(
            "sarh-ribbon rounded-s-xl px-2 py-4 text-[11px] font-bold text-white shadow-soft",
            "transition-transform duration-300 hover:scale-[1.06]",
            ribbon.className
          )}
        >
          {t(ribbon.labelKey)}
        </li>
      ))}
    </ul>
  );
}
