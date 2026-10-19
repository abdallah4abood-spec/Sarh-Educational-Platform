import type { ReactNode } from "react";

import { PortalShell } from "@/components/portal/portal-shell";

/**
 * Supervisor portal layout (Pillar 2 — functional segregation).
 *
 * The supervisor tier reviews and approves; it does not execute. So this
 * portal owns plan review, performance evaluation and the teachers in the
 * supervisor's scope — the read/approve side of the same records a teacher
 * writes under `/teacher`. Keeping them apart is the point: a teacher cannot
 * approve their own plan, and a supervisor cannot edit a lesson record they
 * are auditing.
 *
 * Guarded by `middleware.ts` and by `<PortalShell/>` (SUPERVISOR tier).
 */
export default function SupervisorPortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <PortalShell portalId="supervisor">{children}</PortalShell>;
}
