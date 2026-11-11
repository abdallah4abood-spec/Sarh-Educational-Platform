import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

import {
  resendAdminInvitationResponse,
  revokeAdminInvitationResponse,
} from "../handler";

/**
 * POST   /api/admin/institutions/[id]/staff/[invitationId] — resend
 * DELETE /api/admin/institutions/[id]/staff/[invitationId] — revoke
 *
 * The handler answers 404 unless the invitation belongs to `params.id`.
 */

interface RouteContext {
  params: { id: string; invitationId: string };
}

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  return resendAdminInvitationResponse(session, params.id, params.invitationId, request);
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  return revokeAdminInvitationResponse(session, params.id, params.invitationId, request);
}
