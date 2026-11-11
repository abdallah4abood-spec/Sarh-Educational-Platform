import type { NextAuthOptions } from "next-auth";
import type { Role } from "@prisma/client";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { findUserByIdentifier } from "@/lib/identifier";
import { prisma } from "@/lib/prisma";
import { isPhoneNumber, looksLikeEmail } from "@/lib/phone";
import { ROLE_HOME, effectiveRoles } from "@/lib/roles";
import { loadLiveTiers } from "@/lib/session-tiers";

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
        //
        // Live tiers (decision D5) are what the sign-in route routes on, so a
        // membership-based tier is already present on the very first request.
        // `callbacks.jwt` re-derives them again from the same source, which
        // keeps the cookie correct after revocation.
        const live = await loadLiveTiers(user.id);

        return {
          id: user.id,
          name: user.fullName,
          email: user.email,
          role:
            live.kind === "ok" ? live.tiers.role : (user.role as Role),
          roles:
            live.kind === "ok"
              ? live.tiers.roles
              : effectiveRoles(user.role as Role, user.roles as Role[]),
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
     * Tier maintenance and role switching without re-authentication.
     *
     * NextAuth calls this on every session read (no `trigger`) and on
     * `useSession().update()` (`trigger: "update"`), so this is the one place
     * the token's tier set is rebuilt — see `src/lib/session-tiers.ts` for the
     * rules and the fail-closed behaviour (decision D5).
     *
     * The rebuild is driven by the account id only. Nothing the client sends
     * can add a tier: `session.activeRole` merely selects among tiers the
     * database already granted, and is ignored otherwise.
     */
    async jwt({ token, user, account, trigger, session }) {
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
          token.roles = effectiveRoles(dbUser.role, dbUser.roles);
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

      const userId = (token.id as string | undefined) ?? token.sub;

      if (userId) {
        const live = await loadLiveTiers(userId);

        if (live.kind === "ok") {
          // The database row wins over anything the cookie still claims. A
          // revoked membership therefore stops contributing its tier on the
          // next request; data access is denied immediately regardless (see
          // `resolveTeacherScope`).
          token.role = live.tiers.role;
          token.roles = live.tiers.roles;
        } else if (live.kind === "unknown-user") {
          // The account is gone: it holds no tier, whatever the cookie says.
          token.roles = [];
        }
        // `unavailable`: keep the existing claims and add nothing. A failed
        // lookup is never evidence of authority, and every data loader
        // re-checks the database on its own.
      }

      /*
       * Tier selection. `token.roles` is now the live set whenever an account
       * row was available, and the cookie's own claims otherwise (a token
       * without an identity cannot be re-verified, and the portal gates still
       * read `roles`). Either way, a requested tier is only honoured if it is
       * already held — the client can never add one, it can only switch to a
       * tier the database granted.
       */
      const tiers = (token.roles as Role[] | undefined) ?? [];

      if (trigger === "update") {
        const requested = (session as { activeRole?: Role } | undefined)
          ?.activeRole;
        if (requested && tiers.includes(requested)) {
          token.activeRole = requested;
        }
      }

      // Never leave the token pointing at a tier it no longer holds.
      const primary = (token.role as Role | undefined) ?? "PARENT";
      const active = token.activeRole as Role | undefined;
      if (!active || !tiers.includes(active)) {
        token.activeRole = tiers.includes(primary) ? primary : (tiers[0] ?? primary);
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
