import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

import {
  createAdminInvitationResponse,
  listAdminInvitationsResponse,
} from "./handler";

/**
 * GET  /api/admin/institutions/[id]/staff — CENTER_ADMIN invitations of one centre
 * POST /api/admin/institutions/[id]/staff — invite a CENTER_ADMIN
 *
 * Scope is the single institution in `params.id`; the role is fixed server-side
 * to `CENTER_ADMIN`, so this route can never manage another role or another
 * centre's staff.
 */

interface RouteContext {
  params: { id: string };
}

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  return listAdminInvitationsResponse(session, params.id);
}

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  return createAdminInvitationResponse(session, params.id, request);
}
