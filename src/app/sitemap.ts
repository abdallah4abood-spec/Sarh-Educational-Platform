import type { MetadataRoute } from "next";

import { PUBLICLY_LISTED_INSTITUTION } from "@/lib/data/centers-db";
import { prisma } from "@/lib/prisma";
import { publicSiteOrigin } from "@/lib/seo/site-origin";

/**
 * `/sitemap.xml` — the public, indexable surface of Sarh.
 *
 * Rendered per request (`force-dynamic`) because the centre list is the live
 * `Institution` table: prerendering it at build time would freeze the directory
 * and make the build depend on a reachable database.
 *
 * Included:
 *   - the ten public pages a visitor can land on from the navigation or footer;
 *   - one URL per **verified** institution (`PUBLICLY_LISTED_INSTITUTION`), which
 *     is the same rule the directory and the public profile page enforce.
 *
 * Deliberately excluded:
 *   - `/courses` and `/learn` — they are permanent redirects, never pages;
 *   - `/auth/*`, `/parent`, `/teacher`, `/institution`, `/supervisor`, `/admin` —
 *     authenticated portals, disallowed in `robots.ts` as well;
 *   - `/invitations/accept` — carries a one-time token and is `noindex`;
 *   - `/offline` — the PWA offline shell, not content;
 *   - `/center/[id]` rows that are pending, unverified or rejected, and QA
 *     fixtures such as `mverify-inst`. They are not public institutions.
 *
 * No `lastModified` is emitted: there is no per-row "updated at" column, and a
 * `createdAt` or `new Date()` would be an invented signal, not real data.
 */

/** Static public routes, in navigation order. */
const PUBLIC_ROUTES: {
  path: string;
  changeFrequency: "weekly" | "monthly";
  priority: number;
}[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/explore", changeFrequency: "weekly", priority: 0.9 },
  { path: "/explore/centers", changeFrequency: "weekly", priority: 0.9 },
  { path: "/explore/kindergartens", changeFrequency: "weekly", priority: 0.9 },
  { path: "/teachers-academy", changeFrequency: "monthly", priority: 0.8 },
  { path: "/about", changeFrequency: "monthly", priority: 0.6 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.6 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.6 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.3 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.3 },
];

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = publicSiteOrigin();

  // No usable public origin: an empty <urlset> is honest, a localhost one is not.
  if (!origin) return [];

  const entries: MetadataRoute.Sitemap = PUBLIC_ROUTES.map(
    ({ path, changeFrequency, priority }) => ({
      url: `${origin}${path}`,
      changeFrequency,
      priority,
    })
  );

  try {
    const institutions = await prisma.institution.findMany({
      where: PUBLICLY_LISTED_INSTITUTION,
      select: { id: true },
      orderBy: { id: "asc" },
    });

    for (const institution of institutions) {
      entries.push({
        url: `${origin}/center/${encodeURIComponent(institution.id)}`,
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
  } catch {
    // The directory being unreachable must not take the whole sitemap down:
    // every static URL above is still valid without the database.
  }

  return entries;
}
