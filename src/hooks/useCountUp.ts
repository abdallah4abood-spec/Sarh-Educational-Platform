"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Count a number up from 0 once its element scrolls into view.
 *
 * Returns the ref to attach to the element that owns the number, plus the
 * current display value. The animation is driven by `requestAnimationFrame`
 * with an ease-out curve so it settles instead of stopping dead.
 *
 * Two escape hatches keep this safe:
 *   - `prefers-reduced-motion: reduce` → the final value is set synchronously,
 *     no frames are scheduled at all;
 *   - a browser without IntersectionObserver → same, final value immediately.
 *
 * The counter never re-runs: after one pass the observer disconnects, so a user
 * scrolling up and down does not re-trigger it.
 */
export function useCountUp<T extends HTMLElement>(
  target: number,
  durationMs = 1500
): { ref: React.RefObject<T>; value: number } {
  const ref = useRef<T>(null);
  const [value, setValue] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced || typeof IntersectionObserver === "undefined") {
      setValue(target);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        // One pass only: count once, then stop observing.
        observer.disconnect();

        const start = performance.now();
        const step = (now: number) => {
          const progress = Math.min(1, (now - start) / durationMs);
          const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
          setValue(progress < 1 ? Math.round(target * eased) : target);
          if (progress < 1) frameRef.current = requestAnimationFrame(step);
        };
        frameRef.current = requestAnimationFrame(step);
      },
      { threshold: 0.4 }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, durationMs]);

  return { ref, value };
}
