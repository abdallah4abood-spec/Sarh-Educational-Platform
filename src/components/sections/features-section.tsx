"use client";

import {
  BellRing,
  MessageCircle,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

import { Reveal } from "@/components/motion/reveal";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { useLanguage } from "@/lib/i18n/language-provider";

/**
 * The four claims the homepage makes about the product, in reading order:
 * find a center → compare it → contact it → follow the child's day after
 * enrolment.
 *
 * These used to come from the `/learn` course catalogue (accredited content,
 * elite instructors, a certificate per course, a 14-day refund) — a storefront
 * Sarh does not operate. Each card now describes a capability that exists in
 * this codebase: the directory profile, its filters, the center contact and
 * enrollment request, and the parent feed with offline attendance.
 */
const WHY_ITEMS: {
  id: string;
  icon: LucideIcon;
  titleKey: DictionaryKey;
  bodyKey: DictionaryKey;
  /** `lg` column span — the 2/1/1/2 bento rhythm of the approved design. */
  span: string;
}[] = [
  {
    id: "profile",
    icon: Search,
    titleKey: "home_why1Title",
    bodyKey: "home_why1Body",
    span: "lg:col-span-2",
  },
  {
    id: "filters",
    icon: SlidersHorizontal,
    titleKey: "home_why2Title",
    bodyKey: "home_why2Body",
    span: "lg:col-span-1",
  },
  {
    id: "contact",
    icon: MessageCircle,
    titleKey: "home_why3Title",
    bodyKey: "home_why3Body",
    span: "lg:col-span-1",
  },
  {
    id: "follow-up",
    icon: BellRing,
    titleKey: "home_why4Title",
    bodyKey: "home_why4Body",
    span: "lg:col-span-2",
  },
];

/**
 * "Why Sarh" — the platform's argument, in its own words.
 *
 * Each card lifts on hover and its icon container gains a soft teal→gold halo
 * (`group-hover`), which is the only motion in the section — the interaction
 * says "this is a card you can read" without animating any layout.
 */
export function FeaturesSection() {
  const { t } = useLanguage();

  return (
    <section
      id="features"
      aria-labelledby="home-why-title"
      className="sarh-section scroll-mt-24 border-y border-sarh-borderLight bg-white/60 px-6 dark:border-sarh-borderDark dark:bg-sarh-cardDark/40"
    >
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 text-center">
          <span className="sarh-badge bg-sarh-teal/10 text-sarh-tealInk ring-1 ring-inset ring-sarh-teal/30 dark:text-sarh-teal">
            {t("home_whyBadge")}
          </span>
          <h2
            id="home-why-title"
            className="sarh-heading mt-4 text-sarh-navy dark:text-white"
          >
            {t("home_whyTitle")}
          </h2>
          <p className="sarh-lead mx-auto mt-3 max-w-2xl text-sarh-inkMute dark:text-slate-300">
            {t("home_whyLead")}
          </p>
        </header>

        <ul className="grid gap-5 lg:grid-cols-3">
          {WHY_ITEMS.map(({ id, icon: Icon, titleKey, bodyKey, span }, index) => (
            <li key={id} className={span}>
              <Reveal delayMs={index * 80} className="h-full">
                <article className="sarh-card sarh-lift group flex h-full flex-col gap-3 p-6 hover:shadow-teal-gold-glow">
                  <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-sarh-teal/20 to-sarh-gold/20 text-sarh-tealInk dark:text-sarh-teal">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -inset-1 rounded-2xl bg-sarh-teal/25 opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-100"
                    />
                    <Icon className="relative h-5 w-5" aria-hidden="true" />
                  </span>

                  <h3 className="sarh-subheading text-sarh-navy dark:text-white">
                    {t(titleKey)}
                  </h3>
                  <p className="sarh-body text-slate-600 dark:text-slate-300">
                    {t(bodyKey)}
                  </p>
                </article>
              </Reveal>
            </li>
          ))}
        </ul>

        <p className="sarh-meta mt-6 flex items-center justify-center gap-2 text-center font-semibold text-sarh-tealInk dark:text-sarh-teal">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("home_whyNote")}
        </p>
      </div>
    </section>
  );
}
