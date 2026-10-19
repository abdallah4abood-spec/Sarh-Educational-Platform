"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, Award, BookOpen, Clock, Users } from "lucide-react";

import { RatingStars } from "@/components/sections/rating-stars";
import { Reveal } from "@/components/motion/reveal";
import {
  BADGE_KEYS,
  COURSE_CATEGORIES,
  COURSES,
  LEVEL_KEYS,
  courseImage,
  initials,
  pick,
  type CategoryId,
  type Course,
} from "@/lib/data/learn-catalog";
import { useLanguage } from "@/lib/i18n/language-provider";
import { cn, formatCount, formatSarh } from "@/lib/utils";

/** Panel id shared by the tabs (`aria-controls`) and the panel itself. */
const PANEL_ID = "learn-courses-panel";

function CourseCard({ course }: { course: Course }) {
  const { t, lang } = useLanguage();

  const title = pick(course.title, lang);
  const instructor = pick(course.instructor, lang);
  const categoryLabel = pick(
    COURSE_CATEGORIES.find((category) => category.id === course.category)?.label ?? {
      ar: "",
      en: "",
    },
    lang
  );

  const priceLabel =
    course.price === null
      ? t("learn_courseFree")
      : formatSarh(course.price, lang === "ar" ? "ar-PS" : "en-US");

  return (
    <article className="sarh-card group flex h-full flex-col overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-teal-gold-glow">
      {/* Cover */}
      <div className="relative aspect-[16/10] w-full bg-sarh-navy/10">
        <Image
          src={courseImage(course.image, 800)}
          alt=""
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />

        <span className="absolute start-3 top-3 rounded-full bg-sarh-navy/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
          {categoryLabel}
        </span>

        {course.badge ? (
          <span
            className={cn(
              "absolute end-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm",
              course.badge === "new" ? "bg-sarh-teal/90" : "bg-sarh-gold/90"
            )}
          >
            {t(BADGE_KEYS[course.badge])}
          </span>
        ) : null}

        {/* Price / enrolment state sits on the cover so it is never scrolled
            away from the course title. */}
        <span
          // A bare "٢٥٠ ₪" says nothing on its own out of context.
          aria-label={`${t("learn_coursePriceLabel")}: ${priceLabel}`}
          className={cn(
            "absolute bottom-3 end-3 rounded-full px-3 py-1 text-xs font-bold shadow-soft",
            course.price === null
              ? "bg-emerald-500 text-white"
              : "bg-white text-sarh-navy dark:bg-sarh-navy dark:text-white"
          )}
        >
          {priceLabel}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="text-base font-bold leading-7 text-sarh-navy dark:text-white">{title}</h3>

        <p className="line-clamp-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
          {pick(course.summary, lang)}
        </p>

        <p className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span
            aria-hidden="true"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sarh-teal/15 text-[11px] font-bold text-sarh-teal"
          >
            {initials(instructor)}
          </span>
          <span className="sr-only">{t("learn_courseInstructorLabel")}: </span>
          {instructor}
        </p>

        <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <RatingStars
            rating={course.rating}
            label={`${t("learn_courseRatingLabel")} ${course.rating} / 5`}
          />
          <span className="font-bold text-sarh-navy dark:text-white">
            {formatCount(course.rating, lang, 1)}
          </span>
          <span>({formatCount(course.reviews, lang)})</span>
        </p>

        <ul className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-sarh-borderLight pt-3 text-[11px] font-medium text-slate-500 dark:border-sarh-borderDark dark:text-slate-400">
          <li className="flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5 text-sarh-teal" aria-hidden="true" />
            {formatCount(course.lessons, lang)} {t("learn_courseLessonsSuffix")}
          </li>
          <li className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-sarh-teal" aria-hidden="true" />
            {formatCount(course.hours, lang)} {t("learn_courseHoursSuffix")}
          </li>
          <li className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-sarh-teal" aria-hidden="true" />
            {formatCount(course.students, lang)} {t("learn_courseStudentsSuffix")}
          </li>
          <li className="flex items-center gap-1.5">
            <Award className="h-3.5 w-3.5 text-sarh-gold" aria-hidden="true" />
            {t(LEVEL_KEYS[course.level])}
          </li>
        </ul>

        {/* Enrolment needs an account, so the card links to signup rather than
            to a course page that does not exist yet. */}
        <Link
          href="/auth/signup"
          className="sarh-btn-primary w-full"
          aria-label={`${t("learn_courseEnroll")}: ${title}`}
        >
          {t("learn_courseEnroll")}
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

/**
 * Featured courses catalog with category tabs.
 *
 * The tabs follow the ARIA tabs pattern: a roving `tabIndex` so only the active
 * tab is in the tab order, and arrow keys move between tabs. In Arabic the arrow
 * direction is mirrored, because "next" is visually to the left in RTL.
 *
 * Switching tabs filters an in-memory list — no request, no layout shift — so
 * the interaction stays instant even on a slow connection.
 */
export function CoursesSection() {
  const { t, lang } = useLanguage();
  const [active, setActive] = useState<CategoryId>("all");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const visible = useMemo(
    () => (active === "all" ? COURSES : COURSES.filter((course) => course.category === active)),
    [active]
  );

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const forward = lang === "ar" ? "ArrowLeft" : "ArrowRight";
    const backward = lang === "ar" ? "ArrowRight" : "ArrowLeft";
    if (event.key !== forward && event.key !== backward) return;

    event.preventDefault();
    const total = COURSE_CATEGORIES.length;
    const nextIndex =
      event.key === forward ? (index + 1) % total : (index - 1 + total) % total;
    const nextId = COURSE_CATEGORIES[nextIndex].id;
    setActive(nextId);
    tabRefs.current[nextId]?.focus();
  };

  return (
    <section
      id="courses"
      aria-labelledby="learn-courses-title"
      className="scroll-mt-24 border-y border-sarh-borderLight bg-white/60 px-6 py-20 dark:border-sarh-borderDark dark:bg-sarh-cardDark/40"
    >
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 text-center">
          <h2
            id="learn-courses-title"
            className="text-3xl font-bold text-sarh-navy md:text-4xl dark:text-white"
          >
            {t("learn_coursesTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-8 text-slate-500 dark:text-slate-400">
            {t("learn_coursesLead")}
          </p>
        </header>

        {/* Filter tabs */}
        <div
          role="tablist"
          aria-label={t("learn_coursesFilter")}
          className="mb-10 flex flex-wrap justify-center gap-3"
        >
          {COURSE_CATEGORIES.map((category, index) => {
            const selected = category.id === active;
            return (
              <button
                key={category.id}
                ref={(node) => {
                  tabRefs.current[category.id] = node;
                }}
                type="button"
                role="tab"
                id={`learn-tab-${category.id}`}
                aria-selected={selected}
                aria-controls={PANEL_ID}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(category.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={cn(
                  "rounded-full border px-5 py-2.5 text-sm font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal",
                  selected
                    ? "border-sarh-teal bg-sarh-teal text-white shadow-teal-glow"
                    : "border-sarh-borderLight bg-sarh-cardLight text-sarh-navy hover:border-sarh-teal hover:text-sarh-teal dark:border-sarh-borderDark dark:bg-sarh-cardDark dark:text-slate-200"
                )}
              >
                {pick(category.label, lang)}
              </button>
            );
          })}
        </div>

        {/* Panels */}
        <div id={PANEL_ID} role="tabpanel" aria-labelledby={`learn-tab-${active}`}>
          {visible.length > 0 ? (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((course, index) => (
                <li key={course.id}>
                  <Reveal delayMs={(index % 3) * 80} className="h-full">
                    <CourseCard course={course} />
                  </Reveal>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sarh-card mx-auto max-w-xl p-6 text-center text-sm leading-7 text-slate-500 dark:text-slate-400">
              {t("learn_coursesEmpty")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
