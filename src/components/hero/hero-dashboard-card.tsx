"use client";

import {
  CalendarCheck,
  CloudCheck,
  MessageSquareQuote,
  NotebookPen,
  Sparkles,
  SunMedium,
  WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";

import { useLanguage } from "@/lib/i18n/language-provider";

/** One labelled row of the tracking board. */
function Row({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sarh-borderLight/80 bg-white/70 px-3 py-2.5 dark:border-sarh-borderDark dark:bg-white/[0.04]">
      <dt className="flex items-center gap-2 text-xs font-semibold text-sarh-inkMute dark:text-slate-400">
        {icon}
        {label}
      </dt>
      <dd className="text-xs font-bold text-sarh-navy dark:text-slate-100">
        {value}
      </dd>
    </div>
  );
}

/**
 * "لوحة متابعة اليوم" — the dashboard preview that anchors the light hero.
 *
 * It is real markup rather than a screenshot, so it stays sharp at any zoom,
 * follows the theme, and costs nothing on the critical path. The row order is
 * the one a parent actually reads in: live status → attendance → the day's
 * hours → the activity → the teacher's note.
 *
 * The content is illustrative, which is why the whole board carries an
 * `aria-label` describing it as a preview: a screen-reader user should never
 * mistake these numbers for their own child's record.
 */
export function HeroDashboardCard() {
  const { t } = useLanguage();

  return (
    <article
      aria-label={t("home_heroCardAria")}
      className="sarh-glass-light relative rounded-2xl p-5 sm:p-6"
    >
      {/* Live status + board title */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            {/* The swelling ring is what makes a static dot read as "live". */}
            <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-emerald-500" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          {t("home_mockLive")}
        </span>

        <div className="flex items-center gap-2.5">
          <p className="text-sm font-bold text-sarh-navy dark:text-white">
            {t("home_mockTitle")}
          </p>
          <span
            aria-hidden="true"
            className="grid h-9 w-9 place-items-center rounded-xl bg-sarh-teal/12 text-sarh-tealInk ring-1 ring-inset ring-sarh-teal/25 dark:text-sarh-teal"
          >
            <Sparkles className="h-4 w-4" />
          </span>
        </div>
      </header>

      <dl className="space-y-2.5">
        <Row
          icon={
            <CalendarCheck
              className="h-3.5 w-3.5 text-sarh-tealInk dark:text-sarh-teal"
              aria-hidden="true"
            />
          }
          label={t("home_mockAttendance")}
          value={
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
              <CalendarCheck className="h-3 w-3" aria-hidden="true" />
              {t("home_mockPresent")}
            </span>
          }
        />

        <Row
          icon={<SunMedium className="h-3.5 w-3.5 text-sarh-goldInk dark:text-sarh-orange" aria-hidden="true" />}
          label={t("home_mockSchedule")}
          value={t("home_mockScheduleValue")}
        />

        <Row
          icon={<NotebookPen className="h-3.5 w-3.5 text-sarh-tealInk dark:text-sarh-teal" aria-hidden="true" />}
          label={t("home_mockActivity")}
          value={t("home_mockActivityValue")}
        />

        {/* Teacher's daily note — the warm beige box from the reference. */}
        <div className="sarh-note-beige rounded-xl p-3.5">
          <dt className="flex items-center gap-1.5 text-xs font-bold text-sarh-goldInk dark:text-sarh-orange">
            <MessageSquareQuote className="h-3.5 w-3.5" aria-hidden="true" />
            {t("home_mockSummary")}
          </dt>
          <dd className="mt-1.5 text-xs leading-6 text-sarh-navy/80 dark:text-slate-200/80">
            {t("home_mockSummaryValue")}
          </dd>
        </div>
      </dl>

      {/* Offline-first: the guarantee the whole platform is built around. */}
      <footer className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-sarh-borderLight/80 pt-3 text-xs font-medium text-sarh-inkMute dark:border-sarh-borderDark dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <WifiOff
            className="h-3.5 w-3.5 text-sarh-goldInk dark:text-sarh-orange"
            aria-hidden="true"
          />
          {t("home_mockOfflineNote")}
        </span>
        <span className="flex items-center gap-1.5">
          <CloudCheck
            className="h-3.5 w-3.5 text-sarh-tealInk dark:text-sarh-teal"
            aria-hidden="true"
          />
          {t("home_mockSynced")}
        </span>
      </footer>
    </article>
  );
}
