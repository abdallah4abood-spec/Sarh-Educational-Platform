import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

import { acceptInvitationResponse } from "./handler";

/**
 * POST /api/invitations/accept
 *
 * Public path on purpose: an invited PARENT/TEACHER has no institution portal
 * yet, so the route cannot sit behind a portal guard. A session is still
 * required — acceptance is always performed by the signed-in account whose
 * stored, verified email must match the invitation.
 */

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, code: "UNAUTHORIZED", message: "يجب تسجيل الدخول" },
      { status: 401 }
    );
  }
  return acceptInvitationResponse(session.user.id, request);
}
