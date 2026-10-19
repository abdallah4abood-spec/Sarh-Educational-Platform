import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import type { Language } from "@/lib/i18n/dictionary";

/** Merge conditional class names, resolving Tailwind conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Cached `Intl.NumberFormat` instances.
 *
 * Building a formatter is not free and a catalog renders dozens of numbers, so
 * they are memoised by language + precision instead of constructed per cell.
 */
const countFormatters = new Map<string, Intl.NumberFormat>();

/** Grouped number in the digit system of the active language. */
export function formatCount(
  value: number,
  lang: Language = "ar",
  fractionDigits = 0
): string {
  const locale = lang === "ar" ? "ar-PS" : "en-US";
  const cacheKey = `${locale}:${fractionDigits}`;

  let formatter = countFormatters.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    countFormatters.set(cacheKey, formatter);
  }

  return formatter.format(value);
}

/** Format a number as Arabic-Indic-safe currency (شيكل جديد). */
export function formatSarh(amount: number, locale = "ar-PS"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** "4.6" →5 filled stars out of 5. */
export function ratingStars(rating: number): { filled: number; half: boolean } {
  const clamped = Math.max(0, Math.min(5, rating));
  return {
    filled: Math.floor(clamped),
    half: clamped - Math.floor(clamped) >= 0.5,
  };
}
