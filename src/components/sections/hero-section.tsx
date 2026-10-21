"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarCheck,
  CheckCircle2,
  Flame,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  WifiOff,
} from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { siteConfig } from "@/lib/config/site";
import { initials } from "@/lib/data/learn-catalog";
import { useLanguage } from "@/lib/i18n/language-provider";

/** Progress shown by the dashboard mockup's bar (and its aria-valuenow). */
const MOCK_PROGRESS = 72;

/**
 * Normalise the configured intro video into something embeddable.
 *
 * A YouTube link becomes a `youtube-nocookie` embed (no tracking cookies until
 * playback); anything else is treated as a direct video file and handed to a
 * native `<video>` element. Returns `null` when nothing is configured, which is
 * the signal to show the localized notice instead of an empty black box.
 */
function resolveIntroVideo(raw: string): { kind: "iframe" | "video"; url: string } | null {
  const url = raw.trim();
  if (!url) return null;

  const youtube = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/
  );
  if (youtube?.[1]) {
    return { kind: "iframe", url: `https://www.youtube-nocookie.com/embed/${youtube[1]}` };
  }

  return { kind: "video", url };
}

/**
 * Hero: headline, the two calls to action, and a high-fidelity mockup of the
 * platform dashboard.
 *
 * The mockup is real markup rather than a screenshot, so it stays crisp on
 * every display, flips with the theme, and adds zero image weight to the
 * critical path. Its numbers are illustrative and labelled as such through
 * `aria-label`s rather than pretending to be live data.
 */
export function HeroSection() {
  const { t } = useLanguage();
  const [videoOpen, setVideoOpen] = useState(false);

  const video = resolveIntroVideo(siteConfig.introVideoUrl);
  const trustItems = [t("learn_heroTrust1"), t("learn_heroTrust2"), t("learn_heroTrust3")];

  return (
    <section
      id="learn-top"
      aria-labelledby="learn-hero-title"
      className="relative scroll-mt-24 overflow-hidden border-b border-sarh-borderLight bg-sarh-desk dark:border-sarh-borderDark dark:bg-sarh-bgDark dark:bg-none"
    >
      {/* Ambient morning daylight — purely decorative. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-sarh-desk-soft dark:opacity-20"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -start-24 top-16 h-72 w-72 rounded-full bg-sarh-teal/10 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -end-20 bottom-0 h-80 w-80 rounded-full bg-sarh-gold/10 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 py-16 lg:grid-cols-2 lg:py-24">
        {/* ---------------- Copy column ---------------- */}
        <div className="animate-fade-up flex flex-col items-start gap-6">
          <span className="sarh-badge gap-1.5 bg-white/80 px-3 py-1.5 text-sarh-teal ring-1 ring-inset ring-sarh-teal/25 shadow-soft">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {t("learn_heroBadge")}
          </span>

          <h1
            id="learn-hero-title"
            className="text-4xl font-bold leading-[1.3] text-balance text-sarh-navy md:text-5xl lg:text-[3.4rem] dark:text-white"
          >
            {/* The separating spaces live *inside* each text node (rather than
                in their own `{" "}` node) so the heading's accessible name keeps
                its word boundaries. */}
            {`${t("learn_heroTitleLead")} `}
            <span className="bg-sarh-teal-gold bg-clip-text text-transparent">
              {t("learn_heroTitleHighlight")}
            </span>
            {` ${t("learn_heroTitleTail")}`}
          </h1>

          <p className="max-w-xl text-base leading-8 text-sarh-inkMute md:text-lg dark:text-slate-300">
            {t("learn_heroLead")}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="#courses"
              className="sarh-btn-primary h-12 px-6 text-base shadow-teal-glow hover:brightness-110"
            >
              {t("learn_heroCtaPrimary")}
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => setVideoOpen(true)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-sarh-borderLight bg-white/70 px-6 text-base font-semibold text-sarh-navy transition-colors hover:border-sarh-teal hover:text-sarh-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-tealInk dark:border-sarh-borderDark dark:bg-transparent dark:text-slate-100"
            >
              <PlayCircle className="h-5 w-5" aria-hidden="true" />
              {t("learn_heroCtaSecondary")}
            </button>
          </div>

          <ul className="flex flex-col gap-2.5 pt-1">
            {trustItems.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm text-sarh-navy/80 dark:text-slate-300"
              >
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-sarh-teal"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-sarh-inkMute dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 text-sarh-gold" fill="currentColor" aria-hidden="true" />
              {t("learn_heroRatingNote")}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-sarh-teal" aria-hidden="true" />
              {t("learn_heroLearners")}
            </span>
          </div>
        </div>

        {/* ---------------- Dashboard mockup ---------------- */}
        <div className="relative animate-fade-up">
          <div className="sarh-glass-light rounded-2xl p-5 text-sarh-navy dark:text-slate-100">
            <header className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="grid h-9 w-9 place-items-center rounded-full bg-sarh-teal/15 text-xs font-bold text-sarh-teal"
                >
                  {initials(t("learn_mockStudent"))}
                </span>
                <div>
                  <p className="text-sm font-bold">{t("learn_mockTitle")}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t("learn_mockStudent")}
                  </p>
                </div>
              </div>
              <span className="sarh-badge bg-sarh-teal/15 text-sarh-teal">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-sarh-teal"
                />
                {t("learn_mockLive")}
              </span>
            </header>

            {/* Progress */}
            <div className="rounded-xl border border-sarh-borderLight/70 bg-white/60 p-3.5 dark:border-sarh-borderDark dark:bg-white/5">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold">
                <span className="text-slate-500 dark:text-slate-400">
                  {t("learn_mockProgressLabel")}
                </span>
                <span className="text-sarh-teal">{t("learn_mockProgressValue")}</span>
              </div>
              <div
                role="progressbar"
                aria-label={t("learn_mockProgressBar")}
                aria-valuenow={MOCK_PROGRESS}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 w-full overflow-hidden rounded-full bg-sarh-navy/10 dark:bg-white/10"
              >
                <span
                  className="block h-full rounded-full bg-sarh-teal-gold"
                  style={{ width: `${MOCK_PROGRESS}%` }}
                />
              </div>
            </div>

            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-sarh-borderLight/70 bg-white/60 px-3 py-2.5 dark:border-sarh-borderDark dark:bg-white/5">
                <dt className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <CalendarCheck className="h-3.5 w-3.5 text-sarh-teal" aria-hidden="true" />
                  {t("learn_mockNextLabel")}
                </dt>
                <dd className="text-xs font-medium">{t("learn_mockNextValue")}</dd>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-sarh-borderLight/70 bg-white/60 px-3 py-2.5 dark:border-sarh-borderDark dark:bg-white/5">
                <dt className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <Flame className="h-3.5 w-3.5 text-sarh-gold" aria-hidden="true" />
                  {t("learn_mockStreakLabel")}
                </dt>
                <dd className="text-xs font-medium">{t("learn_mockStreakValue")}</dd>
              </div>

              <div className="rounded-xl border border-sarh-teal/30 bg-sarh-teal/[0.06] px-3 py-3">
                <dt className="mb-1 flex items-center gap-1.5 text-xs font-bold text-sarh-teal">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("learn_mockCertificateLabel")}
                </dt>
                <dd className="text-xs leading-6">{t("learn_mockCertificateValue")}</dd>
              </div>
            </dl>

            <footer className="mt-4 flex flex-wrap items-center gap-3 border-t border-sarh-borderLight/70 pt-3 text-[11px] font-medium text-slate-500 dark:border-sarh-borderDark dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-sarh-gold" aria-hidden="true" />
                {t("learn_mockFloatCertificate")}
              </span>
              <span className="flex items-center gap-1.5">
                <WifiOff className="h-3.5 w-3.5 text-sarh-teal" aria-hidden="true" />
                {t("learn_mockFloatOffline")}
              </span>
            </footer>
          </div>

          {/* Floating proof chips — decorative duplicates of the copy above, so
              they are hidden from assistive tech and from small screens where
              they would collide with the card. */}
          <div
            aria-hidden="true"
            className="absolute -bottom-6 start-4 hidden max-w-[16rem] items-start gap-2.5 rounded-2xl border border-sarh-gold/30 bg-white px-4 py-3 shadow-soft-lg lg:flex dark:bg-sarh-cardDark"
          >
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sarh-gold/20 text-sarh-gold">
              <BadgeCheck className="h-4 w-4" />
            </span>
            <p className="text-xs font-semibold leading-5 text-sarh-navy dark:text-slate-100">
              {t("learn_mockFloatInstructor")}
            </p>
          </div>
        </div>
      </div>

      {/* ---------------- Intro video modal ---------------- */}
      <Modal
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        title={t("learn_heroVideoTitle")}
        closeLabel={t("learn_heroVideoClose")}
        size="lg"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-7 text-slate-500 dark:text-slate-400">
            {t("learn_heroVideoBody")}
          </p>

          {video ? (
            <div className="overflow-hidden rounded-2xl bg-black">
              {video.kind === "iframe" ? (
                <iframe
                  src={video.url}
                  title={t("learn_heroVideoTitle")}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="aspect-video w-full"
                />
              ) : (
                <video controls preload="metadata" className="aspect-video w-full">
                  <source src={video.url} />
                  {t("learn_heroVideoUnavailable")}
                </video>
              )}
            </div>
          ) : (
            // Nothing configured: say so plainly instead of rendering a player
            // that would never play.
            <p className="rounded-2xl border border-sarh-gold/40 bg-sarh-gold/10 p-4 text-sm leading-7 text-sarh-navy dark:text-slate-100">
              {t("learn_heroVideoUnavailable")}
            </p>
          )}
        </div>
      </Modal>
    </section>
  );
}
