import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

import { revokeGuardianGrantResponse } from "./handler";

/**
 * POST /api/institution/guardians/grants/[id]/revoke — withdraw this centre's
 * grant for one guardian. `middleware.ts` only decides who may reach
 * `/api/institution/**`; ownership/membership is resolved from the database in
 * the handler.
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
  return revokeGuardianGrantResponse(session.user.id, params.id, request);
}
