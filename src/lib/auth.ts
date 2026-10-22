import type { NextAuthOptions } from "next-auth";
import type { Role } from "@prisma/client";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { findUserByIdentifier } from "@/lib/identifier";
import { userHasInstitutionPortalGrant } from "@/lib/institution-access";
import { prisma } from "@/lib/prisma";
import { isPhoneNumber, looksLikeEmail } from "@/lib/phone";
import { PLATFORM_ADMIN_ROLE, ROLE_HOME, effectiveRoles } from "@/lib/roles";

export { ROLE_HOME };

/**
 * Credential payload accepted by the SARH credentials provider.
 *
 * `identifier` is deliberately a single field: the user may sign in with the
 * email address that anchors the account or with a phone number registered to
 * it, and both are resolved to one user row in `resolveIdentifier`.
 */
export const credentialsSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, { message: "الرجاء إدخال البريد الإلكتروني أو رقم الجوال" })
    .refine((value) => looksLikeEmail(value) || isPhoneNumber(value), {
      message: "أدخل بريداً إلكترونياً صحيحاً أو رقم جوال صحيحاً",
    }),
  password: z
    .string()
    .min(8, { message: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" }),
});

export type CredentialsInput = z.infer<typeof credentialsSchema>;

/**
 * Google is optional: it is registered only when the OAuth pair exists in the
 * environment, so a clone without credentials still boots and builds cleanly.
 */
const googleConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

/** How long a remembered session lasts (matches `session.maxAge`). */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Merge the account's stored tiers with the institution portal key that its
 * live ownership / CENTER_ADMIN membership justifies.
 *
 * This is additive and idempotent: a stored `INSTITUTION_TEACHER` is never
 * removed or replaced, and the primary `role` is untouched. It does not grant
 * any tenant data — `resolveInstitutionAccess` still checks the database on
 * every institution page.
 */
async function sessionTiers(
  userId: string,
  primary: Role,
  stored: readonly Role[] | undefined
): Promise<Role[]> {
  const tiers = effectiveRoles(primary, stored);
  if (tiers.includes("INSTITUTION_TEACHER")) return tiers;

  if (await userHasInstitutionPortalGrant(userId)) {
    tiers.push("INSTITUTION_TEACHER");
  }
  return tiers;
}

/**
 * The session cookie name NextAuth itself would derive: `__Secure-` prefixed
 * as soon as the app is served over HTTPS. Pinning it here (rather than
 * renaming it) keeps existing sessions valid while giving the sign-in route
 * one place to read it from.
 */
export const SESSION_COOKIE_NAME = `${
  (process.env.NEXTAUTH_URL ?? "").startsWith("https://") ? "__Secure-" : ""
}next-auth.session-token`;

/**
 * Default cookie options for the session token.
 *
 * `maxAge` is what "remember me" toggles, so it is spelled out here instead of
 * being left to the library default: without it the browser would treat the
 * cookie as a session cookie and drop it on close.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: (process.env.NEXTAUTH_URL ?? "").startsWith("https://"),
  maxAge: SESSION_MAX_AGE_SECONDS,
};

export const authOptions: NextAuthOptions = {
  // JWT stateless sessions: no database round-trip on every request,
  // which keeps latency low on constrained networks (Gaza).
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/signin",
  },
  cookies: {
    sessionToken: {
      name: SESSION_COOKIE_NAME,
      options: SESSION_COOKIE_OPTIONS,
    },
  },
  providers: [
    CredentialsProvider({
      name: "بيانات الدخول",
      credentials: {
        identifier: { label: "البريد الإلكتروني أو رقم الجوال", type: "text" },
        password: { label: "كلمة المرور", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) {
          throw new Error("بيانات الدخول غير صالحة");
        }

        const { identifier, password } = parsed.data;

        const user = await findUserByIdentifier(identifier);

        // A single generic message avoids leaking which accounts exist.
        const invalid = new Error(
          "البريد الإلكتروني أو رقم الجوال أو كلمة المرور غير صحيحة"
        );

        if (!user || !user.passwordHash) {
          throw invalid;
        }

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
          throw invalid;
        }

        // Only JWT-safe primitives are returned to NextAuth. An unverified
        // credential account still signs in — the RBAC middleware is what
        // keeps it out of the portals until it opens its verification link,
        // so it can always reach /auth/signin and resend the email.
        //
        // The tier set is resolved here, from the database, and never from
        // anything the client sent: this is what makes the sign-in flow
        // role-agnostic (no account-type picker) while still routing the
        // visitor to the portal their account actually owns.
        return {
          id: user.id,
          name: user.fullName,
          email: user.email,
          role: user.role as Role,
          roles: await sessionTiers(
            user.id,
            user.role as Role,
            user.roles as Role[]
          ),
          emailVerified: user.emailVerified,
        };
      },
    }),
    ...(googleConfigured
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
          }),
        ]
      : []),
  ],
  callbacks: {
    /**
     * Role switching without re-authentication.
     *
     * The dashboard switcher calls `useSession().update({ activeRole })`; the
     * `update` trigger lands here. Only a tier the account actually holds may
     * become active — an attacker-supplied role is ignored — so the switcher
     * can never escalate privileges, it only chooses between rights the
     * database already granted.
     */
    async jwt({ token, user, account, trigger, session }) {
      if (trigger === "update") {
        const requested = (session as { activeRole?: Role } | undefined)
          ?.activeRole;
        const owned = (token.roles as Role[] | undefined) ?? [];
        if (requested && owned.includes(requested)) {
          token.activeRole = requested;
        } else if (requested === PLATFORM_ADMIN_ROLE && token.role === PLATFORM_ADMIN_ROLE) {
          token.activeRole = PLATFORM_ADMIN_ROLE;
        }
        return token;
      }

      if (user?.email) {
        if (account?.provider === "google") {
          // Mirror (or link) the Google identity into Prisma so the portal
          // guards and the database-backed dashboards always have a real user
          // row. Google has already proven ownership of the address, so an
          // existing unverified credential account is upgraded instead of
          // being locked out of its own portal.
          const email = user.email.toLowerCase();
          const existing = await prisma.user.findUnique({
            where: { email },
            select: { id: true, role: true, roles: true, emailVerified: true },
          });

          const dbUser = existing
            ? await prisma.user.update({
                where: { email },
                data: {
                  fullName: user.name ?? undefined,
                  emailVerified: existing.emailVerified ?? new Date(),
                },
                select: { id: true, role: true, roles: true, emailVerified: true },
              })
            : await prisma.user.create({
                data: {
                  email,
                  fullName: user.name ?? email,
                  // Google accounts authenticate through OAuth; the empty hash
                  // can never satisfy bcrypt.compare, so credentials stays
                  // closed. Default role is PARENT.
                  passwordHash: "",
                  role: "PARENT",
                  emailVerified: new Date(),
                },
                select: { id: true, role: true, roles: true, emailVerified: true },
              });

          token.id = dbUser.id;
          token.role = dbUser.role;
          token.roles = await sessionTiers(dbUser.id, dbUser.role, dbUser.roles);
          token.activeRole = dbUser.role;
          token.emailVerified = Boolean(dbUser.emailVerified);
        } else {
          const primary = (user as { role: Role }).role;
          const tiers = effectiveRoles(
            primary,
            (user as { roles?: Role[] }).roles ?? []
          );
          token.id = user.id;
          token.role = primary;
          token.roles = tiers;
          // A fresh sign-in always starts on the account's primary portal.
          token.activeRole = primary;
          token.emailVerified = Boolean(
            (user as { emailVerified?: Date | null }).emailVerified
          );
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const primary = (token.role as Role) ?? "PARENT";
        const tiers = effectiveRoles(
          primary,
          token.roles as Role[] | undefined
        );
        session.user.id = (token.id as string) ?? token.sub ?? "";
        session.user.role = primary;
        session.user.roles = tiers;
        session.user.activeRole =
          (token.activeRole as Role | undefined) ?? primary;
        session.user.emailVerified = Boolean(token.emailVerified);
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
