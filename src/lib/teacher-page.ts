import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { requestedInstitutionId } from "@/lib/institution-access";
import { resolveTeacherScope, type TeacherScopeResult } from "@/lib/teacher-access";

export interface TeacherPageContext {
  state: TeacherScopeResult;
  /** First word of the account name, for the portal greeting. */
  firstName: string;
}

/**
 * Page-level teacher gate (decision D5).
 *
 * Every `/teacher/**` page calls this **before** any loader, so no teacher row
 * is read until an ACTIVE membership and one institution have been validated
 * from PostgreSQL. Layouts and pages can render concurrently, which is why the
 * layout alone is not enough.
 *
 * `?institution=<id>` is the explicit selector (same convention as
 * `/institution/**`). Without it, a multi-centre teacher gets `ambiguous` and
 * therefore no data.
 *
 * The session is read once here. `callbacks.jwt` now queries PostgreSQL on
 * every session read, so pages must not call `getServerSession` a second time
 * just to get the account name.
 *
 * The `/teacher/settings` page is not gated: it renders the shared account
 * panel from the session and reads no teacher data.
 */
export async function loadTeacherPageScope(
  searchParams?: Record<string, string | string[] | undefined> | null
): Promise<TeacherPageContext> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/auth/signin?callbackUrl=/teacher");
  }

  const state = await resolveTeacherScope(
    session.user.id,
    requestedInstitutionId(searchParams)
  );

  return {
    state,
    firstName: (session.user.name ?? "أستاذنا").split(" ")[0],
  };
}
