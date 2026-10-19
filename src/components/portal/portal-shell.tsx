import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { PortalChrome } from "@/components/portal/portal-chrome";
import { authOptions } from "@/lib/auth";
import {
  ROLE_HOME,
  canEnterPortal,
  effectiveRoles,
  portalById,
  type PortalId,
} from "@/lib/roles";

/**
 * Server half of the dashboard shell — one call per portal layout.
 *
 * The middleware already refuses a request to a portal the session cannot
 * enter, but that gate lives in front of the *route*; this one lives in front
 * of the *render*, which is what protects the data a layout loads for its
 * children. Both read the same registry (`src/lib/roles.ts`), so they cannot
 * disagree.
 *
 * It also settles the identity the chrome shows: name, email and tier set come
 * from the session, never from a client prop, so the topbar cannot be tricked
 * into displaying another account.
 */
export async function PortalShell({
  portalId,
  children,
}: {
  portalId: PortalId;
  children: ReactNode;
}) {
  const portal = portalById(portalId);
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(portal.home)}`);
  }

  const roles = effectiveRoles(session.user.role, session.user.roles);

  if (!session.user.emailVerified) {
    redirect(
      `/auth/signin?unverified=1&email=${encodeURIComponent(session.user.email ?? "")}`
    );
  }

  if (!canEnterPortal(portal, roles)) {
    const fallback = session.user.activeRole
      ? ROLE_HOME[session.user.activeRole]
      : portal.home;
    redirect(fallback);
  }

  return (
    <PortalChrome
      portalId={portalId}
      user={{
        name: session.user.name ?? session.user.email ?? portal.caption,
        email: session.user.email ?? "",
        role: session.user.activeRole ?? session.user.role,
      }}
    >
      {children}
    </PortalChrome>
  );
}
