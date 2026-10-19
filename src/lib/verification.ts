import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/lib/config/site";

/**
 * Email-verification tokens (NextAuth `VerificationToken` shape).
 *
 * The stored value is a 32-byte CSPRNG hex string, so it cannot be guessed or
 * enumerated. Tokens are single-use: consuming one deletes every token for the
 * identifier, which also invalidates any older links for the same address.
 */

/** How long a verification link stays valid. */
export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export function buildVerificationUrl(token: string): string {
  const origin = siteConfig.appUrl.replace(/\/+$/, "");
  return `${origin}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
}

/** Issues a fresh token for `email`, invalidating previous ones. */
export async function createVerificationToken(email: string): Promise<string> {
  const identifier = email.toLowerCase();
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + VERIFICATION_TTL_MS);

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier } }),
    prisma.verificationToken.create({
      data: { identifier, token, expires },
    }),
  ]);

  return token;
}

export type VerifyOutcome =
  | { ok: true; email: string }
  | { ok: false; reason: "NOT_FOUND" | "EXPIRED" | "DB_UNAVAILABLE" };

/**
 * Redemption: flips `emailVerified` on the matching account and burns the
 * token. Already-verified users still succeed (idempotent link).
 */
export async function consumeVerificationToken(
  token: string
): Promise<VerifyOutcome> {
  if (!token || token.length < 16) return { ok: false, reason: "NOT_FOUND" };

  try {
    const record = await prisma.verificationToken.findUnique({
      where: { token },
      select: { identifier: true, expires: true },
    });

    if (!record) return { ok: false, reason: "NOT_FOUND" };

    if (record.expires.getTime() < Date.now()) {
      await prisma.verificationToken.deleteMany({
        where: { identifier: record.identifier },
      });
      return { ok: false, reason: "EXPIRED" };
    }

    await prisma.$transaction([
      prisma.user.updateMany({
        where: { email: record.identifier, emailVerified: null },
        data: { emailVerified: new Date() },
      }),
      prisma.verificationToken.deleteMany({
        where: { identifier: record.identifier },
      }),
    ]);

    return { ok: true, email: record.identifier };
  } catch (error) {
    console.error("[verify-email] failed:", error);
    return { ok: false, reason: "DB_UNAVAILABLE" };
  }
}
