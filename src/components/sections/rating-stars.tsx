import { Star } from "lucide-react";

import { cn, ratingStars } from "@/lib/utils";

interface RatingStarsProps {
  /** 0–5, may carry one decimal (4.5 renders four stars + a half). */
  rating: number;
  /** Spoken label, e.g. "التقييم 4.9 من 5" — the stars are decorative. */
  label: string;
  size?: "sm" | "md";
  className?: string;
}

const SIZES = { sm: "h-3.5 w-3.5", md: "h-4 w-4" } as const;

/**
 * Five-star rating display built on the shared `ratingStars` helper, so the
 * course cards and the testimonials can never round differently.
 *
 * The whole row is a single `role="img"` with an aria-label: a screen reader
 * announces "التقييم 4.9 من 5" instead of five meaningless star glyphs.
 */
export function RatingStars({ rating, label, size = "sm", className }: RatingStarsProps) {
  const { filled, half } = ratingStars(rating);
  const dimension = SIZES[size];

  return (
    <span role="img" aria-label={label} className={cn("inline-flex items-center gap-0.5", className)}>
      {[0, 1, 2, 3, 4].map((index) => {
        const isFilled = index < filled;
        const isHalf = !isFilled && index === filled && half;

        return (
          <span key={index} className="relative inline-flex">
            <Star
              className={cn(
                dimension,
                isFilled
                  ? "text-sarh-gold"
                  : "text-slate-300 dark:text-slate-600"
              )}
              fill={isFilled ? "currentColor" : "none"}
              aria-hidden="true"
            />
            {isHalf ? (
              // Half star: the filled glyph clipped to its start half, so it
              // mirrors correctly in both RTL and LTR.
              <span
                aria-hidden="true"
                className="absolute inset-y-0 start-0 w-1/2 overflow-hidden"
              >
                <Star className={cn(dimension, "text-sarh-gold")} fill="currentColor" />
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
