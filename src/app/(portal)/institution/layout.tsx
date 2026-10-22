import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { PortalShell } from "@/components/portal/portal-shell";
import { authOptions } from "@/lib/auth";
import { resolveInstitutionAccess } from "@/lib/institution-access";

/**
 * Institution portal layout (Pillar 4 — multi-tenant center administration).
 *
 * This tier manages one center: its staff, its classes, its enrollments and
 * commission status, its public directory profile and the teacher studio its
 * staff work in. It deliberately has no access to platform finance, to the
 * trust & verification queue or to other centers' data — those are
 * `/admin` concerns, and `src/lib/roles.ts` is what enforces the split.
 *
 * Guarded by `middleware.ts` for the portal tier, then by this server gate for
 * the tenant grant. The middleware can only see the JWT tier; it cannot read
 * PostgreSQL from the Edge. A teacher or secretary who somehow holds the
 * `INSTITUTION_TEACHER` tier therefore lands here with no membership grant,
 * and is sent back to the portal their account actually owns instead of being
 * shown an empty administration shell.
 *
 * `SUPER_ADMIN` keeps the platform-wide inspection access documented in
 * `roles.ts`; individual pages still require a tenant token before loading any
 * centre row.
 */
export default async function InstitutionPortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const roles = session?.user?.roles ?? [];

  if (!userId) {
    redirect("/auth/signin?callbackUrl=/institution");
  }

  const access = await resolveInstitutionAccess(userId);
  if (!access && !roles.includes("SUPER_ADMIN")) {
    const fallback = roles.includes("TEACHER")
      ? "/teacher"
      : roles.includes("SUPERVISOR")
        ? "/supervisor"
        : roles.includes("PARENT")
          ? "/parent"
          : "/";
    redirect(fallback);
  }

  return <PortalShell portalId="institution">{children}</PortalShell>;
}
