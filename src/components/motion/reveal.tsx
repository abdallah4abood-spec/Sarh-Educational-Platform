"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { cn } from "@/lib/utils";

gsap.registerPlugin(ScrollTrigger, useGSAP);

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger sister cards: the third card in a grid gets 2 × 80ms, etc. */
  delayMs?: number;
  /** How far the element travels while fading in. */
  distance?: number;
}

/**
 * Entrance animation for a section, a card or a heading — GSAP ScrollTrigger.
 *
 * The tween starts the first time the element approaches the viewport and is
 * then killed (`once: true`), so a long landing page ends with zero active
 * ScrollTriggers behind the fold. `gsap.matchMedia` is the switch that makes
 * `prefers-reduced-motion: reduce` a no-op: the tween is never created, so the
 * content simply sits in its final state.
 *
 * The children are always in the DOM and never hidden by CSS — the initial
 * fade is applied by JavaScript — so crawlers, screen readers and text
 * selection see the real markup even if the script never runs.
 *
 * The tween fades `opacity`, deliberately not GSAP's `autoAlpha`. `autoAlpha`
 * also flips `visibility: hidden`, and a `visibility: hidden` subtree is removed
 * from the accessibility tree: every card that had not scrolled into view yet
 * was announced as an empty list item (the homepage's four "why Sarh" cards
 * were exactly that). Opacity alone keeps the text readable to a screen reader
 * and to find-in-page while the element is still waiting for its cue.
 */
export function Reveal({
  children,
  className,
  delayMs = 0,
  distance = 28,
}: RevealProps) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const node = scope.current;
      if (!node) return;

      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          node,
          { opacity: 0, y: distance },
          {
            opacity: 1,
            y: 0,
            duration: 0.75,
            ease: "power3.out",
            delay: delayMs / 1000,
            scrollTrigger: {
              trigger: node,
              // A touch before the element is fully on screen, so the motion
              // finishes exactly as the reader arrives at it.
              start: "top 88%",
              once: true,
            },
          }
        );
      });

      return () => mm.revert();
    },
    { scope }
  );

  return (
    <div ref={scope} className={cn(className)}>
      {children}
    </div>
  );
}
