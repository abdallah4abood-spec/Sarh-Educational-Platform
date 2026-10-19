import { prisma } from "@/lib/prisma";
import {
  looksLikeEmail,
  normalizePhone,
  phoneMatchSuffix,
} from "@/lib/phone";

/**
 * Resolving "who is this?" from the single identifier field used across the
 * auth suite (sign-in, password recovery).
 *
 * Email is matched case-insensitively. A phone number is matched on its
 * normalised form first, then on its last nine digits — that second pass is
 * what lets `0599000000` reach an account stored as `+970599000000` without
 * the platform inventing a country code of its own.
 *
 * One module owns this so sign-in and recovery can never disagree about who a
 * number belongs to.
 */

/** Columns every consumer of `findUserByIdentifier` may rely on. */
export const IDENTIFIER_USER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phoneNumber: true,
  role: true,
  roles: true,
  passwordHash: true,
  emailVerified: true,
} as const;

export async function findUserByIdentifier(identifier: string) {
  const value = identifier.trim();
  if (!value) return null;

  if (looksLikeEmail(value)) {
    return prisma.user.findUnique({
      where: { email: value.toLowerCase() },
      select: IDENTIFIER_USER_SELECT,
    });
  }

  const normalized = normalizePhone(value);
  if (!normalized) return null;

  const exact = await prisma.user.findUnique({
    where: { phoneNumber: normalized },
    select: IDENTIFIER_USER_SELECT,
  });
  if (exact) return exact;

  const suffix = phoneMatchSuffix(normalized);
  if (!suffix) return null;

  return prisma.user.findFirst({
    where: { phoneNumber: { endsWith: suffix } },
    select: IDENTIFIER_USER_SELECT,
  });
}

/**
 * `p•••@gmail.com` — echoed back on the recovery screens so the user can
 * confirm which inbox to open without the API ever returning a full address.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  const visible = local.slice(0, 1);
  return `${visible}${"•".repeat(Math.max(local.length - 1, 2))}@${domain}`;
}
