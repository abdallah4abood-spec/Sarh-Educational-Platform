import type { MetadataRoute } from "next";

import { publicSiteOrigin } from "@/lib/seo/site-origin";

/**
 * `/robots.txt` — crawl guidance for the public site.
 *
 * `disallow` here is a politeness signal, **not** access control: every portal
 * path is already behind NextAuth middleware, and `/invitations/accept` keeps
 * its `X-Robots-Tag: noindex` response header from `next.config.mjs`. Keeping
 * the token URL out of the crawl queue is defence in depth, nothing more.
 *
 * Note the trailing `/` on `/teacher/` plus the exact `/teacher$` rule: a bare
 * `/teacher` prefix would also block `/teachers-academy`, which is public.
 * Disallow is only emitted when the app knows its public origin, so a
 * development or preview deployment never advertises `http://localhost:3000`.
 */

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const origin = publicSiteOrigin();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // Authenticated portals — one entry per tier root and subtree.
          "/admin",
          "/parent/",
          "/teacher/",
          "/teacher$",
          "/institution/",
          "/supervisor/",
          // Account and invitation flows.
          "/auth/",
          "/invitations/",
          // APIs and the offline shell are not content.
          "/api/",
          "/offline",
        ],
      },
    ],
    ...(origin ? { sitemap: `${origin}/sitemap.xml`, host: origin } : {}),
  };
}
