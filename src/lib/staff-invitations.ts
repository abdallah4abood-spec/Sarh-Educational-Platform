import { createHash, randomBytes } from "node:crypto";

import type { StaffRole } from "@prisma/client";

/**
 * Staff-invitation rules — pure policy, no database, no session.
 *
 * An invitation is the *offer* to join a centre's staff; it is never a
 * membership. `StaffInvitation` is independent of `StaffMember`, and `INVITED`
 * was deliberately never added to `StaffStatus`, so the roster keeps listing
 * people who actually work there.
 *
 * The secret follows the same doctrine as `StudentJoinCode`: a cryptographically
 * strong random token is handed to the invitee in a link, and only its digest
 * reaches the database. A dump therefore contains no usable invitation.
 *
 * Roles are decided here, on the server, from the inviter's *kind*, and never
 * from a value the browser sends:
 *
 *   OWNER        → TEACHER, SECRETARY, CENTER_ADMIN
 *   CENTER_ADMIN → TEACHER, SECRETARY           (cannot appoint another admin)
 *   SUPER_ADMIN  → CENTER_ADMIN only            (the one D6 screen)
 *
 * SUPERVISOR and STAFF are outside the invitation matrix in this phase.
 */

/** 7 days, per the reviewed plan. */
export const STAFF_INVITATION_TTL_DAYS = 7;
export const STAFF_INVITATION_TTL_MS =
  STAFF_INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000;

/** Who is issuing the invitation — the only input to the role matrix. */
export type InvitationActorKind = "OWNER" | "CENTER_ADMIN" | "SUPER_ADMIN";

export const INVITABLE_ROLES: Record<
  InvitationActorKind,
  readonly StaffRole[]
> = {
  OWNER: ["TEACHER", "SECRETARY", "CENTER_ADMIN"],
  CENTER_ADMIN: ["TEACHER", "SECRETARY"],
  SUPER_ADMIN: ["CENTER_ADMIN"],
};

/** Arabic labels for the invitation UI; never consulted for authorisation. */
export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  CENTER_ADMIN: "مدير مركز",
  SECRETARY: "سكرتارية",
  TEACHER: "معلم",
  SUPERVISOR: "مشرف",
  STAFF: "موظف",
};

export function invitableRoles(actorKind: InvitationActorKind): StaffRole[] {
  return [...INVITABLE_ROLES[actorKind]];
}

export function canInviteRole(
  actorKind: InvitationActorKind,
  role: StaffRole
): boolean {
  return INVITABLE_ROLES[actorKind].includes(role);
}

/**
 * One canonical form for an address: trimmed, lower-cased, and rejected when it
 * is empty or obviously not an address. Acceptance compares the invitation's
 * stored form against the account's stored form, so both must normalise the
 * same way — this function is the only normaliser.
 */
export function normalizeInvitationEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** 32 random bytes, base64url — 256 bits, safe inside a URL query string. */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The stored form of the token.
 *
 * The `sha256:` prefix makes the column self-describing (a digest, not a
 * secret) and the domain separator keeps the digest from being reusable against
 * any other table.
 */
export function hashInvitationToken(token: string): string {
  return `sha256:${createHash("sha256")
    .update(`sarh:staff-invitation:${token}`)
    .digest("hex")}`;
}

export function invitationExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + STAFF_INVITATION_TTL_MS);
}

/** The page the emailed link points at. The token stays in the query string. */
export function invitationAcceptPath(token: string): string {
  return `/invitations/accept?token=${encodeURIComponent(token)}`;
}

/**
 * A PENDING row whose `expiresAt` has passed is *shown* and *treated* as
 * expired. The stored status is the durable lifecycle (`PENDING` / `ACCEPTED` /
 * `REVOKED`); expiry is derived so it cannot depend on a cron job running. A
 * lazily-persisted `EXPIRED` write is done by the service when it needs to
 * record the transition.
 */
export function effectiveInvitationStatus(
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED",
  expiresAt: Date,
  now: Date = new Date()
): "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED" {
  if (status === "PENDING" && expiresAt.getTime() <= now.getTime()) {
    return "EXPIRED";
  }
  return status;
}

/** True when the row can still be accepted right now. */
export function isInvitationLive(
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED",
  expiresAt: Date,
  now: Date = new Date()
): boolean {
  return effectiveInvitationStatus(status, expiresAt, now) === "PENDING";
}
