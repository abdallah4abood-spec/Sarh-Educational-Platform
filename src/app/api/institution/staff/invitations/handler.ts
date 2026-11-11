import { NextResponse } from "next/server";

import {
  createStaffInvitation,
  listStaffInvitations,
  StaffInvitationError,
  type InvitationActor,
} from "@/lib/db/staff-invitations";
import { sendStaffInvitationEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/lib/config/site";
import { checkRateLimit, recordFailure } from "@/lib/rate-limit";
import {
  isSameOriginRequest,
  crossOriginRejection,
  CROSS_ORIGIN_STATUS,
} from "@/lib/http/same-origin";
import { invitationAcceptPath } from "@/lib/staff-invitations";
import {
  bodySelector,
  invitationBodySchema,
  invitationFailure,
  resolveInvitationActor,
} from "@/lib/staff-invitation-http";

/**
 * GET  /api/institution/staff/invitations — this centre's invitations
 * POST /api/institution/staff/invitations — invite TEACHER / SECRETARY / (owner only) CENTER_ADMIN
 *
 * Split from `route.ts` because a Next.js route module may only export handlers,
 * and because these status codes must be testable without a NextAuth cookie.
 *
 * `?institution=` / body `institutionId` is a selector over the caller's real
 * grants. The invite *role* is validated against the inviter's kind in the
 * service, so a CENTER_ADMIN cannot appoint another CENTER_ADMIN even by
 * posting the value directly.
 */

export async function listInvitationsResponse(
  userId: string,
  request: Request
): Promise<NextResponse> {
  const actor = await resolveInvitationActor(
    userId,
    new URL(request.url).searchParams.get("institution")
  );
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

  const invitations = await listStaffInvitations(actor);
  return NextResponse.json({ success: true, invitations });
}

export async function createInvitationResponse(
  userId: string,
  request: Request
): Promise<NextResponse> {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(crossOriginRejection(), {
      status: CROSS_ORIGIN_STATUS,
    });
  }

  const parsed = invitationBodySchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_BODY",
        message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة",
      },
      { status: 400 }
    );
  }

  const actor: InvitationActor | null = await resolveInvitationActor(
    userId,
    bodySelector(request, parsed.data)
  );
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

  const limit = checkRateLimit(`staff-invitation:create:${actor.userId}`);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        success: false,
        code: "RATE_LIMITED",
        message: "محاولات كثيرة — أعد المحاولة بعد قليل",
      },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const { invitation, token } = await createStaffInvitation(actor, {
      email: parsed.data.email,
      role: parsed.data.role,
      title: parsed.data.title,
      subjects: parsed.data.subjects,
    });

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

    // The inviter is told the truth: an unconfigured or failing provider is a
    // 201 with `emailSent: false`, never a fake "sent".
    return NextResponse.json(
      {
        success: true,
        invitation,
        emailSent: sent.sent,
        // When the provider is unavailable the inviter gets the link itself, so
        // the invitation is not silently stranded. It is never returned when a
        // message did go out: one copy of the secret is enough.
        ...(sent.sent
          ? {}
          : {
              emailFailure: sent.code ?? "PROVIDER_ERROR",
              acceptPath: invitationAcceptPath(token),
            }),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof StaffInvitationError && error.code === "INVALID_EMAIL") {
      recordFailure(`staff-invitation:create:${actor.userId}`);
    }
    return invitationFailure(error, "institution/staff/invitations");
  }
}
