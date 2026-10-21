"use client";

import { Reveal } from "@/components/motion/reveal";
import { useCountUp } from "@/hooks/useCountUp";
import { STATS, type Stat } from "@/lib/data/learn-catalog";
import { useLanguage } from "@/lib/i18n/language-provider";
import { formatCount } from "@/lib/utils";

/**
 * One metric. This is a component of its own because `useCountUp` is a hook and
 * hooks cannot be called from inside the `.map()` below — each card owns its
 * own observer and animation frame.
 */
function StatCard({ stat }: { stat: Stat }) {
  const { t, lang } = useLanguage();
  const { ref, value } = useCountUp<HTMLSpanElement>(stat.value);

  return (
    <div className="sarh-card sarh-lift flex flex-col items-center gap-1.5 p-6 text-center">
      <span
        ref={ref}
        // The number + symbol are isolated so "+15,000" and "98%" keep their
        // intended order inside the RTL line.
        dir="ltr"
        className="inline-flex items-baseline gap-0.5 text-3xl font-bold text-sarh-navy md:text-4xl dark:text-white"
      >
        {stat.prefix ? <span className="text-sarh-teal">{stat.prefix}</span> : null}
        {formatCount(value, lang)}
        {stat.suffix ? <span className="text-sarh-teal">{stat.suffix}</span> : null}
      </span>
      <p className="sarh-body font-semibold text-sarh-inkMute dark:text-slate-300">
        {t(stat.labelKey)}
      </p>
    </div>
  );
}

/**
 * Statistics & trust banner.
 *
 * The figures count up once, when the row first scrolls into view, and the row
 * carries a note about where the numbers come from — a landing page that shows
 * metrics should say who measured them.
 */
export function StatsSection() {
  const { t } = useLanguage();

  return (
    <section aria-labelledby="learn-stats-title" className="sarh-section-tight px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 text-center">
          <h2
            id="learn-stats-title"
            className="sarh-heading text-sarh-navy dark:text-white"
          >
            {t("learn_statsTitle")}
          </h2>
          <p className="sarh-lead mx-auto mt-3 max-w-2xl text-sarh-inkMute dark:text-slate-300">
            {t("learn_statsLead")}
          </p>
        </header>

        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((stat, index) => (
            <li key={stat.id}>
              <Reveal delayMs={index * 80}>
                <StatCard stat={stat} />
              </Reveal>
            </li>
          ))}
        </ul>

        <p className="sarh-meta mt-6 text-center text-sarh-inkMute dark:text-slate-400">
          {t("learn_statsTrustNote")}
        </p>
      </div>
    </section>
  );
}
