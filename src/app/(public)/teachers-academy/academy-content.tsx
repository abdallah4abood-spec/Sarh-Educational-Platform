"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  Award,
  Bot,
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  UserPlus,
  Users,
  WifiOff,
} from "lucide-react";

import { PaperPlaneTrail } from "@/components/hero/desk-scene";
import { Reveal } from "@/components/motion/reveal";
import { SplitHeading } from "@/components/motion/split-heading";
import { TiltCard } from "@/components/motion/tilt-card";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { useLanguage } from "@/lib/i18n/language-provider";
import { ROLE_HOME, TEACHING_STAFF_ROLES } from "@/lib/roles";

/**
 * Where the academy sends teaching staff once they are signed in.
 *
 * A supervisor starts in the teachers' workspace (that is what the academy
 * recruits for), and both URLs are registered in `src/lib/roles.ts`, so this
 * constant can never drift from the middleware's guards.
 */
const TEACHER_DASHBOARD = ROLE_HOME.TEACHER;

interface Track {
  icon: typeof GraduationCap;
  titleKey: DictionaryKey;
  bodyKey: DictionaryKey;
  metaKey: DictionaryKey;
}

const TRACKS: Track[] = [
  {
    icon: GraduationCap,
    titleKey: "academy_track1Title",
    bodyKey: "academy_track1Body",
    metaKey: "academy_track1Meta",
  },
  {
    icon: BookOpen,
    titleKey: "academy_track2Title",
    bodyKey: "academy_track2Body",
    metaKey: "academy_track2Meta",
  },
  {
    icon: ClipboardCheck,
    titleKey: "academy_track3Title",
    bodyKey: "academy_track3Body",
    metaKey: "academy_track3Meta",
  },
  {
    icon: Users,
    titleKey: "academy_track4Title",
    bodyKey: "academy_track4Body",
    metaKey: "academy_track4Meta",
  },
];

const AI_FEATURES: { icon: typeof Bot; titleKey: DictionaryKey; bodyKey: DictionaryKey }[] = [
  { icon: Bot, titleKey: "academy_aiFeature1Title", bodyKey: "academy_aiFeature1Body" },
  { icon: FileText, titleKey: "academy_aiFeature2Title", bodyKey: "academy_aiFeature2Body" },
  { icon: WifiOff, titleKey: "academy_aiFeature3Title", bodyKey: "academy_aiFeature3Body" },
];

const TRUST: { icon: typeof ShieldCheck; titleKey: DictionaryKey; bodyKey: DictionaryKey }[] = [
  { icon: ShieldCheck, titleKey: "academy_trust1Title", bodyKey: "academy_trust1Body" },
  { icon: Target, titleKey: "academy_trust2Title", bodyKey: "academy_trust2Body" },
  { icon: Award, titleKey: "academy_trust3Title", bodyKey: "academy_trust3Body" },
];

const STEPS: { icon: typeof Rocket; titleKey: DictionaryKey; bodyKey: DictionaryKey }[] = [
  { icon: UserPlus, titleKey: "academy_step1Title", bodyKey: "academy_step1Body" },
  { icon: BookOpen, titleKey: "academy_step2Title", bodyKey: "academy_step2Body" },
  { icon: Award, titleKey: "academy_step3Title", bodyKey: "academy_step3Body" },
];

/**
 * The public /teachers-academy landing page.
 *
 * It carries three jobs at once, which is why the copy is ordered the way it is:
 *
 *   1. Lead generation — public, indexable, with "انضم كمعلم" as the primary
 *      action, deep-linking straight into the teacher tab of sign-up.
 *   2. Onboarding for a visitor who is *already* a teacher: the same button
 *      becomes "متابعة التعلم" and a second action opens their studio, so they
 *      are never shown a "join" pitch for a role they already hold.
 *   3. Trust for parents and center directors reading over a teacher's shoulder
 *      — that is what the closing section addresses, deliberately.
 *
 * The theme is the light desk identity: white cards on the warm ivory surface,
 * teal for actions, orange for accents, navy for type.
 */
export function AcademyContent() {
  const { t } = useLanguage();
  const { data: session, status } = useSession();

  const role = session?.user?.role;
  const isTeachingStaff =
    status === "authenticated" &&
    Boolean(role) &&
    TEACHING_STAFF_ROLES.includes(role as (typeof TEACHING_STAFF_ROLES)[number]);

  // Signed-in staff go to the portal their own tier owns (a supervisor to
  // /supervisor, a teacher to /teacher); visitors are sent to the sign-up form
  // already focused on the teacher tier.
  const portalHref =
    isTeachingStaff && role
      ? (ROLE_HOME[role as (typeof TEACHING_STAFF_ROLES)[number]] ??
        TEACHER_DASHBOARD)
      : TEACHER_DASHBOARD;

  const primaryHref = isTeachingStaff ? portalHref : "/auth/signup?role=teacher";
  const primaryLabel = isTeachingStaff ? t("academy_ctaContinue") : t("academy_ctaJoin");

  return (
    <div className="bg-sarh-bgLight dark:bg-sarh-bgDark">
      {/* ============================================================ */}
      {/* 1. Hero                                                      */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden border-b border-sarh-borderLight bg-sarh-desk dark:border-sarh-borderDark dark:bg-sarh-bgDark dark:bg-none">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-sarh-desk-soft dark:opacity-20"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -end-24 -top-20 h-72 w-72 rounded-full bg-sarh-teal/10 blur-3xl"
        />
        <PaperPlaneTrail
          className="pointer-events-none absolute end-[6%] top-10 hidden w-40 opacity-70 lg:block"
        />

        <div className="relative mx-auto max-w-4xl px-6 py-16 text-center lg:py-20">
          <span className="sarh-badge mx-auto gap-1.5 bg-white/80 px-3 py-1.5 text-sarh-teal ring-1 ring-inset ring-sarh-teal/25 shadow-soft">
            <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
            {t("academy_badge")}
          </span>

          <SplitHeading
            className="mt-5 text-balance text-[1.85rem] font-bold leading-[1.28] sm:text-4xl md:text-[2.75rem]"
            segments={[
              { text: t("academy_titleLead"), tone: "navy" },
              { text: t("academy_titleHighlight"), tone: "orange" },
              { text: t("academy_titleTail"), tone: "navy" },
            ]}
          />

          <p className="mx-auto mt-4 max-w-2xl text-sm leading-8 text-sarh-inkMute md:text-base">
            {t("academy_lead")}
          </p>

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={primaryHref}
              className="sarh-btn-primary h-12 w-full px-6 text-base shadow-teal-glow hover:brightness-[1.06] sm:w-auto"
            >
              {isTeachingStaff ? (
                <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
              ) : (
                <UserPlus className="h-5 w-5" aria-hidden="true" />
              )}
              {primaryLabel}
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>

            <Link
              href="#tracks"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-sarh-borderLight bg-white/70 px-6 text-base font-semibold text-sarh-navy transition-colors hover:border-sarh-teal hover:text-sarh-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal sm:w-auto dark:border-sarh-borderDark dark:bg-transparent dark:text-slate-100"
            >
              <BookOpen className="h-5 w-5" aria-hidden="true" />
              {t("academy_ctaBrowse")}
            </Link>
          </div>

          {/* A signed-in teacher gets the studio as a second, quieter action. */}
          {isTeachingStaff ? (
            <div className="mt-4 flex flex-col items-center gap-2">
              <p className="text-xs font-bold text-sarh-teal">{t("academy_signedIn")}</p>
              <Link
                href={portalHref}
                className="text-xs font-semibold text-sarh-navy/70 underline decoration-sarh-teal/40 decoration-2 underline-offset-4 transition-colors hover:text-sarh-teal dark:text-slate-300"
              >
                {t("academy_ctaStudio")}
              </Link>
            </div>
          ) : (
            <p className="mt-4 text-xs font-semibold text-sarh-inkMute">
              {t("academy_ctaJoinHint")}
            </p>
          )}

          <p className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-sarh-orange/10 px-3 py-1.5 text-[11px] font-bold text-sarh-orangeDeep">
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
            {t("academy_offlineNote")}
          </p>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 2. Training tracks                                           */}
      {/* ============================================================ */}
      <section id="tracks" className="scroll-mt-24 px-6 py-16 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <header className="mb-10 text-center">
            <span className="sarh-badge mx-auto bg-sarh-teal/10 text-sarh-teal ring-1 ring-inset ring-sarh-teal/30">
              {TRACKS.length} {t("academy_trackCount")}
            </span>
            <h2 className="mt-4 text-2xl font-bold text-sarh-navy md:text-3xl dark:text-white">
              {t("academy_tracksTitle")}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-8 text-slate-500 dark:text-slate-400">
              {t("academy_tracksLead")}
            </p>
          </header>

          <ul className="grid gap-5 sm:grid-cols-2">
            {TRACKS.map((track, index) => {
              const Icon = track.icon;
              return (
                <li key={track.titleKey}>
                  <Reveal delayMs={index * 70} className="h-full">
                    <article className="sarh-card flex h-full flex-col gap-3 p-6 transition-transform duration-200 hover:-translate-y-1 hover:shadow-teal-gold-glow">
                      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-sarh-teal/15 to-sarh-orange/15 text-sarh-teal">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <h3 className="text-base font-bold text-sarh-navy dark:text-white">
                        {t(track.titleKey)}
                      </h3>
                      <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
                        {t(track.bodyKey)}
                      </p>
                      <p className="mt-auto flex items-center gap-1.5 text-[11px] font-bold text-sarh-orangeDeep">
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                        {t(track.metaKey)}
                      </p>
                    </article>
                  </Reveal>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 3. AI teacher assistant                                      */}
      {/* ============================================================ */}
      <section className="border-y border-sarh-borderLight bg-white/60 px-6 py-16 lg:py-20 dark:border-sarh-borderDark dark:bg-sarh-cardDark/40">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <span className="sarh-badge bg-sarh-teal/10 text-sarh-teal ring-1 ring-inset ring-sarh-teal/30">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t("academy_aiBadge")}
            </span>
            <h2 className="mt-4 text-2xl font-bold text-sarh-navy md:text-3xl dark:text-white">
              {t("academy_aiTitle")}
            </h2>
            <p className="mt-3 text-sm leading-8 text-slate-500 dark:text-slate-400">
              {t("academy_aiLead")}
            </p>

            <ul className="mt-6 space-y-4">
              {AI_FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <li key={feature.titleKey} className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sarh-teal/10 text-sarh-teal">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-sarh-navy dark:text-white">
                        {t(feature.titleKey)}
                      </p>
                      <p className="mt-0.5 text-xs leading-6 text-slate-500 dark:text-slate-400">
                        {t(feature.bodyKey)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Reveal>

          {/* A live-styled preview panel: same glass language as the home hero,
              so the two pages read as one product. */}
          <Reveal delayMs={120}>
            <TiltCard>
              <div className="sarh-glass-light rounded-2xl p-6">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
                    <span className="relative flex h-2 w-2" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-emerald-500" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    {t("home_mockLive")}
                  </span>
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-sarh-orange/12 text-sarh-orange ring-1 ring-inset ring-sarh-orange/25">
                    <Bot className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>

                <p className="mt-4 text-sm font-bold text-sarh-navy dark:text-white">
                  {t("academy_aiFeature1Title")}
                </p>

                <div className="sarh-note-beige mt-3 rounded-xl p-3.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold text-sarh-orangeDeep">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("academy_aiFeature2Title")}
                  </p>
                  <p className="mt-1.5 text-xs leading-6 text-sarh-navy/80 dark:text-slate-200/80">
                    {t("home_mockSummaryValue")}
                  </p>
                </div>

                <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-sarh-teal">
                  <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("academy_aiFeature3Title")}
                </div>
              </div>
            </TiltCard>
          </Reveal>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 4. Trust — written for parents and center directors          */}
      {/* ============================================================ */}
      <section className="px-6 py-16 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-10 text-center text-2xl font-bold text-sarh-navy md:text-3xl dark:text-white">
            {t("academy_trustTitle")}
          </h2>

          <ul className="grid gap-5 md:grid-cols-3">
            {TRUST.map((item, index) => {
              const Icon = item.icon;
              return (
                <li key={item.titleKey}>
                  <Reveal delayMs={index * 70} className="h-full">
                    <article className="sarh-card flex h-full flex-col gap-3 p-6">
                      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sarh-orange/10 text-sarh-orange">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <h3 className="text-base font-bold text-sarh-navy dark:text-white">
                        {t(item.titleKey)}
                      </h3>
                      <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
                        {t(item.bodyKey)}
                      </p>
                    </article>
                  </Reveal>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 5. How it works                                              */}
      {/* ============================================================ */}
      <section className="border-y border-sarh-borderLight bg-white/60 px-6 py-16 lg:py-20 dark:border-sarh-borderDark dark:bg-sarh-cardDark/40">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-center text-2xl font-bold text-sarh-navy md:text-3xl dark:text-white">
            {t("academy_stepsTitle")}
          </h2>

          <ol className="grid gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.titleKey}>
                  <Reveal delayMs={index * 90}>
                    <div className="flex flex-col items-center gap-3 text-center">
                      <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-sarh-teal to-sarh-tealDeep text-white shadow-teal-glow">
                        <Icon className="h-6 w-6" aria-hidden="true" />
                        <span className="absolute -end-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-sarh-orange text-[11px] font-bold text-white ring-2 ring-white dark:ring-sarh-cardDark">
                          {index + 1}
                        </span>
                      </span>
                      <h3 className="text-base font-bold text-sarh-navy dark:text-white">
                        {t(step.titleKey)}
                      </h3>
                      <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
                        {t(step.bodyKey)}
                      </p>
                    </div>
                  </Reveal>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 6. Closing call to action                                    */}
      {/* ============================================================ */}
      <section className="px-6 py-16 lg:py-20">
        <Reveal>
          {/* A light teal-tinted band rather than the old navy block: the whole
              identity avoids dark surfaces for default states. */}
          <div className="mx-auto max-w-4xl rounded-3xl border border-sarh-teal/20 bg-gradient-to-br from-sarh-teal/[0.10] via-white to-sarh-orange/[0.10] px-8 py-12 text-center shadow-soft dark:border-sarh-teal/25 dark:from-sarh-teal/10 dark:via-transparent dark:to-sarh-orange/10">
            <h2 className="text-2xl font-bold text-sarh-navy md:text-3xl dark:text-white">
              {t("academy_finalTitle")}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-8 text-slate-600 dark:text-slate-300">
              {t("academy_finalLead")}
            </p>

            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={primaryHref}
                className="sarh-btn-primary h-12 w-full px-6 text-base shadow-teal-glow hover:brightness-[1.06] sm:w-auto"
              >
                {primaryLabel}
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Link>
              {isTeachingStaff ? (
                <Link
                  href={TEACHER_DASHBOARD}
                  className="sarh-btn-accent h-12 w-full px-6 text-base shadow-gold-glow hover:brightness-[1.06] sm:w-auto"
                >
                  <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
                  {t("academy_ctaStudio")}
                </Link>
              ) : (
                <Link
                  href="/contact"
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-sarh-borderLight bg-white px-6 text-base font-semibold text-sarh-navy transition-colors hover:border-sarh-teal hover:text-sarh-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal sm:w-auto dark:border-sarh-borderDark dark:bg-transparent dark:text-slate-100"
                >
                  {t("nav_contact")}
                </Link>
              )}
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
