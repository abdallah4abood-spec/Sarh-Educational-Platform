"use client";

import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * Per-word heading renderer — the React Bits "SplitText" pattern, implemented
 * locally.
 *
 * Why local: React Bits ships components as source you copy in (its own docs:
 * "Every component installs as source code you own", via the shadcn/jsrepo
 * registry), and the registry install wants to rewrite the project's Tailwind
 * theme. This repo already hand-rolls its motion layer (`motion/reveal.tsx`), so
 * the pattern is implemented here instead — same result, no CLI, and the Sarh
 * tokens stay untouched.
 *
 * Two properties matter more than the animation:
 *   1. The words are `inline-block` so a GSAP timeline can transform each one
 *      independently, while the line still wraps normally.
 *   2. The `<h1>` keeps a single flat accessible name via `aria-label`, and the
 *      visual spans are `aria-hidden` — a screen reader hears one sentence
 *      rather than a dozen disconnected words.
 */

export type HeadingTone = "navy" | "orange" | "teal";

export interface HeadingSegment {
  text: string;
  /** Defaults to `navy`. */
  tone?: HeadingTone;
}

const TONE_CLASS: Record<HeadingTone, string> = {
  navy: "text-sarh-navy dark:text-white",
  orange: "text-sarh-orange",
  teal: "text-sarh-teal",
};

interface SplitHeadingProps
  extends Omit<HTMLAttributes<HTMLHeadingElement>, "children"> {
  segments: HeadingSegment[];
}

export function SplitHeading({ segments, className, ...rest }: SplitHeadingProps) {
  // The flat sentence used as the accessible name.
  const label = segments.map((segment) => segment.text).join(" ");

  return (
    <h1 aria-label={label} {...rest} className={cn(className)}>
      {segments.map((segment, segmentIndex) => {
        const words = segment.text.split(" ").filter(Boolean);

        return (
          <span
            key={`${segmentIndex}-${segment.text}`}
            aria-hidden="true"
            className={cn("inline", TONE_CLASS[segment.tone ?? "navy"])}
          >
            {words.map((word, wordIndex) => (
              // The trailing non-breaking space lives inside the block so two
              // transformed words never collapse into one another.
              <span
                key={`${wordIndex}-${word}`}
                data-split-word=""
                className="inline-block"
              >
                {word}
                {"\u00A0"}
              </span>
            ))}
          </span>
        );
      })}
    </h1>
  );
}
