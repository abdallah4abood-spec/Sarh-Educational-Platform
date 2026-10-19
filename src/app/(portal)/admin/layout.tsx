import type { ReactNode } from "react";

import { PortalShell } from "@/components/portal/portal-shell";

/**
 * Admin portal layout (Pillar 4 — platform-wide control).
 *
 * The SUPER_ADMIN tier is the only one allowed into every portal, so the shell
 * offers a role switcher here even for an account that holds a single tier:
 * an operator inspecting another tier's dashboard does it through this
 * switcher instead of a second account.
 *
 * Guarded by `middleware.ts` and by `<PortalShell/>` (SUPER_ADMIN only).
 */
export default function AdminPortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <PortalShell portalId="admin">{children}</PortalShell>;
}
