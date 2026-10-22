import type { StaffRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Institution access policy (`/institution/**`).
 *
 * `User.role = INSTITUTION_TEACHER` only says which *portal* an account may
 * open. It says nothing about *which centre* — or whether the account may read
 * that centre's data at all. That decision is made here, from the database, on
 * every server render.
 *
 * Authority comes from exactly two places:
 *
 *   OWNER        `Institution.ownerId === userId`
 *                Every institution capability, including commission and
 *                financial reads. Ownership is independent of staff
 *                membership: an owner whose membership is missing, inactive
 *                or `STAFF` is still the owner.
 *
 *   CENTER_ADMIN An ACTIVE `StaffMember` row with `role = CENTER_ADMIN`
 *                Operational capabilities only. Commission/financial reads
 *                are deliberately excluded until a separate policy exists.
 *
 * Everyone else gets no institution-administration token:
 *
 *   SECRETARY    No institution-administration access in this phase. A
 *                limited secretary workspace is a separate product decision.
 *   TEACHER      Works in `/teacher`; membership is not an admin credential.
 *   SUPERVISOR   Works through `/supervisor`; membership is not an admin grant.
 *   STAFF        Safe default for unclassified memberships; no authority.
 *   ON_LEAVE / INACTIVE rows are excluded even when their role is
 *   CENTER_ADMIN.
 *
 * `title` is display text and is never consulted here.
 */

export type InstitutionAccessLevel = "OWNER" | "CENTER_ADMIN";

/**
 * A capability is a named server-side permission. Pages use it to decide what
 * to load/render; data loaders call `requireCapability` so a forgotten UI
 * branch cannot turn into a data leak.
 */
export type InstitutionCapability =
  | "institution.read"
  | "staff.read"
  | "roster.read"
  | "profile.read"
  | "ai_studio.use"
  | "commissions.read";

const OWNER_CAPABILITIES: readonly InstitutionCapability[] = [
  "institution.read",
  "staff.read",
  "roster.read",
  "profile.read",
  "ai_studio.use",
  "commissions.read",
];

const CENTER_ADMIN_CAPABILITIES: readonly InstitutionCapability[] = [
  "institution.read",
  "staff.read",
  "roster.read",
  "profile.read",
  "ai_studio.use",
];

const CAPABILITIES_BY_LEVEL: Record<
  InstitutionAccessLevel,
  readonly InstitutionCapability[]
> = {
  OWNER: OWNER_CAPABILITIES,
  CENTER_ADMIN: CENTER_ADMIN_CAPABILITIES,
};

/** An authorisation token for exactly one institution. */
export interface InstitutionAccess {
  userId: string;
  institutionId: string;
  level: InstitutionAccessLevel;
  /** The membership row backing a CENTER_ADMIN grant; null for an owner. */
  staffMemberId: string | null;
  capabilities: readonly InstitutionCapability[];
}

/** True when the token carries the named capability. */
export function hasCapability(
  access: InstitutionAccess,
  capability: InstitutionCapability
): boolean {
  return access.capabilities.includes(capability);
}

/** Raised when a loader is asked for data the token cannot read. */
export class InstitutionAccessDeniedError extends Error {
  constructor(readonly capability: InstitutionCapability) {
    super(`Institution access denied: ${capability}`);
    this.name = "InstitutionAccessDeniedError";
  }
}

/**
 * Server-side guard used by every tenant-scoped loader.
 *
 * Throwing (rather than returning an empty list) is intentional: a missing UI
 * branch must fail closed and be noticed, not silently render zeros that look
 * like real data.
 */
export function requireCapability(
  access: InstitutionAccess,
  capability: InstitutionCapability
): void {
  if (!hasCapability(access, capability)) {
    throw new InstitutionAccessDeniedError(capability);
  }
}

function accessFor(
  userId: string,
  institutionId: string,
  level: InstitutionAccessLevel,
  staffMemberId: string | null
): InstitutionAccess {
  return {
    userId,
    institutionId,
    level,
    staffMemberId,
    capabilities: CAPABILITIES_BY_LEVEL[level],
  };
}

/**
 * Every institution the account may administer, ordered deterministically:
 * owned centres first (oldest first), then CENTER_ADMIN memberships (oldest
 * first).
 *
 * The order is part of the contract — a multi-centre owner must land on the
 * same centre on every request, not on whichever row the database returns
 * first.
 */
export async function listInstitutionAccess(
  userId: string
): Promise<InstitutionAccess[]> {
  const [owned, memberships] = await Promise.all([
    prisma.institution.findMany({
      where: { ownerId: userId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    }),
    prisma.staffMember.findMany({
      where: { userId, status: "ACTIVE", role: "CENTER_ADMIN" },
      orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
      select: { id: true, institutionId: true },
    }),
  ]);

  const access: InstitutionAccess[] = owned.map((institution) =>
    accessFor(userId, institution.id, "OWNER", null)
  );
  const granted = new Set(access.map((entry) => entry.institutionId));

  for (const membership of memberships) {
    // Ownership already carries the strongest grant for this centre.
    if (granted.has(membership.institutionId)) continue;

    access.push(
      accessFor(userId, membership.institutionId, "CENTER_ADMIN", membership.id)
    );
    granted.add(membership.institutionId);
  }

  return access;
}

/**
 * Resolve the institution a request may act on.
 *
 * With no `requestedId`, returns the account's first permitted centre (owned
 * before CENTER_ADMIN, oldest first) or `null`.
 *
 * With an explicit id — the `?institution=` selector on `/institution/**` —
 * returns that centre **only if** it appears in the account's grants. A
 * foreign, inactive or unknown id returns `null`; it never falls back to a
 * different centre, so an edited URL cannot silently read someone else's data.
 */
export async function resolveInstitutionAccess(
  userId: string,
  requestedId?: string | null
): Promise<InstitutionAccess | null> {
  const access = await listInstitutionAccess(userId);
  const requested = requestedId?.trim();

  if (!requested) return access[0] ?? null;

  return access.find((entry) => entry.institutionId === requested) ?? null;
}

/**
 * Read the optional `?institution=` selector from a page's `searchParams`.
 *
 * Only a single non-empty string is a selector; a repeated parameter is
 * ignored (the page falls back to the account's default centre) rather than
 * being coerced into a plausible id.
 */
export function requestedInstitutionId(
  searchParams?: Record<string, string | string[] | undefined> | null
): string | undefined {
  const raw = searchParams?.institution;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

/**
 * The portal tier a membership role is allowed to project onto the account.
 *
 * `CENTER_ADMIN` is the only membership role that may be paired with
 * `INSTITUTION_TEACHER` at invitation/onboarding time, because it is the only
 * one that can receive an institution-administration token. SECRETARY,
 * TEACHER, SUPERVISOR and STAFF must not receive it from an invitation.
 *
 * This is a projection, not an authorisation decision: holding
 * `INSTITUTION_TEACHER` alone still yields no institution data. The function
 * is kept here so the future invitation flow has one allow-list instead of
 * duplicating the mapping in a form.
 */
export function portalTierForStaffRole(
  role: StaffRole
): "INSTITUTION_TEACHER" | null {
  return role === "CENTER_ADMIN" ? "INSTITUTION_TEACHER" : null;
}

/**
 * Whether an account has a database relationship that justifies the
 * institution portal tier at sign-in.
 *
 * This exists because `middleware.ts` runs on the Edge and can only read the
 * JWT; it cannot ask PostgreSQL whether a CENTER_ADMIN membership still exists.
 * The auth callback is the one place that can project this relationship into
 * the existing `roles` claim, so a newly appointed non-owner director can
 * enter `/institution` without an operator also editing `User.role` by hand.
 *
 * The projection is intentionally narrow:
 *
 *   • ownership (`Institution.ownerId`) always qualifies;
 *   • only an ACTIVE membership whose `role` is `CENTER_ADMIN` qualifies;
 *   • TEACHER, SECRETARY, SUPERVISOR, STAFF, ON_LEAVE and INACTIVE do not.
 *
 * It is still only a portal key, never a tenant grant: the layout and every
 * loader call `resolveInstitutionAccess` against the live database, so a stale
 * JWT can open the portal shell but can never read a centre's rows after the
 * membership is revoked. Changes therefore take effect on the next sign-in for
 * the portal gate, and immediately for data.
 */
export async function userHasInstitutionPortalGrant(
  userId: string
): Promise<boolean> {
  const [owned, adminMembership] = await Promise.all([
    prisma.institution.findFirst({
      where: { ownerId: userId },
      select: { id: true },
    }),
    prisma.staffMember.findFirst({
      where: { userId, status: "ACTIVE", role: "CENTER_ADMIN" },
      select: { id: true },
    }),
  ]);

  return Boolean(owned || adminMembership);
}
