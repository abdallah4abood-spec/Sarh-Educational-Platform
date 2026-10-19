import type { ReactNode } from "react";

import { PortalShell } from "@/components/portal/portal-shell";
import { ParentAssistant } from "@/components/parent/parent-assistant";

/**
 * Parent portal layout.
 *
 * Mounts the shared dashboard shell (Pillar 2 — one visual identity for every
 * tier) and, inside it, the one thing that has to exist on every parent
 * screen: the AI assistant, which answers questions about timings, activities,
 * fees and pickup policy.
 *
 * Access is gated twice: `middleware.ts` in front of the route and
 * `<PortalShell/>` in front of the render (PARENT tier + verified email).
 */
export default function ParentPortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <PortalShell portalId="parent">
      {children}
      <ParentAssistant />
    </PortalShell>
  );
}
