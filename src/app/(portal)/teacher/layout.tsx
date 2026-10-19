import type { ReactNode } from "react";

import { PortalShell } from "@/components/portal/portal-shell";

/**
 * Teacher portal layout (Pillar 2 — teacher tier).
 *
 * Everything under `/teacher` is execution work: today's timetable, my
 * classes, attendance, lesson planning and the AI teaching tools. Oversight
 * lives under `/supervisor`, center administration under `/institution`, and
 * the two never share a screen — they share this shell instead.
 *
 * Guarded by `middleware.ts` and by `<PortalShell/>` (TEACHER tier, or the
 * platform admin inspecting the portal).
 */
export default function TeacherPortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <PortalShell portalId="teacher">{children}</PortalShell>;
}
