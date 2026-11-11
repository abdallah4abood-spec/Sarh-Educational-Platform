import { NextResponse } from "next/server";
import { z } from "zod";

import { requireLiveSuperAdmin, type AdminSessionLike } from "@/lib/admin-access";
import {
  createStaffInvitation,
  listStaffInvitations,
  resendStaffInvitation,
  revokeStaffInvitation,
  superAdminInvitationActor,
} from "@/lib/db/staff-invitations";
import { sendStaffInvitationEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/lib/config/site";
import {
  CROSS_ORIGIN_STATUS,
  crossOriginRejection,
  isSameOriginRequest,
} from "@/lib/http/same-origin";
import { STAFF_ROLE_LABEL, invitationAcceptPath } from "@/lib/staff-invitations";
import { invitationFailure } from "@/lib/staff-invitation-http";

/**
 * D6 — the SUPER_ADMIN screen for managing CENTER_ADMIN invitations.
 *
 * One invitation role exists here and only one: `CENTER_ADMIN`. The role is not
 * a field of the request at all — the body schema has no `role`, and the service
 * is called with the constant below. A client that posts `role: "OWNER"` or any
 * other value has simply sent an unknown key.
 *
 * Every handler re-checks `SUPER_ADMIN` from the database (`requireLiveSuperAdmin`),
 * and every read/write is scoped to `params.id`, so an invitation id from
 * another centre answers 404 rather than being acted on.
 */

const createSchema = z.object({
  email: z.string().trim().min(3).max(190),
  title: z.string().trim().max(120).optional(),
});

const ONLY_INVITABLE_ROLE = "CENTER_ADMIN" as const;

function notFoundInstitution() {
  return NextResponse.json(
    { success: false, code: "INSTITUTION_NOT_FOUND", message: "المؤسسة غير موجودة" },
    { status: 404 }
  );
}

async function institutionExists(institutionId: string): Promise<boolean> {
  const row = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { id: true },
  });
  return Boolean(row);
}

export async function listAdminInvitationsResponse(
  session: AdminSessionLike | null | undefined,
  institutionId: string
): Promise<NextResponse> {
  const denied = await requireLiveSuperAdmin(session);
  if (denied) return denied;
  if (!(await institutionExists(institutionId))) return notFoundInstitution();

  const actor = superAdminInvitationActor(session!.user!.id!, institutionId);
  const invitations = await listStaffInvitations(actor);
  return NextResponse.json({ success: true, invitations });
}

export async function createAdminInvitationResponse(
  session: AdminSessionLike | null | undefined,
  institutionId: string,
  request: Request
): Promise<NextResponse> {
  const denied = await requireLiveSuperAdmin(session);
  if (denied) return denied;
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(crossOriginRejection(), {
      status: CROSS_ORIGIN_STATUS,
    });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
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
  if (!(await institutionExists(institutionId))) return notFoundInstitution();

  const actor = superAdminInvitationActor(session!.user!.id!, institutionId);

  try {
    const { invitation, token } = await createStaffInvitation(actor, {
      email: parsed.data.email,
      role: ONLY_INVITABLE_ROLE,
      title: parsed.data.title,
    });

    const institution = await prisma.institution.findUnique({
      where: { id: institutionId },
      select: { name: true },
    });
    const sent = await sendStaffInvitationEmail({
      to: invitation.email,
      institutionName: institution?.name ?? "المركز",
      roleLabel: STAFF_ROLE_LABEL[ONLY_INVITABLE_ROLE],
      acceptUrl: `${siteConfig.appUrl.replace(/\/+$/, "")}${invitationAcceptPath(token)}`,
      expiresAt: new Date(invitation.expiresAt),
    });

    return NextResponse.json(
      {
        success: true,
        invitation,
        emailSent: sent.sent,
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
    return invitationFailure(error, "admin/institutions/staff");
  }
}

export async function resendAdminInvitationResponse(
  session: AdminSessionLike | null | undefined,
  institutionId: string,
  invitationId: string,
  request: Request
): Promise<NextResponse> {
  const denied = await requireLiveSuperAdmin(session);
  if (denied) return denied;
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(crossOriginRejection(), {
      status: CROSS_ORIGIN_STATUS,
    });
  }

  const actor = superAdminInvitationActor(session!.user!.id!, institutionId);

  try {
    const { invitation, token } = await resendStaffInvitation(actor, invitationId);
    const institution = await prisma.institution.findUnique({
      where: { id: institutionId },
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
    return invitationFailure(error, "admin/institutions/staff/resend");
  }
}

export async function revokeAdminInvitationResponse(
  session: AdminSessionLike | null | undefined,
  institutionId: string,
  invitationId: string,
  request: Request
): Promise<NextResponse> {
  const denied = await requireLiveSuperAdmin(session);
  if (denied) return denied;
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(crossOriginRejection(), {
      status: CROSS_ORIGIN_STATUS,
    });
  }

  const actor = superAdminInvitationActor(session!.user!.id!, institutionId);

  try {
    const invitation = await revokeStaffInvitation(actor, invitationId);
    return NextResponse.json({ success: true, invitation });
  } catch (error) {
    return invitationFailure(error, "admin/institutions/staff/revoke");
  }
}
