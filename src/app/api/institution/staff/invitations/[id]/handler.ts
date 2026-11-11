import { NextResponse } from "next/server";

import {
  resendStaffInvitation,
  revokeStaffInvitation,
} from "@/lib/db/staff-invitations";
import { sendStaffInvitationEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/lib/config/site";
import {
  CROSS_ORIGIN_STATUS,
  crossOriginRejection,
  isSameOriginRequest,
} from "@/lib/http/same-origin";
import { invitationAcceptPath } from "@/lib/staff-invitations";
import { invitationFailure, resolveInvitationActor } from "@/lib/staff-invitation-http";

/**
 * POST   /api/institution/staff/invitations/[id] — resend (rotates the token)
 * DELETE /api/institution/staff/invitations/[id] — revoke
 *
 * Resending is a rotation, not a second message with the old link: the stored
 * hash is replaced, so the previous link stops working the moment this
 * succeeds. Revoking a pending invitation keeps the row (and its audit trail)
 * and simply flips its status, so history is never rewritten.
 */

interface HandlerInput {
  userId: string;
  invitationId: string;
  request: Request;
}

async function actorFor({ userId, request }: HandlerInput) {
  return resolveInvitationActor(
    userId,
    new URL(request.url).searchParams.get("institution")
  );
}

export async function resendInvitationResponse({
  userId,
  invitationId,
  request,
}: HandlerInput): Promise<NextResponse> {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(crossOriginRejection(), {
      status: CROSS_ORIGIN_STATUS,
    });
  }

  const actor = await actorFor({ userId, invitationId, request });
  if (!actor) {
    return NextResponse.json(
      {
        success: false,
        code: "FORBIDDEN",
        message: "لا تملك صلاحية إدارة دعوات هذه المؤسسة",
      },
      { status: 403 }
    );
  }

  try {
    const { invitation, token } = await resendStaffInvitation(actor, invitationId);

    const institution = await prisma.institution.findUnique({
      where: { id: actor.institutionId },
      select: { name: true },
    });
    const sent = await sendStaffInvitationEmail({
      to: invitation.email,
      institutionName: institution?.name ?? "المركز",
      roleLabel: invitation.roleLabel,
      acceptUrl: `${siteConfig.appUrl.replace(/\/+$/, "")}${invitationAcceptPath(token)}`,
      expiresAt: new Date(invitation.expiresAt),
    });

    return NextResponse.json({
      success: true,
      invitation,
      emailSent: sent.sent,
      ...(sent.sent
        ? {}
        : {
            emailFailure: sent.code ?? "PROVIDER_ERROR",
            acceptPath: invitationAcceptPath(token),
          }),
    });
  } catch (error) {
    return invitationFailure(error, "institution/staff/invitations/resend");
  }
}

export async function revokeInvitationResponse({
  userId,
  invitationId,
  request,
}: HandlerInput): Promise<NextResponse> {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(crossOriginRejection(), {
      status: CROSS_ORIGIN_STATUS,
    });
  }

  const actor = await actorFor({ userId, invitationId, request });
  if (!actor) {
    return NextResponse.json(
      {
        success: false,
        code: "FORBIDDEN",
        message: "لا تملك صلاحية إدارة دعوات هذه المؤسسة",
      },
      { status: 403 }
    );
  }

  try {
    const invitation = await revokeStaffInvitation(actor, invitationId);
    return NextResponse.json({ success: true, invitation });
  } catch (error) {
    return invitationFailure(error, "institution/staff/invitations/revoke");
  }
}
