import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

import { createStudentResponse } from "./handler";

/**
 * POST /api/institution/students — create a student and their enrollment
 * inside the signed-in account's centre.
 *
 * The middleware's portal check is not the authorisation here; it only decides
 * who may reach the route at all. The database-backed tenant check, the
 * duplicate rule and the atomic write live in `createInstitutionStudent`; the
 * body/HTTP mapping lives in `./handler` so it can be tested directly.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, code: "UNAUTHORIZED", message: "يجب تسجيل الدخول" },
      { status: 401 }
    );
  }
  return createStudentResponse(session.user.id, request);
}
