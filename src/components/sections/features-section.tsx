"use client";

import { Award, BadgeCheck, CalendarClock, GraduationCap, ShieldCheck, type LucideIcon } from "lucide-react";

import { Reveal } from "@/components/motion/reveal";
import { FEATURES, type Feature, type FeatureIcon } from "@/lib/data/learn-catalog";
import { useLanguage } from "@/lib/i18n/language-provider";

/** Icon per feature slot — resolved here so the data module stays icon-free. */
const FEATURE_ICONS: Record<FeatureIcon, LucideIcon> = {
  certificate: GraduationCap,
  instructor: BadgeCheck,
  schedule: CalendarClock,
  shield: Award,
};

/**
 * Bento span per feature: the first and last cards run wide on desktop so the
 * 2×3 grid reads as an intentional composition rather than a uniform wall.
 */
const FEATURE_SPAN: Record<Feature["id"], string> = {
  content: "lg:col-span-2",
  instructors: "lg:col-span-1",
  schedule: "lg:col-span-1",
  certificates: "lg:col-span-2",
};

/**
 * Core features & smart benefits.
 *
 * Each card lifts on hover and its icon container gains a soft teal→gold halo
 * (`group-hover`), which is the only motion in the section — the interaction
 * says "this is a card you can act on" without animating any layout.
 */
export function FeaturesSection() {
  const { t } = useLanguage();

  return (
    <section
      id="features"
      aria-labelledby="learn-features-title"
      className="sarh-section scroll-mt-24 border-y border-sarh-borderLight bg-white/60 px-6 dark:border-sarh-borderDark dark:bg-sarh-cardDark/40"
    >
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 text-center">
          <span className="sarh-badge bg-sarh-teal/10 text-sarh-tealInk ring-1 ring-inset ring-sarh-teal/30 dark:text-sarh-teal">
            {t("learn_featuresBadge")}
          </span>
          <h2
            id="learn-features-title"
            className="sarh-heading mt-4 text-sarh-navy dark:text-white"
          >
            {t("learn_featuresTitle")}
          </h2>
          <p className="sarh-lead mx-auto mt-3 max-w-2xl text-sarh-inkMute dark:text-slate-300">
            {t("learn_featuresLead")}
          </p>
        </header>

        <ul className="grid gap-5 lg:grid-cols-3">
          {FEATURES.map((feature, index) => {
            const Icon = FEATURE_ICONS[feature.icon];
            return (
              <li key={feature.id} className={FEATURE_SPAN[feature.id]}>
                <Reveal delayMs={index * 80} className="h-full">
                  <article className="sarh-card sarh-lift group flex h-full flex-col gap-3 p-6 hover:shadow-teal-gold-glow">
                    <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-sarh-teal/20 to-sarh-gold/20 text-sarh-tealInk dark:text-sarh-teal">
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute -inset-1 rounded-2xl bg-sarh-teal/25 opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-100"
                      />
                      <Icon className="relative h-5 w-5" aria-hidden="true" />
                    </span>

                    <h3 className="text-base font-bold text-sarh-navy dark:text-white">
                      {t(feature.titleKey)}
                    </h3>
                    <p className="sarh-body text-slate-600 dark:text-slate-300">
                      {t(feature.bodyKey)}
                    </p>
                  </article>
                </Reveal>
              </li>
            );
          })}
        </ul>

        <p className="sarh-meta mt-6 flex items-center justify-center gap-2 text-center font-semibold text-sarh-tealInk dark:text-sarh-teal">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {t("learn_featuresNote")}
        </p>
      </div>
    </section>
  );
}
