import type { ReactNode } from "react";

import { PortalShell } from "@/components/portal/portal-shell";

/**
 * Institution portal layout (Pillar 4 — multi-tenant center administration).
 *
 * This tier manages one center: its staff, its classes, its enrollments and
 * commission status, its public directory profile and the teacher studio its
 * staff work in. It deliberately has no access to platform finance, to the
 * trust & verification queue or to other centers' data — those are
 * `/admin` concerns, and `src/lib/roles.ts` is what enforces the split.
 *
 * Guarded by `middleware.ts` and by `<PortalShell/>` (INSTITUTION_TEACHER).
 */
export default function InstitutionPortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <PortalShell portalId="institution">{children}</PortalShell>;
}
