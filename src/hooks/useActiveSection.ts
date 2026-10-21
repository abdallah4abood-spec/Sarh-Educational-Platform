"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Scroll-spy for the landing page navigation.
 *
 * Watches the given section ids and returns the one currently crossing the
 * upper-middle band of the viewport — the band a reader perceives as "where I
 * am". The `rootMargin` is what makes it feel right: a section counts as active
 * only while its top is above 40% of the screen and its bottom is still below
 * 55%, so exactly one section is active at a time instead of several.
 *
 * IMPORTANT: `ids` must be a stable reference (a module-level constant). The
 * effect re-subscribes whenever the array identity changes, so passing an
 * inline literal here would tear down and rebuild the observer on every render.
 *
 * The observer is also rebuilt on every route change: the sections watched here
 * live on one page, and the header is shared by all of them. Without that, a
 * header that mounted on `/contact` would have found none of the elements and
 * silently never highlighted anything after navigating home.
 */
export function useActiveSection(ids: readonly string[]): string {
  const [active, setActive] = useState<string>(ids[0] ?? "");
  const pathname = usePathname();

  useEffect(() => {
    // Start from the top section of the new route, not the one left behind.
    setActive(ids[0] ?? "");

    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);

    if (!elements.length || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible?.target.id) {
          setActive(visible.target.id);
          return;
        }
        // Nothing is in the band any more: the reader scrolled past the last
        // watched section (or back above the first), so the spy returns to the
        // top of the page instead of leaving a stale highlight behind.
        if (entries.every((entry) => !entry.isIntersecting)) {
          setActive(ids[0] ?? "");
        }
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [ids, pathname]);

  return active;
}
