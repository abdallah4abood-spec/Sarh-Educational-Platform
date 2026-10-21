"use client";

import Image from "next/image";
import Link from "next/link";
import { forwardRef, useState, type ForwardedRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Heart, MapPin, MessageCircle, Tag } from "lucide-react";

import { RatingStars } from "@/components/sections/rating-stars";
import { COVERS } from "@/lib/data/centers";
import { KIND_META, categoryById, type DirectoryListing } from "@/lib/data/directory";
import { useLanguage } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/**
 * Badge palette.
 *
 * The category badge is the fastest way to tell a school from a tutoring
 * centre at a glance, so each category owns a colour instead of every badge
 * being the same teal — the taxonomy in the sidebar then reads as the same
 * taxonomy on the cards.
 */
/*
 * Every fill below clears 4.5:1 with its label at 12px. The original palette had
 * five failing pairs (gold+white 2.2:1, teal+white 2.9:1, the green/pink/blue
 * chips 3.4–4.3:1), so those hues were deepened one step instead of being
 * replaced — the taxonomy still reads by colour, and the labels are legible.
 */
const BADGE_STYLES: Record<string, string> = {
  private_schools: "bg-sarh-gold text-sarh-navy",
  learning_centers: "bg-sarh-tealInk text-white",
  support_centers: "bg-[#0E7490] text-white",
  language_centers: "bg-[#6B4BC9] text-white",
  skills_centers: "bg-sarh-navy text-white",
  creative_centers: "bg-[#B82A63] text-white",
  tech_centers: "bg-[#2563EB] text-white",
  gov_kindergartens: "bg-[#1D5FBF] text-white",
  private_kindergartens: "bg-sarh-gold text-sarh-navy",
  islamic_kindergartens: "bg-[#177A51] text-white",
  language_kindergartens: "bg-[#6B4BC9] text-white",
  mixed_kindergartens: "bg-sarh-tealInk text-white",
  featured_kindergartens: "bg-[#B82A63] text-white",
};

const SPRING = { type: "spring", stiffness: 300, damping: 30 } as const;

/**
 * The one institution card used by both directories.
 *
 * `center-card.tsx` and `kindergarten-card.tsx` are thin named wrappers around
 * this component: the two directories differ in copy, hero art and taxonomy,
 * but a card is a card — cover, badge, name, rating, city, tags, price, and two
 * equal-width actions. Duplicating it would have meant fixing every future
 * layout change twice.
 *
 * The heart is a local, optimistic toggle (there is no favourites API yet), so
 * it stays a `<button aria-pressed>` rather than a dead link.
 *
 * `forwardRef` is not cosmetic: `AnimatePresence mode="popLayout"` clones each
 * child with a ref so it can measure the exiting card, and a plain function
 * component cannot receive one (React logs "Function components cannot be
 * given refs" and the measurement silently degrades). The ref lands on the
 * motion.article below, which is the element the exit animation needs.
 */
export interface DirectoryCardProps {
  listing: DirectoryListing;
  index?: number;
}

function DirectoryCardImpl(
  { listing, index = 0 }: DirectoryCardProps,
  ref: ForwardedRef<HTMLElement>
) {
  const { t, lang } = useLanguage();
  const [favourite, setFavourite] = useState(false);
  // Framer already tween the entrance and the hover lift; when the reader asked
  // for reduced motion the card renders in its final state and stays put.
  const reduceMotion = useReducedMotion();

  const meta = KIND_META[listing.kind];
  const category = categoryById(listing.kind, listing.category);
  const cover = COVERS[listing.coverIndex % COVERS.length];
  const name = listing.name[lang];

  return (
    <motion.article
      ref={ref}
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { ...SPRING, delay: Math.min(index, 8) * 0.04 }
      }
      whileHover={reduceMotion ? undefined : { y: -4 }}
      className="sarh-card group flex flex-col overflow-hidden transition-shadow duration-200 hover:shadow-soft-lg"
    >
      {/* ---- Cover -------------------------------------------------- */}
      <Link
        href={`/center/${listing.id}`}
        aria-label={name}
        className="relative block aspect-[16/10] overflow-hidden bg-sarh-mist focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sarh-tealInk dark:bg-sarh-cardDark"
      >
        <Image
          src={cover}
          alt=""
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          placeholder="blur"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.06]"
        />

        {/* Semantic category badge — top-left in RTL (logical `end`). */}
        {category ? (
          <span
            className={cn(
              "absolute end-3 top-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-bold leading-5 shadow-soft",
              BADGE_STYLES[category.id] ?? "bg-sarh-teal text-white"
            )}
          >
            {t(category.badgeKey)}
          </span>
        ) : null}

        {/* Favourite heart — top-right in RTL (logical `start`). */}
        <button
          type="button"
          onClick={(event) => {
            // The heart sits inside the cover link; stop the click from
            // navigating to the profile page.
            event.preventDefault();
            event.stopPropagation();
            setFavourite((value) => !value);
          }}
          aria-pressed={favourite}
          aria-label={t(favourite ? "dir_cardFavoriteOn" : "dir_cardFavorite")}
          title={t(favourite ? "dir_cardFavoriteOn" : "dir_cardFavorite")}
          className="absolute start-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/92 text-sarh-navy shadow-soft backdrop-blur-sm transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-tealInk dark:bg-sarh-cardDark/92 dark:text-slate-100"
        >
          <Heart
            className={cn("h-4 w-4", favourite && "text-[#E2455B]")}
            fill={favourite ? "currentColor" : "none"}
            aria-hidden="true"
          />
        </button>
      </Link>

      {/* ---- Body --------------------------------------------------- */}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="text-base font-bold leading-7 text-sarh-navy dark:text-white">
          <Link
            href={`/center/${listing.id}`}
            className="transition-colors hover:text-sarh-tealInk focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-tealInk dark:hover:text-sarh-teal"
          >
            {name}
          </Link>
        </h3>

        <div className="flex flex-wrap items-center gap-2">
          <RatingStars
            rating={listing.rating}
            label={`${listing.rating.toFixed(1)} / 5`}
            size="sm"
          />
          <span className="text-sm font-bold text-sarh-navy dark:text-slate-100">
            <bdi>{listing.rating.toFixed(1)}</bdi>
          </span>
          <span className="text-xs font-medium text-sarh-inkMute dark:text-slate-400">
            <bdi>({listing.reviewsCount})</bdi>
          </span>
        </div>

        <p className="flex items-center gap-1.5 text-xs font-medium text-sarh-inkMute dark:text-slate-400">
          <MapPin
            className="h-3.5 w-3.5 shrink-0 text-sarh-tealInk dark:text-sarh-teal"
            aria-hidden="true"
          />
          {t(listing.cityKey)}
        </p>

        <div className="flex flex-wrap gap-1.5">
          {listing.stageKeys.map((key) => (
            <span
              key={key}
              className="inline-flex items-center rounded-full bg-sarh-teal/10 px-2.5 py-1 text-xs font-semibold leading-5 text-sarh-tealInk ring-1 ring-inset ring-sarh-teal/25 dark:bg-sarh-teal/15 dark:text-sarh-teal"
            >
              {t(key)}
            </span>
          ))}
        </div>

        {/* Soft-orange monthly price band. */}
        <div className="mt-auto flex items-center gap-2 rounded-xl bg-sarh-gold/12 px-3 py-2.5 text-sm font-bold text-sarh-goldInk ring-1 ring-inset ring-sarh-gold/35 dark:bg-sarh-gold/15 dark:text-sarh-gold">
          <Tag className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex flex-wrap items-baseline gap-1">
            <span className="text-xs font-medium">
              {t("dir_priceFrom")}
            </span>
            <bdi>
              {listing.priceMin} – {listing.priceMax}
            </bdi>
            <span className="text-xs font-medium">
              {t("dir_priceSuffix")}
            </span>
          </span>
        </div>

        {/*
         * ---- Footer actions -------------------------------------
         *
         * Two stacked, full-width buttons rather than two side by side.
         *
         * The row was a bad fit for the real typeface: with a 17rem sidebar
         * and three columns the card is left with ~212px of text width, while
         * "تواصل مع المركز" needs 153px and "التفاصيل" 88px — 249px before the
         * gap. Under the old equal-width pair each button got ~105px, so the
         * contact label wrapped *inside* its own 40px-tall button and painted
         * its second line below the teal fill, which read as a broken button
         * on every card. Stacking removes the guessing entirely: the CTA is
         * always on one line in both languages and at every card width, and
         * the primary action gets the full width it deserves.
         */}
        <div className="flex flex-col gap-2">
          <Link
            href={`/center/${listing.id}#contact`}
            className="sarh-btn-primary h-10 gap-1.5 whitespace-nowrap rounded-lg text-sm shadow-teal-glow"
          >
            <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t(meta.contactKey)}
          </Link>
          <Link
            href={`/center/${listing.id}`}
            className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg border border-sarh-borderLight text-sm font-semibold text-sarh-navy transition-colors hover:border-sarh-teal hover:text-sarh-tealInk focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-tealInk dark:border-sarh-borderDark dark:text-slate-100 dark:hover:text-sarh-teal"
          >
            {t("dir_cardDetails")}
          </Link>
        </div>
      </div>
    </motion.article>
  );
}

export const DirectoryCard = forwardRef<HTMLElement, DirectoryCardProps>(
  DirectoryCardImpl
);
DirectoryCard.displayName = "DirectoryCard";
