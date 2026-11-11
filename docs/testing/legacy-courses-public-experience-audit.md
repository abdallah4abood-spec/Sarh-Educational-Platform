# SARH — Legacy Courses Cleanup & Public Experience Audit

**Date:** 2026-11-10
**Scope:** audit → fix → verify → document, in one pass
**Product framing (unchanged):** Sarh is an Arabic-first platform for managing and
discovering educational institutions and their services (centres, kindergartens,
teachers, enrolment, daily follow-up, AI teacher tools, commissions). It is **not**
a Udemy-style course marketplace.

---

## 1. Initial audit — how the tree was inspected

1. Read `Agent.md` §7.0 (authoritative phase record) and the existing architecture docs.
2. Listed every route: `find src/app -name page.tsx` → 45 pages, none for `/courses` or `/learn`.
3. Grepped every reference to the old catalogue and its consumers:
   `learn-catalog`, `learn-dictionary`, `learn_`, `CoursesSection`, `HeroSection`,
   `StatsSection`, `TestimonialsSection`, `rating-stars`, `/courses`, `/learn`.
4. Extracted every static `href="/…"` in the app (30 unique) and every template link,
   then matched each one against the route list.
5. Ran the app (production build) and exercised the public routes, the legacy URLs,
   the portal guards, a centre detail page, both languages and two viewports.

All findings below come from the current working tree, not from earlier reports.

### Classification

| # | Finding | Class |
|---|---|---|
| 1 | `SchoolClass`, classes, attendance, teacher tools, institution services, roles, tenant isolation, staff invitations | **Keep — working functionality** |
| 2 | `/explore/centers`, `/explore/kindergartens`, `/explore`, `/contact` + centre detail pages | **Keep — working functionality** |
| 3 | `courses-section.tsx`, `hero-section.tsx`, `stats-section.tsx`, `testimonials-section.tsx` | **Legacy remnant — delete** (zero importers) |
| 4 | `src/lib/data/learn-catalog.ts` (fake catalogue: courses, prices, ratings, 250 courses, 15 000 learners) | **Legacy remnant — delete** |
| 5 | `src/lib/i18n/learn-dictionary.ts` (≈70 `/learn` marketing strings) | **Mixed — split**: 15 keys still used by the newsletter band and footer, the rest deleted |
| 6 | `siteConfig.introVideoUrl` / `NEXT_PUBLIC_INTRO_VIDEO_URL` (only the dead `/learn` hero read it) | **Legacy remnant — delete** |
| 7 | `learn-newsletter-*` element ids in the live newsletter band | **Legacy remnant — rename** |
| 8 | Homepage `home_whyLead`: “صَرْح ليست متجر دورات…” | **Content issue — rewrite positively** |
| 9 | `/parent/settings` in the parent sidebar + one notification | **Integration bug — dead link (404)**, fixed by removing the entry |
| 10 | Homepage pricing tiers (199 ₪/month, “الأكثر اختياراً للمراكز”) | **Ambiguous — needs a business decision**, left untouched |
| 11 | No `sitemap.ts` / `robots.ts` route exists | **SEO gap** at audit time — closed in the follow-up SEO task (§12) |

---

## 2. Legacy course remnants that were found

- **`src/components/sections/courses-section.tsx`** — a full course storefront grid:
  category tabs, cover images, prices in ₪, star ratings, review counts, lesson/hour/
  student counters, “سجّل في الدورة” CTA pointing at `/auth/signup`. No page imported it.
- **`src/components/sections/hero-section.tsx`** — the old `/learn` hero (“٢٥٠ دورة
  معتمدة”, “١٥٬٠٠٠ متعلّم”, “٤٫٩ من ٥”, certificate promises, an intro-video modal).
  No page imported it.
- **`src/components/sections/stats-section.tsx`** — “15 000 learners / 250 courses /
  98 % completion / 140 experts” with “figures refreshed quarterly from platform
  systems”. No page imported it.
- **`src/components/sections/testimonials-section.tsx`** — course-completion
  testimonials and “96 % of learners recommend Sarh courses”. No page imported it.
- **`src/lib/data/learn-catalog.ts`** — the fabricated catalogue backing all four
  components (courses, instructors, prices, ratings, reviews, testimonial quotes,
  statistics, course images). Imported **only** by those four orphans.
- **`src/lib/i18n/learn-dictionary.ts`** — the `/learn` copy deck. Only 15 keys were
  still live (newsletter band + footer accreditation note + “back to top”); the rest
  (hero, catalogue, levels, statistics, features, testimonials, refund promise)
  described a product that does not exist.
- **`siteConfig.introVideoUrl`** and `NEXT_PUBLIC_INTRO_VIDEO_URL` — read solely by the
  deleted hero; documented in `README.md` and `.env.example`.
- **Element ids `learn-newsletter-title` / id prefix `learn-newsletter`** — leftovers
  in the live newsletter band.

### What was already clean (verified, not assumed)

- No `/courses` or `/learn` page existed. `next.config.mjs` already redirects both to
  `/explore/centers` (permanent).
- The homepage (`home-content.tsx`) is already directory/portal-first: hero CTAs go to
  `/explore/centers` and `/explore/kindergartens`; the testimonial wall was already
  removed with an explanatory comment; `features-section.tsx` already describes the
  directory, filters, contact and parent feed.
- No database model, seed record, API route or test referenced the course catalogue.

---

## 3. Files deleted / modified (with reasons)

### Deleted — 6 files, 1 451 lines of dead surface

| File | Reason |
|---|---|
| `src/components/sections/courses-section.tsx` | Unimported course storefront UI |
| `src/components/sections/hero-section.tsx` | Unimported `/learn` hero + video modal |
| `src/components/sections/stats-section.tsx` | Unimported, unverifiable platform statistics |
| `src/components/sections/testimonials-section.tsx` | Unimported course testimonials |
| `src/lib/data/learn-catalog.ts` | Fabricated catalogue imported only by the four orphans |
| `src/lib/i18n/learn-dictionary.ts` | Replaced by `newsletter-dictionary.ts` (live keys only) |

### Added

| File | Purpose |
|---|---|
| `src/lib/i18n/newsletter-dictionary.ts` | The 15 strings the newsletter band and footer actually use, renamed (`newsletter*`, `footer*`) |

### Modified

| File | Change |
|---|---|
| `src/lib/i18n/dictionary.ts` | Imports/composes `newsletterAr`/`newsletterEn` instead of the `/learn` deck |
| `src/components/sections/newsletter-section.tsx` | Renamed keys and `newsletter-title` id |
| `src/components/sections/newsletter-form.tsx` | Renamed keys, default id prefix `newsletter` |
| `src/components/layout/site-footer.tsx` | Renamed accreditation / verified-data / back-to-top keys |
| `src/lib/i18n/home-dictionary.ts` | `home_whyLead` (AR + EN) rewritten without the “not a course store” negation |
| `src/lib/config/site.ts` | Removed the dead `introVideoUrl` field and getter |
| `.env.example`, `README.md` | Removed `NEXT_PUBLIC_INTRO_VIDEO_URL` |
| `src/lib/i18n/academy-dictionary.ts`, `directory-dictionary.ts` | Comments no longer claim a `/learn` module exists |
| `src/components/portal/nav-config.ts` | Removed the `/parent/settings` sidebar entry (404), repointed one notification to `/parent` |

**Nothing was deleted from the database, the Prisma schema, the migrations, the seed,
the tests, or any protected route.**

---

## 4. Issues fixed

1. **Dead course storefront fully removed.** Four orphan components and their fake
   catalogue are gone; nothing imports course data any more (`grep -rn "learn-catalog" src` → no matches).
2. **`/learn` copy removed from the dictionary.** Dictionary keys `learn_*` no longer
   exist anywhere in `src` (`grep -rn "learn_" src` → no matches). The newsletter band
   and footer keep working through the new, purpose-named keys.
3. **Homepage positioning cleaned.** The “Why Sarh” lead now reads
   “من أول بحث عن مركز حتى متابعة يوم طفلك…” (EN: “From the first search to following
   your child's day…”) instead of defining the product by what it is not.
4. **Dead configuration removed.** `introVideoUrl` / `NEXT_PUBLIC_INTRO_VIDEO_URL` are
   no longer advertised in `site.ts`, `.env.example` or `README.md`.
5. **Legacy ids renamed** in the live newsletter band (`newsletter-title`, `newsletter-email`, `newsletter-hint`).
6. **Broken parent-portal link fixed.** `/parent/settings` had no page; the sidebar
   offered a button that 404'd. The entry is removed with a code comment, and the
   notification that pointed at it now links to `/parent`.

---

## 5. Public routes and links — measured

Production build (`npm run build` + `next start`), 2026-11-10:

| Route | Status | Result |
|---|---|---|
| `/` | **200** | Renders full homepage, no course copy |
| `/explore` | **200** | Hub page |
| `/explore/centers` | **200** | One **verified** centre card (`seed-inst-1`), 7 filter controls |
| `/explore/kindergartens` | **200** | One **verified** kindergarten card (`seed-inst-2`) |
| `/contact` | **200** | 4 form fields, 2 WhatsApp links, submit button |
| `/faq`, `/about`, `/privacy`, `/terms`, `/teachers-academy`, `/offline` | **200** | All render |
| `/center/seed-inst-1`, `/center/seed-inst-2` | **200** | Public profiles for verified institutions |
| `/center/seed-inst-3` (`PENDING`) | **404** | Not a public institution |
| `/center/mverify-inst` (QA fixture, `UNVERIFIED`) | **404** | No longer presented publicly (was `200` before §12) |
| `/center/does-not-exist` | **404** | Framework not-found page |
| `/learn` | **308 → `/explore/centers`** | Permanent redirect, no storefront |
| `/courses` | **308 → `/explore/centers`** | Permanent redirect, no storefront |
| `/parent`, `/teacher`, `/institution`, `/admin`, `/supervisor` | **307 → `/auth/signin?callbackUrl=…`** | Portal guards intact |
| `/invitations/accept` and `?token=…` | **307 → `/auth/signin`** | Callback URL preserves the token; no data leaked |

**Internal-link sweep:** all 30 unique static `href` values in `src` resolve to an
existing page; the only dynamic pattern is `/center/${listing.id}` (route
`center/[id]`, verified 200). Header nav = home, centres, kindergartens, teachers
academy, about, contact. Footer = platform links, role-aware portals, contact block,
legal links, accreditation note. Mobile drawer = the same public links plus
`/parent/feed` and `/institution/ai-studio`. No `/courses` or `/learn` link remains
anywhere in the UI.

---

## 6. UX, RTL and responsiveness

- **Identity for a first-time visitor:** hero says “صَرْح يجمع أهالي غزة بأفضل المراكز
  التعليمية”, two CTAs (“استكشف المراكز”, “استكشف الروضات”), then portals → why →
  categories → pain points → offline/AI → steps → value → plans → FAQ → contact.
  No course, certificate, refund or “enrol in a course” language is left on the page
  (`grep` for `دورة|دورات|course` in the rendered homepage → 0 matches).
- **Cards match their destination:** every directory card links to `/center/<id>`, and
  the detail page shows the centre's own programmes, fees and contact actions.
- **Empty/loading/error states:** directory empty state and filter reset exist;
  `/explore/centers` and `/explore/kindergartens` render with real rows, so no
  placeholder content was invented.
- **No dead buttons found on public pages.** The only dead entry found anywhere was the
  portal `/parent/settings` link, now removed.
- **RTL/LTR:** `<html lang="ar" dir="rtl">` by default; the language toggle produces
  `lang="en" dir="ltr"` with all strings translated (verified on `/` and
  `/explore/centers`: headings, newsletter band, footer accreditation all flip).
- **Responsive:** at 390 × 844 no horizontal overflow on `/`, `/explore/centers`,
  `/explore/kindergartens`, `/contact` (`scrollWidth === clientWidth`); the mobile
  drawer opens with every link intact. At 1440 × 900 the desktop header shows the six
  public links and filters/cards lay out without overflow.
- **Console:** clean after load on the correct origin. One earlier
  `CLIENT_FETCH_ERROR` was traced to serving on port 3107 while `NEXTAUTH_URL` points
  at 3000 — not a product defect; it disappeared on port 3000.

---

## 7. SEO

- Page metadata is server-rendered per route (`title`/`description` on `/`, `/explore`,
  `/contact`, `/faq`, legal pages, `teachers-academy`, etc.). The homepage uses an
  absolute title and a description about the directory and the parent portal.
- `/learn` and `/courses` are **permanent (308)** redirects to `/explore/centers`, so
  old links and bookmarks land on a real page instead of a 404.
- No metadata, title, description, JSON-LD or sitemap entry mentions courses,
  certificates or an e-learning catalogue.
- **Implemented in the follow-up SEO task:** `src/app/sitemap.ts` and
  `src/app/robots.ts` now exist. The sitemap serves 12 absolute URLs (10 public pages
  + 2 verified institutions) with no legacy, private or fixture URL, and a
  production guard suppresses a loopback origin instead of publishing localhost. See
  §12 for the routes, rules and measured output.

---

## 8. Tests, types, lint and build (this run, current tree)

| Check | Command | Result |
|---|---|---|
| Automated tests | `npm test` | **382 passed / 0 failed** (67 suites, ~26 s) |
| Types | `npx tsc --noEmit` | **exit 0**, no errors |
| Lint | `npm run lint` | **exit 0**, 0 errors; 2 pre-existing warnings (custom font in `app/layout.tsx`, `<img>` in `ui/file-input.tsx`) |
| Production build | `npm run build` | **✓ compiled successfully**, 59/59 static pages, `/sitemap.xml` + `/robots.txt` emitted as dynamic (ƒ) metadata routes |
| Migrations | `npx prisma migrate status` | **“Database schema is up to date!”** (2 migrations) |

Runtime verification was done against that build, not a dev server.

---

## 9. Open issues

| # | Issue | Severity | Status |
|---|---|---|---|
| 1 | No `sitemap.xml` / `robots.txt` route | Medium (SEO) | **Resolved (2026-11-10)** — both routes implemented and verified, see §12 |
| 1b | Production must set `SITE_URL` to the origin that is actually published | Medium (deployment config) | **Open by design** — no code can discover the real domain; while `NEXT_PUBLIC_APP_URL` still points at `localhost:3000`, a production build emits an **empty** sitemap rather than a wrong one |
| 2 | `parent/settings` screen does not exist | Medium (feature gap) | **Mitigated** — dead nav entry removed; building the screen is a separate task |
| 3 | Resend sending domain not delegated (`sarh.ps` did not resolve at the Phase 4.4 closure) | High for production email only | **Open — external blocker**, unchanged by this phase |
| 4 | Invitation token appears in access logs | Accepted risk (Phase 4.4) | **Open**, unchanged; single-use, address-bound, 7-day, stored hashed |
| 5 | Homepage advertises a 199 ₪/month institution plan and “الأكثر اختياراً للمراكز” | Medium (business claim) | **Ambiguous — left as-is**; needs an owner decision on real pricing and on whether the claim is substantiated |
| 6 | `sharp` not installed → `next start` warns about production image optimization | Low | **Open**, pre-existing; build and pages are unaffected |

No known regression was introduced by this phase: authentication, authorisation,
staff invitations, teacher scope, `Institution.ownerId`, the Prisma schema and the
migrations were not touched.

---

## 10. Git and database state

- **Git:** branch `main`. The tree already carried the earlier phases' changes before
  this work, so a plain `git status` reports the whole project's history-in-progress,
  not this task's delta. Measured on the current tree (`git status --porcelain`):
  **174 entries = 102 modified tracked files + 7 deleted tracked files + 65 untracked
  entries**; expanded with `-uall` those untracked entries are **120 files**, i.e.
  **229 changed files** in total. This task's own delta is:
  - **deleted (tracked):** `courses-section.tsx`, `hero-section.tsx`,
    `stats-section.tsx`, `testimonials-section.tsx`, `learn-catalog.ts`,
    `learn-dictionary.ts`;
  - **added:** `src/lib/i18n/newsletter-dictionary.ts`, `src/app/sitemap.ts`,
    `src/app/robots.ts`, `src/lib/seo/site-origin.ts`, and this report;
  - **edited (tracked):** the 11 import/copy/config files listed in §3 plus
    `Agent.md`, and `.env.example` / `README.md` again for `SITE_URL`.

  **On the count mismatch:** three different numbers describe the same tree, and none
  of them is wrong — they count different things.
  1. The session-start capture said “151 changed file paths”; the summary of the
     cleanup round said “2 new files, 11 modified”. The second number counts only the
     files this task touched, while the first counts everything uncommitted in the
     tree, including earlier phases' work.
  2. A raw `git status` collapses untracked **directories** into one line. `docs/testing/`
     is entirely untracked in this repository (`git ls-files docs/testing` → 0 files),
     so this whole report appears as a single `?? docs/testing/` entry, not as an added
     file. That is why the line count (174) is smaller than the file count (229).
  3. Several tracked files (`features-section.tsx`, `home-dictionary.ts`,
     `site-footer.tsx`) already had uncommitted edits from earlier phases, so their
     diff is larger than this task's contribution.

  The 65 untracked entries, by directory: `src/` 35, `tests/` 13, `docs/` 4,
  `prisma/` 3, `scripts/` 1, plus root scratch files (`debug2.js`–`debug7.js`,
  `debug_template.js`, `.guard-backup/`) that predate this task and were left alone.
  Whatever the count, **nothing was staged, committed or pushed**, and no
  pre-existing change was reverted.
- **Database:** untouched — no writes, no `db push`, no `migrate reset`, no migration
  created. `npx prisma migrate status` reports the schema up to date with the two
  existing migrations. Existing institutions, users, memberships, invitations and
  `AuditLog` rows were not modified.
- New untracked artefacts created by this work: `src/lib/i18n/newsletter-dictionary.ts`,
  `src/app/sitemap.ts`, `src/app/robots.ts`, `src/lib/seo/site-origin.ts`, and this
  report (inside the already-untracked `docs/testing/`).

---

## 11. Recommendation

**Close “Legacy Courses Cleanup & Public Experience Audit” — VERIFIED WITH LIMITATIONS.**

The public experience now matches the approved identity: the retired course
marketplace surface is gone (components, catalogue data, dictionary copy, config and
element ids), the routes and internal links work, both languages and both viewports
are consistent, and tests/types/lint/build/migrations are green.

The phase is closed with limitations that are **not** caused by this cleanup:
production email still waits on a delegated, verified sending domain; the invitation
token remains visible in access logs (accepted risk); the parent-settings screen is
still unwritten (its broken sidebar entry has been removed); and the homepage pricing
claims need an owner decision. The Sitemap/Robots gap from §7 was closed in the
follow-up SEO task (§12); what remains there is deployment configuration, not code.

---

## 12. Sitemap & Robots integration (follow-up task, 2026-11-10)

### Files

| File | Role |
|---|---|
| `src/app/sitemap.ts` | `/sitemap.xml`, rendered per request from the static public routes + verified institutions |
| `src/app/robots.ts` | `/robots.txt`, crawl rules plus the `Sitemap:` / `Host:` reference when an origin is known |
| `src/lib/seo/site-origin.ts` | Server-only origin resolution and validation shared by both routes |
| `src/lib/data/centers-db.ts` | Adds `PUBLICLY_LISTED_INSTITUTION` (`trustStatus: "VERIFIED"`) and applies it to the directory and the public profile |
| `.env.example`, `README.md` | Document `SITE_URL` |

Both metadata routes are `force-dynamic`: the sitemap reads the live `Institution`
table, and the robots file must not bake a build-time origin into the deployed text.

### Origin resolution (`publicSiteOrigin()`)

1. `SITE_URL` (server-only, runtime — the recommended setting)
2. `NEXT_PUBLIC_APP_URL`
3. `NEXTAUTH_URL`

The value must parse as an absolute `http`/`https` URL, must not carry credentials,
and in a **production** runtime a loopback or LAN host (`localhost`, `127.0.0.1`,
`0.0.0.0`, `::1`, `*.local`, `*.internal`, `10/8`, `192.168/16`, `172.16/12`) is
rejected. `next dev` may use loopback so a laptop still serves a working sitemap.
When the origin is rejected, the sitemap returns an **empty but valid `<urlset>`**
and robots omits `Sitemap:`/`Host:` — a crawler is never pointed at a developer
machine.

### Sitemap contents

Included (12 URLs with the current database): `/`, `/explore`, `/explore/centers`,
`/explore/kindergartens`, `/teachers-academy`, `/about`, `/faq`, `/contact`,
`/privacy`, `/terms`, and one `/center/{id}` per institution whose `trustStatus` is
`VERIFIED` (`seed-inst-1`, `seed-inst-2` today).

Excluded: `/courses` and `/learn` (permanent redirects, not pages); `/auth/*`, the
five portals and `/api/*` (authenticated); `/invitations/accept` (one-time token,
`noindex`); `/offline` (PWA shell); and every `PENDING` / `UNVERIFIED` / `REJECTED`
institution.

No `lastModified` is emitted anywhere: there is no per-row "updated at" column, so
any date would be invented rather than measured. `changeFrequency` and `priority` are
editorial hints, not data claims. No `alternates.languages` are declared because the
app has no separate `/en` URLs — the language is a client toggle on one URL.

### Robots rules

`Allow: /` with `Disallow` for `/admin`, `/parent/`, `/teacher/`, `/teacher$`,
`/institution/`, `/supervisor/`, `/auth/`, `/invitations/`, `/api/`, `/offline`.
The `/teacher/` + `/teacher$` pair is deliberate: a bare `/teacher` prefix would also
block the public `/teachers-academy` page. `disallow` is a crawl hint only — every
portal remains protected by NextAuth middleware, and `/invitations/accept` keeps
`X-Robots-Tag: noindex` (re-checked: `Referrer-Policy: no-referrer`,
`X-Robots-Tag: noindex` still present on the anonymous `307`).

### Institution eligibility — the `mverify-inst` finding

`mverify-inst` (“مركز التحقق اليدوي”, owner `mverify-owner@test.local`, created
2026-11-08 12:01 UTC, `UNVERIFIED`, 0 students / 0 staff / 0 classes) is not part of
`prisma/seed.ts` and is not referenced by any test; it was created during the D5 /
Phase 4.4 manual verification and left in the database on purpose (the earlier QA
constraint forbids deleting it).

Before this task the public directory had **no eligibility filter at all**, so this
fixture — and the seeded `PENDING`, `UNVERIFIED` and `REJECTED` rows — were listed as
real institutions and `/center/mverify-inst` answered `200`. That contradicted the
product copy (“لا يظهر مركز في الدليل إلا بعد التحقق من بياناته”, “مراكز موثقة فقط”).

The fix is one shared rule used by the directory, the public profile and the sitemap:
only `trustStatus = VERIFIED`. The row itself was not deleted or modified; its owner
still sees it in `/institution/profile` and admins in `/admin/trust`.

### Measured verification (production build, port 3000)

| Scenario | Result |
|---|---|
| `GET /robots.txt`, no `SITE_URL` (env origin is `http://localhost:3000`) | **200**, `text/plain`, 10 `Disallow` lines, **no** `Sitemap:`/`Host:` line |
| `GET /sitemap.xml`, same run | **200**, `application/xml`, valid empty `<urlset>` — no localhost string |
| `GET /robots.txt` with `SITE_URL=https://sarh.ps` | **200**, ends with `Host: https://sarh.ps` and `Sitemap: https://sarh.ps/sitemap.xml` |
| `GET /sitemap.xml` with that origin | **200**, 12 `<loc>` entries, all `https://sarh.ps/…`, balanced `<url>`/`<urlset>`; 0 localhost, 0 `/courses`, 0 `/learn`, 0 portal/auth/api/offline, 0 `mverify` |
| `/explore/centers` | **200** — only `seed-inst-1` linked |
| `/explore/kindergartens` | **200** — only `seed-inst-2` linked |
| `/center/seed-inst-1`, `/center/seed-inst-2` | **200** |
| `/center/seed-inst-3` (`PENDING`), `/center/mverify-inst` (`UNVERIFIED`) | **404** |
| `/learn`, `/courses` | **308 → `/explore/centers`** (unchanged) |
| `/api/auth/session`, middleware, PWA | No interference: sitemap/robots bypass the portal matcher and are served as plain metadata routes |

Checks re-run on this tree: `npm test` **382/382**, `npx tsc --noEmit` **0**, `npm run
lint` **0 errors** (same 2 pre-existing warnings), `npm run build` **✓ 59/59**
(`Generating static pages (59/59)`, with `/sitemap.xml` and `/robots.txt` listed as
`ƒ`), `npx prisma migrate status` **up to date** (2 migrations). No migration, no
`db push`, no data write.

A second, independent run on the **rebuilt** output (`SITE_URL=https://sarh.ps`)
reproduced the same results: **12 `<loc>`**, **0** occurrences of `localhost`, **0**
occurrences of `/courses|/learn|mverify|/admin|/parent|/teacher/|/institution|/supervisor|/auth/|/invitations|/api/|/offline`,
`robots.txt` ending in `Host:` + `Sitemap:`, `/center/seed-inst-1` **200** and
`/center/mverify-inst` **404**. The test server was stopped afterwards.

### Limits of this task

- **`sarh.ps` is still not proven live.** The `https://sarh.ps` run above is a local
test of the configured-origin path, not evidence that the domain resolves or serves
the app. Production must set `SITE_URL` to the origin that is actually published;
otherwise the sitemap stays intentionally empty.
- Preview/dev deployments can share the same file: a production build pointed at
  loopback publishes nothing, and `next dev` keeps working.
- Generic preview hostnames (`*.vercel.app`, tunnel URLs) are not detected — the
  guard only rejects loopback/LAN hosts, so setting `SITE_URL` correctly remains a
  deployment responsibility.
- **The only indexable institutions today are the two verified seed rows**
  (`seed-inst-1`, `seed-inst-2`). They are listed on purpose: the sitemap must mirror
  the public directory, and both rows are visible at `/explore/*` and `/center/{id}`
  and are labelled `VERIFIED`. They are demo content created by `prisma/seed.ts`;
  replacing them with real institutions is a content/launch task, not an SEO fix.
  Excluding them here while the directory showed them (or the reverse) would be the
  inconsistency the task asked to avoid.
- There is still no automated test for the two routes; verification is the manual
  matrix above.
