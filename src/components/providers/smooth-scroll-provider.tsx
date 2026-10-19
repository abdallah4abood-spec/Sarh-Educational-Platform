"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Lenis from "lenis";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import "lenis/dist/lenis.css";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Clearance for the sticky header, so a section title never lands underneath
 * the bar. Matches the `h-16` header plus a little air.
 */
const HEADER_OFFSET = -88;

/**
 * Module-scoped handle to the live Lenis instance.
 *
 * ScrollTrigger-driven animations and the anchor links run outside of React's
 * render tree (rAF callbacks, native events), so a ref alone is not enough —
 * they need a stable way to ask "is smooth scrolling on, and please scroll to
 * this element". `null` means Lenis is not running and native scrolling is in
 * charge (reduced-motion users, or before hydration).
 */
let lenisInstance: Lenis | null = null;

export function getLenis(): Lenis | null {
  return lenisInstance;
}

interface SmoothScrollValue {
  /** True once Lenis has taken over the scroll. */
  enabled: boolean;
  /**
   * Scroll to an element id (`"#courses"` or `"courses"`).
   * Returns false when the element is not in the current document, so callers
   * can fall back to a normal navigation.
   */
  scrollToHash: (hash: string) => boolean;
  /** Pause/resume the page scroll — used while a modal owns the screen. */
  lock: (locked: boolean) => void;
}

const SmoothScrollContext = createContext<SmoothScrollValue | null>(null);

/**
 * Global ultra-smooth scrolling (Lenis) with GSAP ScrollTrigger kept in sync.
 *
 * Lenis owns the wheel/touch input and Animates `window.scrollY` through its own
 * rAF loop; that loop is driven by `gsap.ticker` and every frame it produces is
 * forwarded to `ScrollTrigger.update`, so scroll-linked animations never lag
 * behind or fight the smoothing (the failure mode of naively stacking the two
 * libraries). `lagSmoothing(0)` stops GSAP from skipping time when the main
 * thread stutters, which would otherwise desync the two loops.
 *
 * `prefers-reduced-motion: reduce` disables Lenis entirely: no smoothing, no
 * scroll hijacking, native behaviour with `scroll-behavior` left to the OS.
 */
export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const unlockedFallback = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // Honour the OS preference: leave the document scrolling natively.
      return;
    }

    const lenis = new Lenis({
      // GSAP drives the frame loop below, so Lenis must not start its own.
      autoRaf: false,
      duration: 1.05,
      smoothWheel: true,
      // Anchor jumps are handled by `scrollToHash`, not by the browser.
      anchors: false,
    });

    lenisInstance = lenis;
    setEnabled(true);

    const onScroll = () => ScrollTrigger.update();
    lenis.on("scroll", onScroll);

    const tick = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // Images and fonts settle after first paint and change the page height.
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("load", refresh);

    return () => {
      window.removeEventListener("load", refresh);
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.off("scroll", onScroll);
      lenis.destroy();
      lenisInstance = null;
      setEnabled(false);
    };
  }, []);

  const scrollToHash = useCallback((hash: string): boolean => {
    if (typeof document === "undefined") return false;

    const id = decodeURIComponent(hash.replace(/^#/, ""));
    if (!id) return false;

    const element = document.getElementById(id);
    if (!element) return false;

    // Compute the destination from the live rect rather than passing the
    // element to Lenis. Sections also carry a CSS `scroll-margin-top` (for
    // native, script-less anchor jumps), and handing the element over lets that
    // margin stack on top of the offset — landing the heading ~180px down
    // instead of the intended ~90. A number is unambiguous in every Lenis
    // version, and `getBoundingClientRect` is not affected by scroll-margin.
    const top = window.scrollY + element.getBoundingClientRect().top + HEADER_OFFSET;

    const lenis = lenisInstance;
    if (lenis) {
      lenis.scrollTo(Math.max(0, top), {
        duration: 1.1,
        onComplete: () => ScrollTrigger.refresh(),
      });
    } else {
      // Reduced motion (or no Lenis yet): jump without hijacking the scroll.
      const reduced =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: Math.max(0, top), behavior: reduced ? "auto" : "smooth" });
    }

    // Keep the address bar truthful so the link stays shareable and the back
    // button works. `replaceState` avoids pushing a history entry per click.
    try {
      window.history.replaceState(null, "", `#${id}`);
    } catch {
      /* history may be unavailable in sandboxed frames — scrolling still ran */
    }

    return true;
  }, []);

  const lock = useCallback((locked: boolean) => {
    const lenis = lenisInstance;
    if (lenis) {
      if (locked) lenis.stop();
      else lenis.start();
      return;
    }
    // No Lenis (reduced motion): fall back to the classic overflow lock.
    if (typeof document === "undefined") return;
    unlockedFallback.current = locked;
    document.body.style.overflow = locked ? "hidden" : "";
  }, []);

  /**
   * Every in-page `#anchor` on the platform scrolls through Lenis.
   *
   * The handler is delegated on the document because anchors live in a dozen
   * components (hero calls to action, footer, course cards, the mobile drawer)
   * and Next.js intercepts same-page hash clicks — which would otherwise
   * neither smooth-scroll nor fire `hashchange`. One listener keeps the
   * behaviour identical everywhere, including in markup nobody has to remember
   * to wire up. Modifier-clicks (`Ctrl`/`Cmd`/middle) keep their native
   * meaning, and a hash that is not in this document falls through to the
   * browser so a cross-page anchor still navigates.
   *
   * It runs in the CAPTURE phase on purpose: `<Link>`'s own handler calls
   * `preventDefault()` to do its client-side navigation, and that flag is
   * already set by the time a bubble-phase listener sees the event — the click
   * would then navigate, set the hash, and never scroll (the App Router does
   * not scroll to a hash it routes). Capturing first means the anchor wins and
   * the router never gets a chance to swallow it.
   */
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as Element | null;
      const anchor = target?.closest?.(
        'a[href^="#"]'
      ) as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank") return;

      const href = anchor.getAttribute("href");
      if (!href || href === "#") return;

      if (scrollToHash(href)) event.preventDefault();
    };

    document.addEventListener("click", onClick, { capture: true });
    return () =>
      document.removeEventListener("click", onClick, { capture: true });
  }, [scrollToHash]);

  /**
   * A hash that arrives with a navigation (`/courses` → `/#testimonials`) is
   * only scrollable once the destination route has rendered, which is what this
   * effect waits for: it runs on every pathname change and on `hashchange`.
   */
  useEffect(() => {
    const run = () => {
      if (!window.location.hash) return;
      // Two frames: one for the route commit, one for fonts/images to settle.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToHash(window.location.hash);
        });
      });
    };

    run();
    window.addEventListener("hashchange", run);

    // A cold arrival at `/#section` happens while the destination route is still
    // painting and its images and fonts are still loading, so the target is not
    // yet where it will end up. Re-run once the document reports itself
    // complete — this is what makes a cross-page section link land exactly right
    // instead of a screen short.
    const onLoad = () => {
      if (window.location.hash) run();
    };
    if (document.readyState !== "complete") {
      window.addEventListener("load", onLoad);
    }

    return () => {
      window.removeEventListener("hashchange", run);
      window.removeEventListener("load", onLoad);
    };
  }, [pathname, scrollToHash]);

  const value = useMemo<SmoothScrollValue>(
    () => ({ enabled, scrollToHash, lock }),
    [enabled, scrollToHash, lock]
  );

  return (
    <SmoothScrollContext.Provider value={value}>
      {children}
    </SmoothScrollContext.Provider>
  );
}

export function useSmoothScroll(): SmoothScrollValue {
  const context = useContext(SmoothScrollContext);
  if (!context) {
    throw new Error("useSmoothScroll must be used inside <SmoothScrollProvider>");
  }
  return context;
}
