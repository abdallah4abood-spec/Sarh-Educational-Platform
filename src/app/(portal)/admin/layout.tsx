import type { ReactNode } from "react";

import { PortalShell } from "@/components/portal/portal-shell";
import { requireAdminPage } from "@/lib/admin-page";

/**
 * Admin portal layout (Pillar 4 — platform-wide control).
 *
 * The SUPER_ADMIN tier is the only one allowed into every portal, so the shell
 * offers a role switcher here even for an account that holds a single tier:
 * an operator inspecting another tier's dashboard does it through this
 * switcher instead of a second account.
 *
 * Guarded by `middleware.ts` and by `<PortalShell/>` (SUPER_ADMIN only), then
 * by this server gate. The first two can only read the JWT; this one re-reads
 * the current `User` row, so a demoted account cannot keep reading platform
 * finance, users or trust data for the remaining life of a 30-day token.
 */
export default async function AdminPortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminPage();

  return <PortalShell portalId="admin">{children}</PortalShell>;
}
