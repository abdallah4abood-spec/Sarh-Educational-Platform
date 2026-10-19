import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/lib/config/site";

/**
 * Password-recovery tokens.
 *
 * They ride on the same `VerificationToken` table as the signup confirmation
 * link but under a namespaced identifier (`pwreset:<email>`), which keeps the
 * two single-use flows from invalidating each other: `consumeVerificationToken`
 * only ever deletes rows for the bare email address.
 *
 * The stored value is 32 CSPRNG bytes, so a token cannot be guessed, and a
 * fresh request deletes every earlier token for that account.
 */

/** Recovery links are short-lived — one hour, against 24h for signup. */
export const RESET_TTL_MS = 60 * 60 * 1000;

const RESET_PREFIX = "pwreset:";

function identifierFor(email: string): string {
  return `${RESET_PREFIX}${email.toLowerCase()}`;
}

export function buildResetUrl(token: string): string {
  const origin = siteConfig.appUrl.replace(/\/+$/, "");
  return `${origin}/auth/reset-password?token=${encodeURIComponent(token)}`;
}

/** Issues a fresh recovery token for `email`, invalidating previous ones. */
export async function createResetToken(email: string): Promise<string> {
  const identifier = identifierFor(email);
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + RESET_TTL_MS);

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier } }),
    prisma.verificationToken.create({ data: { identifier, token, expires } }),
  ]);

  return token;
}

export type ResetTokenLookup =
  | { ok: true; email: string }
  | { ok: false; reason: "NOT_FOUND" | "EXPIRED" | "DB_UNAVAILABLE" };

/**
 * Read-only validity check for the `/auth/reset-password` page, so an expired
 * or already-used link shows an explanation instead of a form that will fail
 * on submit. Expired rows are burned here, exactly as the email link does.
 */
export async function peekResetToken(
  token: string
): Promise<ResetTokenLookup> {
  if (!token || token.length < 16) return { ok: false, reason: "NOT_FOUND" };

  try {
    const record = await prisma.verificationToken.findUnique({
      where: { token },
      select: { identifier: true, expires: true },
    });

    if (!record || !record.identifier.startsWith(RESET_PREFIX)) {
      return { ok: false, reason: "NOT_FOUND" };
    }

    if (record.expires.getTime() < Date.now()) {
      await prisma.verificationToken.deleteMany({
        where: { identifier: record.identifier },
      });
      return { ok: false, reason: "EXPIRED" };
    }

    return { ok: true, email: record.identifier.slice(RESET_PREFIX.length) };
  } catch (error) {
    console.error("[password-reset] lookup failed:", error);
    return { ok: false, reason: "DB_UNAVAILABLE" };
  }
}

export type ResetOutcome =
  | { ok: true; email: string }
  | { ok: false; reason: "NOT_FOUND" | "EXPIRED" | "DB_UNAVAILABLE" };

/**
 * Redeems a token: rewrites the password hash and burns every token for the
 * account.
 *
 * Opening the link proves control of the mailbox, so an account that never
 * finished email verification is stamped verified here too — otherwise the
 * user would reset successfully and still be locked out of the portals.
 */
export async function consumeResetToken(
  token: string,
  newPassword: string
): Promise<ResetOutcome> {
  const lookup = await peekResetToken(token);
  if (!lookup.ok) return lookup;

  try {
    const passwordHash = await bcrypt.hash(newPassword, 12);

    const [updated] = await prisma.$transaction([
      prisma.user.updateMany({
        where: { email: lookup.email },
        data: { passwordHash },
      }),
      // Proving control of the inbox is what email verification proves, so an
      // account that never finished that step is activated here. The `null`
      // filter keeps an existing timestamp untouched.
      prisma.user.updateMany({
        where: { email: lookup.email, emailVerified: null },
        data: { emailVerified: new Date() },
      }),
      prisma.verificationToken.deleteMany({
        where: { identifier: identifierFor(lookup.email) },
      }),
    ]);

    if (updated.count === 0) return { ok: false, reason: "NOT_FOUND" };

    return { ok: true, email: lookup.email };
  } catch (error) {
    console.error("[password-reset] failed:", error);
    return { ok: false, reason: "DB_UNAVAILABLE" };
  }
}
