import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

import { redeemJoinCodeResponse } from "./handler";

/**
 * POST /api/parent/guardians/redeem — consume an institution's join code.
 *
 * `middleware.ts` guards `/api/parent/**` for the PARENT tier; the service then
 * re-checks the live account (PARENT tier, verified email) and the code itself.
 * A redemption never grants access through `Student.parentId`.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, code: "UNAUTHORIZED", message: "يجب تسجيل الدخول" },
      { status: 401 }
    );
  }
  return redeemJoinCodeResponse(session.user.id, request);
}
