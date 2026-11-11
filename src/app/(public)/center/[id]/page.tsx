import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin, ShieldCheck, Star } from "lucide-react";

import { CenterProfile } from "./center-profile";
import { getCenter } from "@/lib/data/centers-db";
import { ageRangeOf } from "@/lib/data/centers";

/** Deduplicates the fetch between `generateMetadata` and the page render. */
const findCenter = cache(getCenter);

interface CenterPageProps {
  params: { id: string };
}

export async function generateMetadata({
  params,
}: CenterPageProps): Promise<Metadata> {
  const center = await findCenter(decodeURIComponent(params.id));

  /*
   * A miss deliberately returns metadata instead of throwing `notFound()`.
   *
   * `notFound()` thrown from `generateMetadata` is resolved by Next's root
   * error path, which renders the framework's default English "404: This page
   * could not be found." screen and skips the layout — not the localized
   * `(public)/not-found.tsx`. The page below throws instead, and because the
   * `(public)` segment no longer ships a `loading.tsx` (it moved down to
   * `/explore`, the only place that needs a skeleton), nothing has been
   * flushed yet, so the response is still a real HTTP 404 with the Arabic
   * not-found screen inside the normal header and footer.
   */
  if (!center) {
    return {
      title: "مركز غير موجود",
      description: "المركز المطلوب غير متوفر حالياً في دليل صَرْح.",
    };
  }

  return {
    title: center.name,
    description: center.description,
    openGraph: {
      type: "website",
      title: center.name,
      description: center.description,
      images: [{ url: center.cover.src, width: center.cover.width, height: center.cover.height }],
    },
  };
}

/**
 * Center Profile (Design.md Prompt 2) — Server Component: dynamic routing,
 * Prisma-backed data (seed fallback), SEO metadata and the hero header;
 * all interactive pieces (tabs, contact/share bar, Enrollment Modal) live in
 * the `<CenterProfile/>` client wrapper.
 */
export default async function CenterProfilePage({ params }: CenterPageProps) {
  const center = await findCenter(decodeURIComponent(params.id));

  if (!center) notFound();

  const isKindergarten = center.type === "KINDERGARTEN";

  return (
    <div className="pb-16">
      {/* Back to the discovery hub */}
      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        <Link
          href={isKindergarten ? "/explore/kindergartens" : "/explore/centers"}
          className="inline-flex items-center gap-2 text-sm font-semibold text-sarh-inkMute transition-colors hover:text-sarh-tealInk focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal dark:text-slate-400 dark:hover:text-sarh-teal"
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
          العودة إلى الدليل
        </Link>
      </div>

      {/* ================= Hero header ================= */}
      <section className="mt-4">
        <div className="relative h-56 w-full overflow-hidden bg-sarh-mist dark:bg-sarh-cardDark sm:h-72 md:h-80">
          <Image
            src={center.cover}
            alt={center.name}
            fill
            priority
            sizes="100vw"
            placeholder="blur"
            className="object-cover"
          />
          {/* Gradient overlay: from-black/60 → transparent (Design.md) */}
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"
          />

          <div className="absolute inset-x-0 bottom-0">
            <div className="mx-auto flex max-w-6xl items-end gap-4 px-4 pb-6 sm:px-6">
              {/* Center logo overlay */}
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-sarh-tealInk text-2xl font-bold text-white shadow-teal-glow ring-4 ring-white/30 md:h-20 md:w-20 md:text-3xl">
                {center.name.trim().charAt(0)}
              </span>

              <div className="min-w-0 text-white">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {center.verified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sarh-tealInk px-2.5 py-1 text-[11px] font-bold text-white shadow-teal-glow">
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      موثّق
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold backdrop-blur-sm">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    {center.zone}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold backdrop-blur-sm">
                    {isKindergarten
                      ? "روضة (5–7 سنوات)"
                      : "مركز تحضير (8–18 سنة)"}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-sarh-goldInk px-2.5 py-1 text-[11px] font-bold text-white">
                    <Star
                      className="h-3.5 w-3.5 fill-white"
                      aria-hidden="true"
                    />
                    {center.rating.toFixed(1)}
                  </span>
                </div>

                <h1 className="truncate text-2xl font-bold leading-[1.3] md:text-4xl md:leading-[1.28]">
                  {center.name}
                </h1>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-white/85">
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{center.address}</span>
                  <span className="hidden sm:inline">
                    • {ageRangeOf(center.type)}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action bar + tabs + enrollment modal (client) */}
        <CenterProfile center={center} />
      </section>
    </div>
  );
}
