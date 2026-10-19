"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  Baby,
  BellRing,
  BookOpen,
  Building2,
  CalendarCheck,
  Camera,
  CheckCircle2,
  GraduationCap,
  HeartHandshake,
  Languages,
  LineChart,
  Lock,
  MonitorSmartphone,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Tent,
  Users,
  WifiOff,
} from "lucide-react";

import { HomeHero } from "@/components/hero/home-hero";
import { ContactBand } from "@/components/sections/contact-band";
import { FeaturesSection } from "@/components/sections/features-section";
import { NewsletterSection } from "@/components/sections/newsletter-section";
import { TestimonialsSection } from "@/components/sections/testimonials-section";
import { useLanguage } from "@/lib/i18n/language-provider";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { ROLE_HOME, TEACHING_STAFF_ROLES } from "@/lib/roles";
import { cn } from "@/lib/utils";

/* ==================================================================== */
/* Section 3 — categories (interactive chips)                           */
/* ==================================================================== */

interface Category {
  id: string;
  labelKey: DictionaryKey;
  descKey: DictionaryKey;
  icon: typeof Baby;
  /** Deep link into the directory; `tier` pre-filters the stage. */
  href: string;
  accent: "teal" | "gold";
}

const CATEGORIES: Category[] = [
  {
    id: "kindergarten",
    labelKey: "home_catKindergarten",
    descKey: "home_catKindergartenDesc",
    icon: Baby,
    href: "/explore/kindergartens",
    accent: "teal",
  },
  {
    id: "tawjihi",
    labelKey: "home_catTawjihi",
    descKey: "home_catTawjihiDesc",
    icon: GraduationCap,
    href: "/explore/centers",
    accent: "gold",
  },
  {
    id: "languages",
    labelKey: "home_catLanguages",
    descKey: "home_catLanguagesDesc",
    icon: Languages,
    href: "/explore/centers",
    accent: "teal",
  },
  {
    id: "computer",
    labelKey: "home_catComputer",
    descKey: "home_catComputerDesc",
    icon: MonitorSmartphone,
    href: "/explore/centers",
    accent: "gold",
  },
  {
    id: "camps",
    labelKey: "home_catCamps",
    descKey: "home_catCampsDesc",
    icon: Tent,
    href: "/explore/centers",
    accent: "teal",
  },
];

/* ==================================================================== */
/* Section 4 — pain points                                              */
/* ==================================================================== */

const PROBLEMS = [
  { icon: BellRing, titleKey: "home_problem1Title", bodyKey: "home_problem1Body" },
  { icon: Camera, titleKey: "home_problem2Title", bodyKey: "home_problem2Body" },
  { icon: WifiOff, titleKey: "home_problem3Title", bodyKey: "home_problem3Body" },
] as const;

/* ==================================================================== */
/* Section 6 — three steps                                              */
/* ==================================================================== */

const STEPS = [
  { icon: Search, titleKey: "home_step1Title", bodyKey: "home_step1Body" },
  { icon: CalendarCheck, titleKey: "home_step2Title", bodyKey: "home_step2Body" },
  { icon: LineChart, titleKey: "home_step3Title", bodyKey: "home_step3Body" },
] as const;

/* ==================================================================== */
/* Section 9 — embedded FAQ (reuses the /faq dictionary entries)         */
/* ==================================================================== */

const FAQ_KEYS: { q: DictionaryKey; a: DictionaryKey }[] = [
  { q: "faqQ1", a: "faqA1" },
  { q: "faqQ2", a: "faqA2" },
  { q: "faqQ3", a: "faqA3" },
  { q: "faqQ4", a: "faqA4" },
  { q: "faqQ5", a: "faqA5" },
];

export function HomeContent() {
  const { t } = useLanguage();
  const { data: session, status } = useSession();
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].id);
  const [activeTab, setActiveTab] = useState<0 | 1 | 2>(0);

  const role = session?.user?.role;
  const parentHref =
    status === "authenticated" && role === "PARENT"
      ? ROLE_HOME.PARENT
      : "/auth/signin";
  // Teachers and supervisors land on the teaching portal from here; every
  // other authenticated tier is sent to the dashboard its account owns.
  const institutionHref =
    status === "authenticated" && role && TEACHING_STAFF_ROLES.includes(role)
      ? ROLE_HOME[role]
      : "/auth/signin";

  const category = CATEGORIES.find((item) => item.id === activeCategory) ?? CATEGORIES[0];
  const CategoryIcon = category.icon;

  const tabs = [
    {
      icon: WifiOff,
      titleKey: "home_aiOfflineTitle" as DictionaryKey,
      bodyKey: "home_aiOfflineBody" as DictionaryKey,
    },
    {
      icon: Sparkles,
      titleKey: "home_aiQuizTitle" as DictionaryKey,
      bodyKey: "home_aiQuizBody" as DictionaryKey,
    },
    {
      icon: BookOpen,
      titleKey: "home_aiSummaryTitle" as DictionaryKey,
      bodyKey: "home_aiSummaryBody" as DictionaryKey,
    },
  ];
  const activeTabContent = tabs[activeTab];

  return (
    <div className="bg-sarh-bgLight dark:bg-sarh-bgDark">
      {/* ============================================================ */}
      {/* 1. HERO                                                      */}
      {/* ============================================================ */}
      <HomeHero />

      {/* ============================================================ */}
      {/* 2. DUAL PORTAL CARDS                                         */}
      {/* ============================================================ */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <header className="mb-10 text-center">
          <h2 className="text-3xl font-bold text-sarh-navy dark:text-white md:text-4xl">
            {t("home_portalsTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-8 text-slate-500 dark:text-slate-400">
            {t("home_portalsLead")}
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Parent — soft amber */}
          <article className="sarh-card flex flex-col gap-4 bg-sarh-gold/[0.07] p-7 ring-1 ring-inset ring-sarh-gold/30">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sarh-gold/20 text-sarh-gold">
              <HeartHandshake className="h-6 w-6" aria-hidden="true" />
            </span>
            <h3 className="text-xl font-bold text-sarh-navy dark:text-white">
              {t("home_parentCardTitle")}
            </h3>
            <p className="text-sm leading-8 text-slate-600 dark:text-slate-300">
              {t("home_parentCardLead")}
            </p>
            <ul className="space-y-2.5">
              {(
                [
                  "home_parentPoint1",
                  "home_parentPoint2",
                  "home_parentPoint3",
                  "home_parentPoint4",
                ] as DictionaryKey[]
              ).map((key) => (
                <li key={key} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-sarh-gold"
                    aria-hidden="true"
                  />
                  {t(key)}
                </li>
              ))}
            </ul>
            <Link
              href={parentHref}
              className="sarh-btn-accent mt-auto w-fit shadow-gold-glow hover:brightness-110"
            >
              <Users className="h-4 w-4" aria-hidden="true" />
              {t("home_parentCardCta")}
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          </article>

          {/* Institution — soft teal */}
          <article className="sarh-card flex flex-col gap-4 bg-sarh-teal/[0.07] p-7 ring-1 ring-inset ring-sarh-teal/30">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sarh-teal/20 text-sarh-teal">
              <Building2 className="h-6 w-6" aria-hidden="true" />
            </span>
            <h3 className="text-xl font-bold text-sarh-navy dark:text-white">
              {t("home_instCardTitle")}
            </h3>
            <p className="text-sm leading-8 text-slate-600 dark:text-slate-300">
              {t("home_instCardLead")}
            </p>
            <ul className="space-y-2.5">
              {(
                [
                  "home_instPoint1",
                  "home_instPoint2",
                  "home_instPoint3",
                  "home_instPoint4",
                ] as DictionaryKey[]
              ).map((key) => (
                <li key={key} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-sarh-teal"
                    aria-hidden="true"
                  />
                  {t(key)}
                </li>
              ))}
            </ul>
            <Link
              href={institutionHref}
              className="sarh-btn-primary mt-auto w-fit shadow-teal-glow hover:brightness-110"
            >
              <Building2 className="h-4 w-4" aria-hidden="true" />
              {t("home_instCardCta")}
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          </article>
        </div>
      </section>

      {/* ============================================================ */}
      {/* ============================================================ */}
      {/* 2b. WHY SARH — the argument in its own words                 */}
      {/* ============================================================ */}
      <div id="why" className="scroll-mt-24">
        <FeaturesSection />
      </div>

      {/* ============================================================ */}
      {/* 3. SUBJECTS & CATEGORIES                                     */}
      {/* ============================================================ */}
      <section className="border-y border-sarh-borderLight bg-white/60 py-20 dark:border-sarh-borderDark dark:bg-sarh-cardDark/40">
        <div className="mx-auto max-w-6xl px-6">
          <header className="mb-8 text-center">
            <h2 className="text-3xl font-bold text-sarh-navy dark:text-white md:text-4xl">
              {t("home_categoriesTitle")}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-8 text-slate-500 dark:text-slate-400">
              {t("home_categoriesLead")}
            </p>
          </header>

          <div
            role="tablist"
            aria-label={t("home_categoriesTitle")}
            className="mb-8 flex flex-wrap justify-center gap-3"
          >
            {CATEGORIES.map(({ id, labelKey, icon: Icon, accent }) => {
              const active = id === activeCategory;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveCategory(id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal",
                    active
                      ? accent === "teal"
                        ? "border-sarh-teal bg-sarh-teal text-white shadow-teal-glow"
                        : "border-sarh-gold bg-sarh-gold text-white shadow-gold-glow"
                      : "border-sarh-borderLight bg-sarh-cardLight text-sarh-navy hover:border-sarh-teal hover:text-sarh-teal dark:border-sarh-borderDark dark:bg-sarh-cardDark dark:text-slate-200"
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {t(labelKey)}
                </button>
              );
            })}
          </div>

          <div className="sarh-card animate-fade-up flex flex-col items-start gap-4 p-7 sm:flex-row sm:items-center">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-sarh-teal/10 text-sarh-teal">
              <CategoryIcon className="h-7 w-7" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold text-sarh-navy dark:text-white">
                {t(category.labelKey)}
              </h3>
              <p className="mt-1 text-sm leading-7 text-slate-600 dark:text-slate-300">
                {t(category.descKey)}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Link
                href={category.href}
                className="sarh-btn-primary w-fit shadow-teal-glow hover:brightness-110"
              >
                {t("home_ctaExplore")}
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Link>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {t("home_categoriesHint")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 4. PAIN POINTS & SOLUTIONS                                   */}
      {/* ============================================================ */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <header className="mb-10 text-center">
          <h2 className="text-3xl font-bold text-sarh-navy dark:text-white md:text-4xl">
            {t("home_problemsTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-8 text-slate-500 dark:text-slate-400">
            {t("home_problemsLead")}
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-3">
          {PROBLEMS.map(({ icon: Icon, titleKey, bodyKey }) => (
            <article
              key={titleKey}
              className="sarh-card flex flex-col gap-3 p-6 transition-transform duration-200 hover:-translate-y-1 hover:shadow-teal-gold-glow"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-sarh-teal/10 text-sarh-teal">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="text-base font-bold text-sarh-navy dark:text-white">
                {t(titleKey)}
              </h3>
              <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
                {t(bodyKey)}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ============================================================ */}
      {/* 5. AI & OFFLINE SHOWCASE (interactive tabs)                  */}
      {/* ============================================================ */}
      <section className="border-y border-sarh-borderLight bg-white/60 py-20 dark:border-sarh-borderDark dark:bg-sarh-cardDark/40">
        <div className="mx-auto max-w-6xl px-6">
          <header className="mb-10 text-center">
            <span className="sarh-badge bg-sarh-teal/10 text-sarh-teal ring-1 ring-inset ring-sarh-teal/30">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t("home_aiBadge")}
            </span>
            <h2 className="mt-4 text-3xl font-bold text-sarh-navy dark:text-white md:text-4xl">
              {t("home_aiTitle")}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-8 text-slate-500 dark:text-slate-400">
              {t("home_aiLead")}
            </p>
          </header>

          <div className="grid items-start gap-6 lg:grid-cols-5">
            <div role="tablist" className="flex flex-col gap-3 lg:col-span-2">
              {tabs.map(({ icon: Icon, titleKey }, index) => {
                const active = index === activeTab;
                return (
                  <button
                    key={titleKey}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(index as 0 | 1 | 2)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border px-5 py-4 text-start text-sm font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal",
                      active
                        ? "border-sarh-teal bg-sarh-teal/10 text-sarh-teal shadow-soft"
                        : "border-sarh-borderLight bg-sarh-cardLight text-sarh-navy hover:border-sarh-teal/60 dark:border-sarh-borderDark dark:bg-sarh-cardDark dark:text-slate-200"
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                        active ? "bg-sarh-teal/20 text-sarh-teal" : "bg-sarh-navy/5 text-slate-500 dark:bg-white/10 dark:text-slate-300"
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    {t(titleKey)}
                  </button>
                );
              })}
            </div>

            <div className="sarh-glass animate-fade-up flex min-h-[18rem] flex-col gap-4 rounded-2xl p-7 lg:col-span-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-sarh-gold/15 text-sarh-gold">
                <activeTabContent.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="text-lg font-bold text-sarh-navy dark:text-white">
                {t(activeTabContent.titleKey)}
              </h3>
              <p className="text-sm leading-8 text-slate-600 dark:text-slate-300">
                {t(activeTabContent.bodyKey)}
              </p>

              {/* Mini visual per tab */}
              {activeTab === 0 ? (
                <ul className="mt-auto space-y-2">
                  {["أحمد س.", "ليان م.", "يوسف ع."].map((student, index) => (
                    <li
                      key={student}
                      className="flex items-center justify-between gap-2 rounded-lg border border-sarh-borderLight/70 bg-white/60 px-3 py-2 text-xs dark:border-sarh-borderDark dark:bg-white/5"
                    >
                      <span className="font-medium">{student}</span>
                      <span className={index === 2 ? "sarh-badge bg-sarh-gold/15 text-[#C9741F] dark:text-sarh-gold" : "sarh-badge bg-sarh-teal/15 text-sarh-teal"}>
                        {index === 2 ? t("home_mockOfflineNote") : t("home_mockSynced")}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {activeTab === 1 ? (
                <div className="mt-auto rounded-xl border border-sarh-teal/30 bg-sarh-teal/[0.06] p-4 text-xs leading-6">
                  <p className="font-bold text-sarh-teal">سؤال ١ — رياضيات، الصف التاسع</p>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    حلّل المعادلة التربيعية: س² − ٥س + ٦ = ٠
                  </p>
                  <p className="mt-2 font-mono text-[11px] text-slate-400">أ) ٢ و ٣ · ب) ١ و ٦ · ج) −٢ و −٣</p>
                </div>
              ) : null}

              {activeTab === 2 ? (
                <div className="mt-auto space-y-2 text-xs">
                  <p className="w-fit max-w-[90%] rounded-2xl rounded-ss-none bg-sarh-navy/[0.06] px-3 py-2 leading-6 dark:bg-white/10">
                    ملاحظة المعلمة: تفاعل جيد، أنهى التدريبات مبكراً.
                  </p>
                  <p className="ms-auto w-fit max-w-[90%] rounded-2xl rounded-se-none bg-sarh-teal/15 px-3 py-2 leading-6 text-sarh-navy dark:text-slate-100">
                    {t("home_mockSummaryValue")}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 6. THREE-STEP PROCESS                                        */}
      {/* ============================================================ */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <header className="mb-10 text-center">
          <h2 className="text-3xl font-bold text-sarh-navy dark:text-white md:text-4xl">
            {t("home_stepsTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-8 text-slate-500 dark:text-slate-400">
            {t("home_stepsLead")}
          </p>
        </header>

        <ol className="relative grid gap-6 md:grid-cols-3">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-16 top-8 hidden h-0.5 bg-gradient-to-r from-sarh-teal/40 via-sarh-gold/40 to-sarh-teal/40 md:block"
          />
          {STEPS.map(({ icon: Icon, titleKey, bodyKey }, index) => (
            <li key={titleKey} className="sarh-card relative flex flex-col gap-3 p-6">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sarh-navy text-white shadow-soft">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="absolute end-5 top-5 text-4xl font-bold text-sarh-navy/10 dark:text-white/10">
                {index + 1}
              </span>
              <h3 className="text-base font-bold text-sarh-navy dark:text-white">
                {t(titleKey)}
              </h3>
              <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
                {t(bodyKey)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* ============================================================ */}
      {/* 7. PARENT & CENTER VALUE PROPOSITION                         */}
      {/* ============================================================ */}
      <section className="border-y border-sarh-borderLight bg-white/60 py-20 dark:border-sarh-borderDark dark:bg-sarh-cardDark/40">
        <div className="mx-auto max-w-6xl px-6">
          <header className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-sarh-navy dark:text-white md:text-4xl">
              {t("home_valueTitle")}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-8 text-slate-500 dark:text-slate-400">
              {t("home_valueLead")}
            </p>
          </header>

          <div className="grid gap-6 lg:grid-cols-2">
            <article className="sarh-card p-7">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Rocket className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-bold text-sarh-navy dark:text-white">
                {t("home_parentValueTitle")}
              </h3>
              <ul className="mt-4 space-y-3">
                {(
                  [
                    "home_parentValuePoint1",
                    "home_parentValuePoint2",
                    "home_parentValuePoint3",
                    "home_parentValuePoint4",
                  ] as DictionaryKey[]
                ).map((key) => (
                  <li key={key} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
                      aria-hidden="true"
                    />
                    {t(key)}
                  </li>
                ))}
              </ul>
            </article>

            <article className="sarh-glass rounded-2xl p-7 ring-1 ring-inset ring-sarh-navy/15 dark:ring-white/15">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-sarh-navy/10 text-sarh-navy dark:bg-white/10 dark:text-white">
                <Lock className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-bold text-sarh-navy dark:text-white">
                {t("home_privacyTitle")}
              </h3>
              <ul className="mt-4 space-y-3">
                {(
                  [
                    "home_privacyPoint1",
                    "home_privacyPoint2",
                    "home_privacyPoint3",
                  ] as DictionaryKey[]
                ).map((key) => (
                  <li key={key} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                    <ShieldCheck
                      className="mt-0.5 h-4 w-4 shrink-0 text-sarh-teal"
                      aria-hidden="true"
                    />
                    {t(key)}
                  </li>
                ))}
              </ul>
              <Link
                href="/privacy"
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-sarh-teal hover:underline"
              >
                {t("privacyPolicy")}
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </article>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 8. PRICING & TIERS                                           */}
      {/* ============================================================ */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <header className="mb-10 text-center">
          <h2 className="text-3xl font-bold text-sarh-navy dark:text-white md:text-4xl">
            {t("home_pricingTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-8 text-slate-500 dark:text-slate-400">
            {t("home_pricingLead")}
          </p>
        </header>

        <div className="grid items-stretch gap-6 lg:grid-cols-2">
          {/* Free tier */}
          <article className="sarh-card flex flex-col gap-5 p-7">
            <div>
              <h3 className="text-lg font-bold text-sarh-navy dark:text-white">
                {t("home_planFreeName")}
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t("home_planFreeLead")}
              </p>
            </div>
            <p className="flex items-end gap-2">
              <span className="text-4xl font-bold text-sarh-navy dark:text-white">
                {t("home_planFreePrice")}
              </span>
              <span className="text-sm text-slate-400">{t("home_planFreePeriod")}</span>
            </p>
            <ul className="space-y-3">
              {(
                [
                  "home_planFreePoint1",
                  "home_planFreePoint2",
                  "home_planFreePoint3",
                  "home_planFreePoint4",
                ] as DictionaryKey[]
              ).map((key) => (
                <li key={key} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sarh-teal" aria-hidden="true" />
                  {t(key)}
                </li>
              ))}
            </ul>
            <Link
              href="/auth/signup"
              className="sarh-btn-primary mt-auto w-full shadow-teal-glow hover:brightness-110"
            >
              {t("home_planFreeCta")}
            </Link>
          </article>

          {/* Pro tier */}
          <article className="relative flex flex-col gap-5 overflow-hidden rounded-2xl border-2 border-sarh-teal/40 bg-white p-7 shadow-soft-lg dark:bg-sarh-cardDark">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgba(0,169,157,0.12),transparent_55%)]"
            />
            <div className="relative flex flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-sarh-navy dark:text-white">
                  {t("home_planProName")}
                </h3>
                <span className="sarh-badge bg-sarh-gold/15 text-sarh-orangeDeep ring-1 ring-inset ring-sarh-gold/35">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("home_planProBadge")}
                </span>
              </div>
              <p className="text-sm text-sarh-inkMute dark:text-slate-300">
                {t("home_planProLead")}
              </p>
              <p className="flex items-end gap-2 text-sarh-navy dark:text-white">
                <span className="text-4xl font-bold">{t("home_planProPrice")}</span>
                <span className="text-sm text-sarh-inkMute dark:text-slate-400">
                  {t("home_planProPeriod")}
                </span>
              </p>
              <ul className="space-y-3">
                {(
                  [
                    "home_planProPoint1",
                    "home_planProPoint2",
                    "home_planProPoint3",
                    "home_planProPoint4",
                    "home_planProPoint5",
                  ] as DictionaryKey[]
                ).map((key) => (
                  <li
                    key={key}
                    className="flex items-start gap-2.5 text-sm text-sarh-navy/80 dark:text-slate-300"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sarh-gold" aria-hidden="true" />
                    {t(key)}
                  </li>
                ))}
              </ul>
              <Link
                href="/contact"
                className="sarh-btn-primary mt-auto w-full shadow-teal-glow hover:brightness-110"
              >
                {t("home_planProCta")}
              </Link>
            </div>
          </article>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 9. EMBEDDED FAQ                                              */}
      {/* ============================================================ */}
      <section className="border-y border-sarh-borderLight bg-white/60 py-20 dark:border-sarh-borderDark dark:bg-sarh-cardDark/40">
        <div className="mx-auto max-w-3xl px-6">
          <header className="mb-8 text-center">
            <h2 className="text-3xl font-bold text-sarh-navy dark:text-white md:text-4xl">
              {t("faqTitle")}
            </h2>
            <p className="mx-auto mt-3 text-sm leading-8 text-slate-500 dark:text-slate-400">
              {t("faqLead")}
            </p>
          </header>

          <div className="space-y-3">
            {FAQ_KEYS.map(({ q, a }, index) => (
              <details
                key={q}
                open={index === 0}
                className="sarh-card group p-5 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-sarh-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal dark:text-white">
                  {t(q)}
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sarh-teal/10 text-sarh-teal transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-8 text-slate-600 dark:text-slate-300">
                  {t(a)}
                </p>
              </details>
            ))}
          </div>

          <p className="mt-6 text-center">
            <Link
              href="/faq"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-sarh-teal hover:underline"
            >
              {t("nav_faq")}
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </p>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 9b. STUDENT STORIES                                          */}
      {/* ============================================================ */}
      <div id="testimonials" className="scroll-mt-24">
        <TestimonialsSection />
      </div>

      {/* ============================================================ */}
      {/* 9c. CONTACT BAND — the `/contact` target of the navbar       */}
      {/* ============================================================ */}
      <ContactBand />

      {/* ============================================================ */}
      {/* 10. FINAL CTA BANNER                                         */}
      {/* ============================================================ */}
      <section className="px-6 py-20">
        {/* Light teal-tinted band, not a navy block: the identity keeps dark
            navy for type and small accents, never for a default surface. */}
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-sarh-teal/20 bg-gradient-to-br from-white via-sarh-mist to-sarh-beige px-8 py-14 text-center shadow-soft-lg dark:border-sarh-teal/25 dark:from-sarh-cardDark dark:via-sarh-cardDark dark:to-sarh-cardDark">
          <div className="relative flex flex-col items-center gap-5">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sarh-gold/15 text-sarh-gold">
              <CalendarCheck className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className="max-w-2xl text-2xl font-bold text-sarh-navy md:text-3xl dark:text-white">
              {t("home_ctaTitle")}
            </h2>
            <p className="max-w-xl text-sm leading-7 text-sarh-inkMute dark:text-slate-300">
              {t("home_ctaLead")}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/auth/signup"
                className="sarh-btn-primary shadow-teal-glow hover:brightness-110"
              >
                {t("home_ctaPrimary")}
              </Link>
              <Link
                href="/explore/centers"
                className="inline-flex items-center gap-2 rounded-lg border border-sarh-borderLight bg-white px-5 py-2.5 font-semibold text-sarh-navy transition-colors hover:border-sarh-teal hover:text-sarh-teal dark:border-sarh-borderDark dark:bg-transparent dark:text-slate-100"
              >
                {t("home_ctaSecondary")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 11. NEWSLETTER                                               */}
      {/* ============================================================ */}
      <NewsletterSection />
    </div>
  );
}
