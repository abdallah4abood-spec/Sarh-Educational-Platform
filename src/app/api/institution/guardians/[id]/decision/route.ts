import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

import { decideGuardianLinkResponse } from "./handler";

/**
 * POST /api/institution/guardians/[id]/decision — approve or reject one
 * pending guardianship request.
 *
 * `middleware.ts` only decides who may reach `/api/institution/**`; the real
 * authorisation (ownership or an ACTIVE CENTER_ADMIN membership, the student's
 * enrollment in that centre, and the request's origin) is resolved from the
 * database inside the handler.
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
  return decideGuardianLinkResponse(session.user.id, params.id, request);
}
