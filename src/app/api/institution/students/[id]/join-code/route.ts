import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

import {
  getJoinCodeStatusResponse,
  issueJoinCodeResponse,
  revokeJoinCodeResponse,
} from "./handler";

/**
 * GET    /api/institution/students/[id]/join-code — is a code live? (no value)
 * POST   /api/institution/students/[id]/join-code — issue a guardian code
 * DELETE /api/institution/students/[id]/join-code — expire the current code
 *
 * `middleware.ts` decides who may reach `/api/institution/**` at all; the real
 * authorisation (ownership or an ACTIVE CENTER_ADMIN membership of the student's
 * centre) is resolved from the database inside the handler.
 */

interface RouteContext {
  params: { id: string };
}

export async function GET(request: Request, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, code: "UNAUTHORIZED", message: "يجب تسجيل الدخول" },
      { status: 401 }
    );
  }
  return getJoinCodeStatusResponse(session.user.id, params.id, request);
}

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, code: "UNAUTHORIZED", message: "يجب تسجيل الدخول" },
      { status: 401 }
    );
  }
  return issueJoinCodeResponse(session.user.id, params.id, request);
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, code: "UNAUTHORIZED", message: "يجب تسجيل الدخول" },
      { status: 401 }
    );
  }
  return revokeJoinCodeResponse(session.user.id, params.id, request);
}
