"use client";

import { useLanguage } from "@/lib/i18n/language-provider";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

interface Ribbon {
  labelKey: DictionaryKey;
  /** Brand surface for the strip. */
  className: string;
}

/*
 * Solid fills, white type: every strip uses the *ink* variant of its hue.
 * The base brand teal (#00A99D) and gold (#F2994A) are 2.9:1 and 2.2:1 against
 * white and were unreadable as 11px labels; tealInk and goldInk keep the same
 * identity at 5.4:1 and 5.2:1.
 */
const RIBBONS: Ribbon[] = [
  { labelKey: "home_ribbonEducation", className: "bg-sarh-tealInk" },
  { labelKey: "home_ribbonFuture", className: "bg-sarh-navy" },
  { labelKey: "home_ribbonChildren", className: "bg-sarh-goldInk" },
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
