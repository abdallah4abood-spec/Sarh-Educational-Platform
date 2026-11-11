# Phase 4.4 + D6 — Manual QA (unified run)

**Date:** 2026-11-09, closure re-verification **2026-11-10** · **Environment:** local `next dev`
on `http://localhost:3000`, database `sarh_db` (PostgreSQL, localhost) · **Branch:** `main`
(nothing staged/committed).

**Status (2026-11-10):** Manual QA **COMPLETE — verified with limitations** for both Phase 4.4
and D6. The only open item is external: no sending domain is delegated
(`sarh.ps` still answers `NXDOMAIN`), so production mail to non-owner invitees stays
**BLOCKED**. Functional and security scope is closed; see §11 for the closure run.

Scope: the remaining manual checks for **Phase 4.4 — Staff Invitations & AuditLog**
and **D6 — SUPER_ADMIN Staff Interface**. Production code, schema and migrations
were not touched. Every fixture used the `qa44-` prefix and was removed afterwards.

**No token, token hash, cookie or password appears in this document.** Where a
value mattered, only its length or a boolean is recorded.

**Evidence files:** `dev-artifacts/qa44-results.json` (25 scripted checks, 0 failures),
`dev-artifacts/qa44-email-check.json` (the real-send re-run, §9.1) and
`dev-artifacts/qa44-closure-2026-11-10.json` (closure re-verification: headers, standing
checks, DB snapshot, DNS — §11).
Run harness: `scripts/qa44-qa.mjs` (scripted checks), `scripts/qa44-probe.mjs`
(targeted probes) and `scripts/qa44-cleanup.mjs` (snapshot + fixture removal).
The server log of the run is `/tmp/sarh-dev-qa44.log` (outside the repo).

---

## 1. How it was exercised

| Channel | Used for |
|---|---|
| Real browser (Chromium via the preview panel, isolated incognito sessions) | OWNER create-invitation form, CENTER_ADMIN role options, D6 page render, D6 create, D6 resend, D6 revoke |
| Same-origin HTTP client replaying the browser's own NextAuth cycle (`/api/auth/csrf` → `/api/auth/callback/credentials`, then `Origin`-checked JSON calls) | the full permission matrix, token rotation/rejection, expiry, cross-centre ids, stale-JWT demotion, audit and isolation assertions |
| Prisma read-only queries | status, audit and isolation assertions, plus before/after counts |

Sessions used: `center@sarh.ps` (OWNER of `seed-inst-1`, `seed-inst-2`),
`admin@sarh.ps` (SUPER_ADMIN), `qa44-admin@test.local` (CENTER_ADMIN fixture in
`seed-inst-1`, `User.role = PARENT`), `qa44-super@test.local` (SUPER_ADMIN fixture
used only for the demotion check).

---

## 2. Result summary

| # | Scenario | Status |
|---|---|---|
| 1 | `acceptPath` / token handling review | **PASSED** (one hardening gap recorded in §3.2) |
| 2 | Create invitation, PENDING, honest `emailSent:false` | **PASSED** |
| 3 | Duplicate create rejected | **PASSED** |
| 4 | Resend rotates the link, old token dead | **PASSED** |
| 5 | Revoke, then refuse the revoked link | **PASSED** |
| 6 | Expiry without waiting 7 days, persisted `EXPIRED` | **PASSED** |
| 7 | Audit trail for every transition | **PASSED** |
| 8 | OWNER role matrix (TEACHER / SECRETARY / CENTER_ADMIN) | **PASSED** |
| 9 | CENTER_ADMIN matrix + cross-centre denial | **PASSED** |
| 10 | D6 page and API access, fixed role, resend, revoke | **PASSED** |
| 11 | D6 denied to non-admin, cross-institution id | **PASSED** |
| 12 | Demoted SUPER_ADMIN with a still-valid JWT | **PASSED** (see §7.1 for the 200+meta-refresh nuance) |
| 13 | Institution isolation and no fabricated rows | **PASSED** |
| 14 | Real email delivery | **PASSED at the provider boundary only** — re-run 2026-11-09 against the provider's only permitted recipient: `201`, `emailSent:true`, no token copy returned. Inbox arrival was not machine-verified and the sender domain is still unverified: **production mail BLOCKED (external)**; see §9.1 and §11.3 |

---

## 3. `acceptPath` and token handling

### 3.1 What the implementation does

| Question | Answer from the code and the run |
|---|---|
| Does `acceptPath` carry a raw token? | Yes — that is the point: `/invitations/accept?token=<43 chars>`. The token is 32 random bytes (base64url), 256 bits |
| When is it returned to the client? | Only in the `201`/`200` response of `POST …/invitations` or `POST …/invitations/[id]` (resend), and only when `emailSent` is **false**; when the provider succeeds no copy is returned (`one copy of the secret is enough`) |
| Only to the authorised issuer? | Yes. Both handlers resolve the actor from the database (`resolveInvitationActor` → `requireCapability("staff.invite")`; D6 uses `requireLiveSuperAdmin`). A caller without the grant gets `403` before any token exists |
| Can another user obtain it? | Not from the API. It is stored as `sha256:<64 hex>` only; list responses (`StaffInvitationRow`) never include it. It is visible to whoever can read the inviter's screen/response — that is the inviter |
| Leaked in AuditLog / console / other pages? | No. Audit `metadata` keys observed this round: `role`, `previousStatus`, `expiresAt` only. A scan of all metadata for `sha256:` and for any stored hash returned **false** |
| `Cache-Control: no-store`? | **Yes** — the accept page answered `cache-control: no-store, must-revalidate` (page is `force-dynamic`) |
| `Referrer-Policy: no-referrer`? | **Yes** — since the 2026-11-09 fix, `/invitations/accept` returns `referrer-policy: no-referrer` and `x-robots-tag: noindex` (verified locally, with and without `?token=…`). See §3.2 |
| Does resend revoke the old link? | Yes: the stored hash is replaced in the same transaction. The old token answered `404 INVITATION_NOT_FOUND`; the new one was live (`403 EMAIL_MISMATCH` for the wrong account, i.e. found but not theirs) |
| Are revoke / expiry / already-accepted enforced? | Yes: `409 INVITATION_REVOKED`, `409 INVITATION_EXPIRED` (row persisted to `EXPIRED`), `409 INVITATION_ALREADY_ACCEPTED` |

Sign-in is required before the accept page renders; anonymous access answered
`307 → /auth/signin` with the callback URL preserved.

### 3.2 Hardening gaps

1. **`Referrer-Policy` / `X-Robots-Tag` on `/invitations/accept` — CLOSED (2026-11-09).**
   The original run recorded both headers as absent. A `headers()` entry in
   `next.config.mjs` now pins `Referrer-Policy: no-referrer` and
   `X-Robots-Tag: noindex` to that route, so a `Referer` cannot carry the query
   token to another origin and crawlers cannot index a one-time link. Verified on
   the running dev server after restart:
   `GET /invitations/accept?token=<redacted>` and `GET /invitations/accept` both
   answered `307` (anonymous → sign-in) with `referrer-policy: no-referrer`,
   `x-robots-tag: noindex`, and `cache-control: no-store, must-revalidate`.
   No token value was recorded.
   Closure run 2026-11-10 extended this to the **authenticated `200`** response, which the
   first run had not covered: signed in as the OWNER, `GET /invitations/accept` with and
   without a (dummy) `token` answered `200` with `referrer-policy: no-referrer`,
   `x-robots-tag: noindex` and `cache-control: no-store, must-revalidate` on all four
   combinations (anonymous/authenticated × with/without token). See §11.1.
2. **The token appears in HTTP access logs — CONFIRMED (2026-11-10), accepted risk.**
   It is in the request line (`GET /invitations/accept?token=…`), which the dev server
   log and any reverse proxy / CDN will record. This is inherent to a query-string
   link; the mitigation is log scrubbing or a fragment/`POST` exchange, not a header.
   The closure run reproduced it deliberately with a dummy value: the dev log held the
   raw value in two lines (`… 307` and `… 200`), and the anonymous redirect's
   `Location: /auth/signin?callbackUrl=%2Finvitations%2Faccept%3Ftoken%3D…` carries the
   same value percent-encoded. Severity: **low** — an invitation token is single-use,
   bound to one address, expires in 7 days, and is stored hashed; a leaked log line
   cannot be replayed on its own. Recorded as an accepted risk, not a defect.

---

## 4. Invitation lifecycle (OWNER, real browser + API)

| Step | Observed |
|---|---|
| Create TEACHER invitation from `/institution/staff` | UI notice: «أُنشئت الدعوة، لكن تعذّر إرسال البريد — انسخ الرابط وشاركه مباشرة» + the accept path. API `201`, `emailSent:false`, `emailFailure:"PROVIDER_ERROR"` |
| Row state | `PENDING`, role `TEACHER`, `expiresAt` = now + 7 days, one row per (centre, email) |
| Duplicate create | `409 INVITATION_PENDING` — «أعد إرسالها بدل إنشاء دعوة جديدة» |
| Resend via UI | «أُعيد توليد الرابط، لكن تعذّر إرسال البريد — انسخه وشاركه» + a new path; `expiresAt` moved forward |
| Resend via API | `200`, `PENDING`, `expiresAtChanged: true` |
| Old link after resend | `404 INVITATION_NOT_FOUND` (hash replaced) |
| New link | live — `403 EMAIL_MISMATCH` when opened by a different account |
| Revoke via UI | Row flips to «مسحوبة» and the «سحب» button disappears |
| Revoked link | `409 INVITATION_REVOKED` |
| Expiry (fixture: `expiresAt` moved 60 s into the past) | `409 INVITATION_EXPIRED` and the row is persisted as `EXPIRED` |
| Email delivery | **BLOCKED** — `emailSent:false` / `PROVIDER_ERROR` for every address (`@test.local` is reserved and non-routable). No external recipient was contacted |

---

## 5. OWNER vs CENTER_ADMIN

| Check | Result |
|---|---|
| OWNER role select in the UI | three options: `TEACHER:معلم`, `SECRETARY:سكرتارية`, `CENTER_ADMIN:مدير مركز` |
| OWNER invites `CENTER_ADMIN` | `201`, role `CENTER_ADMIN` |
| CENTER_ADMIN role select in the UI | two options only: «معلم»، «سكرتارية» — no `CENTER_ADMIN` in the DOM |
| CENTER_ADMIN invites TEACHER / SECRETARY | `201` / `201` |
| CENTER_ADMIN invites CENTER_ADMIN (posted directly, bypassing the UI) | `403 ROLE_NOT_INVITABLE` — enforced in the service, not the form |
| CENTER_ADMIN reads another centre's invitations (`?institution=seed-inst-2`) | `403 FORBIDDEN` |
| Editing `Institution.ownerId` or general memberships | no such route exists: the invitation API exposes create/list/resend/revoke only, and the D6 page renders the owner read-only. Verified by route inventory and by the absence of any owner/membership edit link in the rendered D6 page (`editLinks: []`) |

---

## 6. D6 — SUPER_ADMIN

| Check | Result |
|---|---|
| `/admin/institutions/seed-inst-1/staff` as SUPER_ADMIN | `200`, heading «دعوات مدير المركز», owner and staff count read-only, 7 invitations in the first read (`d6.readAccess`), 8 after the extra `CENTER_ADMIN` create below |
| API `GET /api/admin/institutions/seed-inst-1/staff` | `200`, same list |
| Role field in the form | single, **disabled** option `CENTER_ADMIN` |
| API create with `role:"TEACHER"` in the body | `201`, and the created row is `CENTER_ADMIN` — the body schema has no role field, so the value is ignored |
| Resend | `200`, `PENDING`, honest `emailSent:false` + new path |
| Revoke | `200`, `REVOKED` |
| Same page/API as OWNER (non-admin) | API `403`; page `307` redirect away |
| Invitation id from `seed-inst-2` used under the `seed-inst-1` path | `404 INVITATION_NOT_FOUND` — never acted on |

### 6.1 Demoted SUPER_ADMIN with a live JWT

A fixture account signed in while `SUPER_ADMIN`, then its `User.role` was changed
to `PARENT` and `roles` emptied **without touching the cookie**:

| Request | Before demotion | After demotion |
|---|---|---|
| `GET /api/admin/institutions/seed-inst-1/staff` | `200` | **`403`** |
| `GET /admin/institutions/seed-inst-1/staff` | `200` | `200` + `<meta id="__next-page-redirect" http-equiv="refresh" content="1;url=/">` |

The page status is 200 only because the streamed shell was already flushed when
`redirect("/")` ran; the payload contains **no institution name, no invitation
emails and no staff rows** (`0` table rows, checks in `dev-artifacts/qa44-results.json`).
The API — the only place data leaves the server — is refused immediately. Both
the layout and the page call `requireAdminPage()`, which re-reads the database.

---

## 7. Isolation, audit and data integrity

| Check | Result |
|---|---|
| `seed-inst-1` fixture invitations leaking into another centre | 0 |
| Invitation of `seed-inst-2` visible from `seed-inst-1` | no — 1 row, its own `institutionId` |
| Audit rows for this round's invitations | 16 rows at cleanup time: `STAFF_INVITATION.CREATED` ×10, `.RESENT` ×3, `.REVOKED` ×3; actor roles `OWNER`, `CENTER_ADMIN`, `SUPER_ADMIN`. Counted before removal — those rows were deleted with their invitations, so it is a cleanup-time snapshot, not a current total |
| Token / hash inside audit metadata | none (`containsHashOrToken: false`); metadata keys limited to `role`, `previousStatus`, `expiresAt` |
| Audit written only for real transitions | yes — a rejected duplicate/role/centre attempt produced no row |
| Invitation creating an account or membership by itself | no — 0 accounts and 0 memberships exist for the invited addresses |
| Duplicate `StaffMember` rows | none — the CENTER_ADMIN fixture has exactly 1 membership in `seed-inst-1` |
| `User.role` / `User.roles` touched by invitations | no — fixture stayed `PARENT` / `[]` |
| History preserved when reopening a row | yes — resend keeps the same row and appends `RESENT` with `previousStatus` |

---

## 8. Database state

**Before the run:** `staffInvitation` = 1 row (the accepted `mverify-teacher`
invitation in `seed-inst-1`); `StaffMember`: `seed-inst-1` 6, `seed-inst-2` 2,
`seed-inst-3` 3, `seed-inst-4` 2, `seed-inst-5` 2; `AuditLog` = 2 rows.

**During the run:** `qa44-*` invitations in `seed-inst-1` (PENDING / REVOKED /
EXPIRED) and one in `seed-inst-2`, `qa44-admin` membership, `qa44-*` users.

**After cleanup (verified):**

```
staffInvitation total = 1                     (the mverify-teacher ACCEPTED row)
invitations per institution = seed-inst-1: 1
qa44 users = 0 · qa44 memberships = 0
staffMember: seed-inst-1 6, seed-inst-2 2, seed-inst-3 3, seed-inst-4 2, seed-inst-5 2
AuditLog total = 2
mverify-teacher@test.local: role PARENT, verified, TEACHER/ACTIVE in seed-inst-1,
invitation ACCEPTED (acceptedAt unchanged)
```

Cleanup deleted only `qa44-*` users, their memberships, their pending tokens,
the invitations of this round and the 16 audit rows belonging to those
invitation ids. It did not touch `mverify-teacher`, its membership, its accepted
invitation or its two audit rows, and no owner session was ended.

---

## 9. Risks and checks not executed

1. **Email delivery — PASSED at the provider boundary, inbox confirmation pending.**
   In the main run every address used the reserved `@test.local` domain, which
   the provider rejects, so only `emailSent:false` was reachable. Re-run on
   2026-11-09 against a real recipient (`dev-artifacts/qa44-email-check.json`):

   - Provider: Resend (`POST https://api.resend.com/emails`), sender
     `SARH <onboarding@resend.dev>`. The configured key is present and valid but
     scoped to **sending only** — `/domains` and `/emails/:id` answer
     `401 restricted_api_key`, so message events cannot be read from here.
   - Because the sender is the sandbox address, the provider permits exactly one
     recipient: the account owner's own mailbox. That is the address used, and it
     is the only address contacted. No other recipient was ever attempted.
   - Result: `201` in 2.16 s, `emailSent:true`, `emailFailure:null`, and — as
     designed — **no `acceptPath` in the response** when the provider succeeds
     (so the token exists only in the delivered message). Row `PENDING`,
     `TEACHER`, expiry +7 days; audit holds one `STAFF_INVITATION.CREATED` by
     `OWNER` with metadata keys `role`, `expiresAt`, `previousStatus`; stored
     token remains `sha256:`-prefixed (71 chars). Fixture deleted afterwards, so
     the link in that message is intentionally dead.
   - **Limit:** a 2xx from the provider proves acceptance, not inbox arrival.
     Confirming arrival needs the owner to open that mailbox, and reading the
     message's own event status needs a non-restricted key or a verified domain.
     `EMAIL_FROM` is still the sandbox sender, so real invitees cannot be mailed
     until a domain is verified in Resend and `EMAIL_FROM` is switched to it —
     that remains the open production blocker for phase 4.4.
2. ~~**Cold-start 500 on the first invitation request (P2028)**~~ — **fixed and
   re-verified, 2026-11-09.** The first `POST …/invitations` after `next dev`
   starts answered `500` after 18 s: Prisma's interactive transaction exceeded
   its 5 s budget (6.5 s elapsed) while the route was still compiling. Now every
   interactive transaction in `src/lib/db/staff-invitations.ts` (create, resend,
   revoke, accept) carries the same explicit budget the guardian and join-code
   flows already use — `{ timeout: 15_000, maxWait: 10_000 }` — because each of
   them takes an advisory lock and then writes the row plus its audit entry.
   Verified with `.next` deleted so the route compiled from scratch: the first
   invitation request answered `201` (3.66 s server-side, 8.87 s including
   sign-in and compile), the row landed `PENDING` at +7 days, and the server log
   contains no `P2028`. `npx tsc --noEmit` is clean and
   `tests/staff-invitations.test.ts` passes 15/15. Caveat: the original 6.5 s
   stall did not reproduce on demand, so this proves the flow works from a cold
   build with the new budget — the 15 s ceiling mechanically covers the observed
   6.5 s, but the stall itself was not re-provoked.
3. ~~`Referrer-Policy` missing on `/invitations/accept`~~ — **resolved** on
   2026-11-09: both `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`
   are served for the route (§3.2).
4. **Token in access logs** (query string) — accepted risk of the link design.
5. **Acceptance by the invitee was not re-run this round.** The accepted-teacher
   cycle already has a documented PASSED run in
   [d5-manual-session-verification.md](d5-manual-session-verification.md) (checks 4 and 4B);
   this round intentionally avoided recreating a membership.
6. **In-process rate limiter** (`src/lib/rate-limit.ts`) resets on restart and
   does not span processes; not exercised here.
7. **Streamed redirect nuance** for a demoted admin page (§6.1): 200 + meta
   refresh instead of 307. No data leaves; behaviour is framework-level.

---

## 10. Conclusion

- **Phase 4.4 (functional and security scope)** — the invitation system behaves as
  specified: server-decided roles, hashed tokens, rotation on resend, durable
  revoke/expiry, audit per transition, and honest reporting in both mail branches —
  `emailSent:false` with the link handed back when the provider refuses, and a real
  provider-accepted send with no token copy when it succeeds (§9.1). Result:
  **MANUAL QA COMPLETE — VERIFIED WITH LIMITATIONS**.
- **Phase 4.4 (production email readiness)** — **BLOCKED, external.** A sending domain
  must be registered, delegated and have its Resend records verified before a
  non-owner invitee can be mailed; as of 2026-11-10 `sarh.ps` still answers
  `NXDOMAIN` (§11.3). This does not affect the functional verdict above and does not
  gate the next phase.
- **D6** — the single narrow platform screen is correctly scoped: one role, one
  institution, live SUPER_ADMIN check on every request, 404 across centres, owner
  and memberships read-only. Result: **PASSED**.
- Outstanding, non-blocking: the owner's inbox confirmation of the one
  provider-accepted message and a decision on log scrubbing for the query-string
  token (§3.2.2). The `Referrer-Policy` gap and the cold-start transaction timeout
  (§9.2) were both decided and fixed on 2026-11-09.

---

## 11. Closure re-verification (2026-11-10)

This run did **not** repeat the scenario matrix of §4–§7; those results stand on
`dev-artifacts/qa44-results.json`. It re-checked only what had changed or had never
been verified, then ran the standing checks. Evidence:
`dev-artifacts/qa44-closure-2026-11-10.json`.

### 11.1 `acceptPath` headers, including the authenticated response

Probe token was a dummy string, never an issued invitation token.

| Request | Status | `cache-control` | `referrer-policy` | `x-robots-tag` |
|---|---|---|---|---|
| anonymous, with token | `307` | `no-store, must-revalidate` | `no-referrer` | `noindex` |
| anonymous, no token | `307` | `no-store, must-revalidate` | `no-referrer` | `noindex` |
| signed in (OWNER), with token | `200` | `no-store, must-revalidate` | `no-referrer` | `noindex` |
| signed in (OWNER), no token | `200` | `no-store, must-revalidate` | `no-referrer` | `noindex` |

The authenticated `200` is the new evidence: the first run's `accept.headers` check
recorded `referrerPolicy: null` / `robots: null` on that response, so the `headers()`
entry is now confirmed on both the redirect and the rendered page.

`acceptPath` is still never returned to an unauthorised caller: the anonymous request
only redirects to `/auth/signin`, and the token is not echoed anywhere on that path.
On the authenticated page the token **is** present in the server-rendered HTML because
`AcceptInvitationClient` receives it as a prop — expected for a form that must submit
it, and not a cache leak given `no-store` + `force-dynamic`. It is not written to
`AuditLog`, and the row still stores `sha256:` only (71 chars).

The redirect `Location` percent-encodes the token inside `callbackUrl`
(`/auth/signin?callbackUrl=%2Finvitations%2Faccept%3Ftoken%3D…`), so the value also
reaches access logs via that header — recorded with §3.2.2.

### 11.2 Transaction budgets after the P2028 fix

`src/lib/db/staff-invitations.ts:54` defines one constant used by all four interactive
transactions — `INVITATION_TX_OPTIONS = { timeout: 15_000, maxWait: 10_000 }` — and it
is passed as the second argument in `createStaffInvitation` (L331), `resendStaffInvitation`
(L393), `revokeStaffInvitation` (L441) and `acceptStaffInvitation` (L612). None of the
four still uses Prisma's implicit 5 s budget.

Regression evidence: the 15 `staff-invitations` tests pass inside the full suite below,
and the closure run's dev log contains no `P2028` and no Prisma error. **Limit:** the
original 6.5 s cold-start stall was not re-provoked, so this shows the budget is in
place and the flows work, not that a compile stall can never happen again. Note for
the record: the first compile of `/invitations/accept` in this run took 15.2 s (route
compilation, before request handling) — large, but outside the transaction's clock.

### 11.3 Resend and sending-domain state (unchanged, re-verified)

`EMAIL_FROM` is still `SARH <onboarding@resend.dev>`; it was **not** changed. The API key
is present and send-only (`/domains` and `/api-keys` answer `401 restricted_api_key`),
so domain verification cannot be read from the API and DNS is the only evidence.

| Query (DNS-over-HTTPS) | Result |
|---|---|
| `sarh.ps` NS / SOA | `NXDOMAIN` (status 3) |
| `notify.sarh.ps` NS | `NXDOMAIN` |
| `send.notify.sarh.ps` MX / TXT | `NXDOMAIN` |
| `resend._domainkey.notify.sarh.ps` TXT | `NXDOMAIN` |
| `_dmarc.notify.sarh.ps` TXT | `NXDOMAIN` |
| `resend.com` A (control) | `76.76.21.22` — resolver healthy |

The parent name has no registry entry, so none of the Resend records can be graded
present or wrong; they are **unverifiable**. The three delivery states are therefore
kept distinct:

| State | Verdict |
|---|---|
| Provider accepted | **PASSED** (`201`, `emailSent:true`, no token copy — §9.1) |
| Inbox delivered | **NOT VERIFIED** (needs the owner to open the mailbox) |
| Production sender verified | **BLOCKED** (external: no delegated domain) |

No test email was sent in this run and no alternative domain was invented.

### 11.4 Standing checks, current tree

| Check | Result |
|---|---|
| `npm test` | **382 pass, 0 fail** (67 suites, 57.4 s) — includes `staff-invitations.test.ts` 15/15 |
| `npx tsc --noEmit` | exit 0, no diagnostics |
| `npm run lint` | exit 0, **0 errors**, 2 pre-existing warnings (`src/app/layout.tsx` custom font, `src/components/ui/file-input.tsx` `<img>`) |
| `npm run build` | exit 0 (Next.js 14.2.33); `/invitations/accept` remains dynamic at 2.83 kB |
| `npx prisma migrate status` | 2 migrations found, **schema up to date**, exit 0 |

### 11.5 Data integrity at closure

```
staffInvitation = 1        seed-inst-1 / ACCEPTED (mverify-teacher)
staffMember     = seed-inst-1 6 · seed-inst-2 2 · seed-inst-3 3 · seed-inst-4 2 · seed-inst-5 2
AuditLog        = 2        STAFF_INVITATION.CREATED, STAFF_INVITATION.ACCEPTED
qa44 leftovers  = 0 users · 0 invitations · 0 memberships
```

Audit metadata keys are `role, expiresAt, previousStatus` and
`role, invitedById, staffMemberId`; a scan for `sha256:` and for `token`/`tokenHash`/`hash`
keys returned nothing. `mverify-teacher@test.local` is still `role PARENT` / `roles []`,
verified, `TEACHER`/`ACTIVE` in `seed-inst-1`, with its invitation `ACCEPTED` at the
unchanged `acceptedAt` timestamp. `Institution.ownerId` was not touched by this run
(no write path exists for it in the invitation API). No fixtures were created; the
only files added are this document's evidence JSON.

### 11.6 What this run decided

| Item | Classification |
|---|---|
| Invitation lifecycle, role matrix, isolation, audit, D6 | **MANUAL QA VERIFIED** |
| `acceptPath` header hardening (307 and 200) | **CLOSED** |
| Token in access logs | **ACCEPTED RISK — low** (single-use, bound, expiring, hashed) |
| P2028 cold-start fix | **CLOSED** (config in place, flows green; recurrence not disprovable) |
| Real invitee email delivery | **EXTERNAL DEPLOYMENT BLOCKER** (DNS not delegated) |
| Phase 4.4 as a whole | **CLOSED** for functional scope; email readiness **BLOCKED** |
| D6 as a whole | **CLOSED** |
