import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { hasLiveSuperAdmin } from "@/lib/admin-access";
import { authOptions } from "@/lib/auth";

/**
 * Server-page gate for `/admin/**`.
 *
 * The layout uses this too, but every admin page calls it before its loaders:
 * App Router layouts and pages can render concurrently, so a layout redirect
 * alone is not a strong enough reason to start reading platform finance or
 * user data for a demoted account.
 */
export async function requireAdminPage(): Promise<void> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/auth/signin?callbackUrl=/admin");
  }

  if (!(await hasLiveSuperAdmin(session.user))) {
    // ROLE_HOME[activeRole] may still say /admin in a stale token; go public.
    redirect("/");
  }
}
