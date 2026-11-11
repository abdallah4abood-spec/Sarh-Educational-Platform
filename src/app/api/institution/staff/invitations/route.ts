import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

import { createInvitationResponse, listInvitationsResponse } from "./handler";

/**
 * GET  /api/institution/staff/invitations
 * POST /api/institution/staff/invitations
 *
 * `middleware.ts` decides who may reach `/api/institution/**` at all; the real
 * authorisation (ownership or an ACTIVE CENTER_ADMIN membership) is resolved
 * from the database inside the handler.
 */

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, code: "UNAUTHORIZED", message: "يجب تسجيل الدخول" },
      { status: 401 }
    );
  }
  return listInvitationsResponse(session.user.id, request);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, code: "UNAUTHORIZED", message: "يجب تسجيل الدخول" },
      { status: 401 }
    );
  }
  return createInvitationResponse(session.user.id, request);
}
