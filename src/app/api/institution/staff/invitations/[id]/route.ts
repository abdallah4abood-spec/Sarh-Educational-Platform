import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

import { resendInvitationResponse, revokeInvitationResponse } from "./handler";

/**
 * POST   /api/institution/staff/invitations/[id] — resend
 * DELETE /api/institution/staff/invitations/[id] — revoke
 */

interface RouteContext {
  params: { id: string };
}

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, code: "UNAUTHORIZED", message: "يجب تسجيل الدخول" },
      { status: 401 }
    );
  }
  return resendInvitationResponse({
    userId: session.user.id,
    invitationId: params.id,
    request,
  });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, code: "UNAUTHORIZED", message: "يجب تسجيل الدخول" },
      { status: 401 }
    );
  }
  return revokeInvitationResponse({
    userId: session.user.id,
    invitationId: params.id,
    request,
  });
}
