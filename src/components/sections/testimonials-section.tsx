"use client";

import Image from "next/image";
import { useState } from "react";
import { BadgeCheck, Quote, Star } from "lucide-react";

import { RatingStars } from "@/components/sections/rating-stars";
import { Reveal } from "@/components/motion/reveal";
import { courseImage, initials, pick, TESTIMONIALS, type Testimonial } from "@/lib/data/learn-catalog";
import { useLanguage } from "@/lib/i18n/language-provider";

/**
 * Learner portrait with a graceful offline fallback: if the remote photo never
 * arrives, the initials disc underneath is what remains — never a broken image
 * icon on a page whose whole promise is that it works on a bad connection.
 */
function Avatar({ id, name }: { id: string; name: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-sarh-teal/15 text-xs font-bold text-sarh-teal ring-2 ring-sarh-teal/20">
      {/* Decorative fallback: the learner's name is rendered as real text in
          the card, so these letters must not be announced on their own. */}
      <span aria-hidden="true">{initials(name)}</span>
      {failed ? null : (
        <Image
          src={courseImage(id, 128)}
          // Decorative: the learner's name is rendered right next to it.
          alt=""
          width={44}
          height={44}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </span>
  );
}

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  const { t, lang } = useLanguage();
  const name = pick(testimonial.name, lang);
  const role = pick(testimonial.role, lang);

  return (
    <article className="sarh-card sarh-lift group flex h-full flex-col gap-4 p-6 hover:shadow-teal-gold-glow">
      <div className="flex items-start justify-between gap-3">
        <RatingStars
          rating={testimonial.rating}
          label={`${t("learn_storiesRatingLabel")} ${testimonial.rating} / 5`}
          size="md"
        />
        <Quote
          aria-hidden="true"
          className="h-6 w-6 text-sarh-teal/25 transition-colors group-hover:text-sarh-teal/50"
        />
      </div>

      <blockquote className="text-sm leading-8 text-slate-600 dark:text-slate-300">
        {pick(testimonial.quote, lang)}
      </blockquote>

      <footer className="mt-auto flex items-center gap-3 border-t border-sarh-borderLight pt-4 dark:border-sarh-borderDark">
        <Avatar id={testimonial.avatar} name={name} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-sarh-navy dark:text-white">{name}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{role}</p>
        </div>
        <span className="sarh-badge ms-auto shrink-0 bg-emerald-500/15 text-emerald-700 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-300">
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {t("learn_verified")}
        </span>
      </footer>
    </article>
  );
}

/**
 * Testimonials & success stories.
 *
 * A five-card grid rather than a carousel: every quote stays readable, nothing
 * auto-advances under the reader's cursor, and there is no hidden content for
 * keyboard or screen-reader users to miss. The emerald "verified" badge is
 * reused on every card so the trust signal is scannable, not decorative.
 */
export function TestimonialsSection() {
  const { t } = useLanguage();

  return (
    <section
      id="stories"
      aria-labelledby="learn-stories-title"
      className="sarh-section scroll-mt-24 px-6"
    >
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 text-center">
          <h2
            id="learn-stories-title"
            className="sarh-heading text-sarh-navy dark:text-white"
          >
            {t("learn_storiesTitle")}
          </h2>
          <p className="sarh-lead mx-auto mt-3 max-w-2xl text-sarh-inkMute dark:text-slate-300">
            {t("learn_storiesLead")}
          </p>
          <p className="sarh-meta mt-4 inline-flex items-center gap-2 rounded-full bg-sarh-teal/10 px-4 py-2 font-semibold text-sarh-tealInk ring-1 ring-inset ring-sarh-teal/30 dark:text-sarh-teal">
            <Star className="h-3.5 w-3.5 text-sarh-goldInk dark:text-sarh-gold" fill="currentColor" aria-hidden="true" />
            {t("learn_storiesRecommend")}
          </p>
        </header>

        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((testimonial, index) => (
            <li key={testimonial.id}>
              <Reveal delayMs={(index % 3) * 80} className="h-full">
                <TestimonialCard testimonial={testimonial} />
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
