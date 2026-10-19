"use client";

import Link from "next/link";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { BookOpen, Compass, Heart, ShieldCheck, Zap } from "lucide-react";

import { SplitHeading } from "@/components/motion/split-heading";
import { TiltCard } from "@/components/motion/tilt-card";
import { useLanguage } from "@/lib/i18n/language-provider";

import { DeskScene } from "./desk-scene";
import { EdgeRibbons } from "./edge-ribbons";
import { HeroDashboardCard } from "./hero-dashboard-card";

gsap.registerPlugin(useGSAP);

/**
 * SARH home hero — the light "desk" composition.
 *
 * Layout is RTL-first: the copy column is the first grid child, so it lands on
 * the right and the dashboard card on the left, exactly as in the reference.
 * Everything flips with the language switcher because the grid and the props
 * both use logical (`start`/`end`) positioning.
 *
 * The entrance is one GSAP timeline rather than a pile of CSS animations, for
 * two reasons: the order is designed (badge → headline words → lead → buttons →
 * card → chip → ribbons) and the timeline can be built once and then skipped
 * entirely for `prefers-reduced-motion: reduce` users.
 *
 * Progressive enhancement: the base state is fully visible. The timeline hides
 * its targets with `gsap.set` inside `useGSAP`, which runs in a layout effect —
 * i.e. after hydration but *before* the browser paints — so the hero is never
 * briefly visible and then hidden, and if the script never runs the page still
 * reads correctly.
 */
export function HomeHero() {
  const { t } = useLanguage();
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;

      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        root.setAttribute("data-hero-ready", "");

        const select = gsap.utils.selector(root);
        const badge = select('[data-hero="badge"]');
        const words = select("[data-split-word]");
        const lead = select('[data-hero="lead"]');
        const ctas = select('[data-hero="ctas"]');
        const proof = select('[data-hero="proof"]');
        const frame = select('[data-hero="card-frame"]');
        const cardBlocks = select('[data-hero="card-frame"] article > *');
        const chip = select('[data-hero="chip"]');
        const ribbons = select('[data-hero="ribbon"]');

        gsap.set([...badge, ...lead, ...ctas, ...proof, ...chip, ...ribbons], {
          autoAlpha: 0,
          y: 16,
        });
        gsap.set(frame, { autoAlpha: 0, y: 36, scale: 0.97 });
        gsap.set(cardBlocks, { autoAlpha: 0, y: 12 });

        const timeline = gsap.timeline({
          defaults: { ease: "power3.out" },
          delay: 0.12,
        });

        timeline
          .to(badge, { autoAlpha: 1, y: 0, duration: 0.5 })
          .from(
            words,
            {
              autoAlpha: 0,
              yPercent: 70,
              duration: 0.7,
              stagger: 0.055,
              ease: "power4.out",
            },
            0.06
          )
          .to(lead, { autoAlpha: 1, y: 0, duration: 0.55 }, 0.3)
          .to(ctas, { autoAlpha: 1, y: 0, duration: 0.55 }, 0.4)
          .to(proof, { autoAlpha: 1, y: 0, duration: 0.5 }, 0.5)
          .to(frame, { autoAlpha: 1, y: 0, scale: 1, duration: 0.85 }, 0.2)
          .to(cardBlocks, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.09 }, 0.5)
          .to(
            chip,
            { autoAlpha: 1, y: 0, duration: 0.55, ease: "back.out(1.7)" },
            0.72
          )
          .to(ribbons, { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.08 }, 0.6);

        // Hover micro-interaction on the two calls to action. They are separate
        // targets from the `ctas` wrapper the timeline animates, so the two
        // never fight over the same property.
        const buttons = select('[data-hero="cta"]');
        const lifts = buttons.map((button) =>
          gsap.quickTo(button, "y", { duration: 0.25, ease: "power2.out" })
        );
        const enters = buttons.map((button, index) => () => lifts[index](-3));
        const leaves = buttons.map((button, index) => () => lifts[index](0));

        buttons.forEach((button, index) => {
          button.addEventListener("pointerenter", enters[index]);
          button.addEventListener("pointerleave", leaves[index]);
        });

        return () => {
          root.removeAttribute("data-hero-ready");
          buttons.forEach((button, index) => {
            button.removeEventListener("pointerenter", enters[index]);
            button.removeEventListener("pointerleave", leaves[index]);
          });
        };
      });

      return () => mm.revert();
    },
    { scope }
  );

  return (
    <section
      id="home"
      ref={scope}
      aria-labelledby="home-hero-title"
      className="relative scroll-mt-24 overflow-hidden border-b border-sarh-borderLight bg-sarh-desk dark:border-sarh-borderDark dark:bg-sarh-bgDark dark:bg-none lg:min-h-[40rem]"
    >
      {/* Soft morning daylight, warm from one corner and cool from the other. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-sarh-desk-soft dark:opacity-20"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -end-24 -top-24 h-80 w-80 rounded-full bg-sarh-teal/10 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -start-20 bottom-0 h-72 w-72 rounded-full bg-sarh-orange/10 blur-3xl"
      />

      <DeskScene />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 py-14 lg:grid-cols-2 lg:gap-10 lg:py-20 xl:px-10">
        {/* ---------------- Copy column (right in RTL) ---------------- */}
        <div className="flex flex-col items-start gap-5">
          <span
            data-hero="badge"
            className="sarh-badge gap-1.5 bg-white/80 px-3 py-1.5 text-sarh-teal ring-1 ring-inset ring-sarh-teal/25 shadow-soft"
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {t("home_heroBadge")}
          </span>

          <SplitHeading
            id="home-hero-title"
            data-hero="title"
            className="text-balance text-[2rem] font-bold leading-[1.25] sm:text-4xl md:text-5xl xl:text-[3.4rem]"
            segments={[
              { text: t("home_heroTitleLead"), tone: "orange" },
              { text: t("home_heroTitleConnect"), tone: "navy" },
              { text: t("home_heroTitlePlace"), tone: "orange" },
              { text: t("home_heroTitleTail"), tone: "navy" },
            ]}
          />

          <p
            data-hero="lead"
            className="max-w-xl text-sm leading-8 text-sarh-inkMute dark:text-slate-300 sm:text-base md:text-lg"
          >
            {t("home_heroLead")}
          </p>

          <div data-hero="ctas" className="flex flex-wrap items-center gap-3">
            <Link
              data-hero="cta"
              href="/explore/centers"
              className="sarh-btn-primary h-12 px-6 text-base shadow-teal-glow hover:brightness-[1.06]"
            >
              <Compass className="h-5 w-5" aria-hidden="true" />
              {t("home_ctaExplore")}
            </Link>
            <Link
              data-hero="cta"
              href="/courses"
              className="sarh-btn-accent h-12 px-6 text-base shadow-gold-glow hover:brightness-[1.06]"
            >
              <BookOpen className="h-5 w-5" aria-hidden="true" />
              {t("home_ctaPrograms")}
            </Link>
          </div>

          <div
            data-hero="proof"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-xs font-bold text-sarh-navy/75 dark:text-slate-300"
          >
            <span className="flex items-center gap-1.5">
              <Zap
                className="h-4 w-4 text-sarh-orange"
                fill="currentColor"
                aria-hidden="true"
              />
              {t("home_trustBadgeSub")}
            </span>
          </div>
        </div>

        {/* ---------------- Dashboard card (left in RTL) ---------------- */}
        <div className="relative">
          <TiltCard data-hero="card-frame">
            <HeroDashboardCard />
          </TiltCard>

          {/* Floating proof chip — attached to the card, hidden on small screens
              where it would overlap the two columns. */}
          {/* Parked below the card rather than across it: overlapping the
              corner is fine, hiding the sync footer underneath it is not. */}
          <div
            data-hero="chip"
            className="absolute -bottom-12 start-4 z-20 hidden max-w-[15rem] items-center gap-2.5 rounded-2xl border border-sarh-orange/25 bg-white px-4 py-3 shadow-soft-lg sm:flex dark:bg-sarh-cardDark"
          >
            <span
              aria-hidden="true"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sarh-orange/15 text-sarh-orange"
            >
              <Heart className="h-4 w-4" fill="currentColor" />
            </span>
            <p className="text-[11px] font-bold leading-5 text-sarh-navy dark:text-slate-100">
              {t("home_trustBadge")}
            </p>
          </div>
        </div>
      </div>

      <EdgeRibbons />
    </section>
  );
}
