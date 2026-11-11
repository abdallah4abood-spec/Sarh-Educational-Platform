import { NextResponse } from "next/server";
import { z } from "zod";

import {
  institutionInvitationActor,
  StaffInvitationError,
  type InvitationActor,
  type StaffInvitationErrorCode,
} from "@/lib/db/staff-invitations";
import {
  InstitutionAccessDeniedError,
  resolveInstitutionAccess,
} from "@/lib/institution-access";

/**
 * Shared HTTP plumbing for the staff-invitation routes.
 *
 * Both the institution roster and the SUPER_ADMIN screen (D6) return the same
 * codes for the same condition, so the two UIs can share one component and one
 * error dictionary. This module only maps errors to statuses — every
 * authorisation decision is taken in the service, from the database.
 */

const ERROR_STATUS: Record<StaffInvitationErrorCode, number> = {
  ROLE_NOT_INVITABLE: 403,
  INVALID_EMAIL: 400,
  INVITATION_NOT_FOUND: 404,
  INVITATION_PENDING: 409,
  INVITATION_ALREADY_ACCEPTED: 409,
  INVITATION_REVOKED: 409,
  INVITATION_EXPIRED: 409,
  INVALID_TOKEN: 400,
  ALREADY_MEMBER: 409,
  MEMBERSHIP_CONFLICT: 409,
  EMAIL_MISMATCH: 403,
  EMAIL_NOT_VERIFIED: 403,
};

/** Status the browser should expect for a service error code. */
export function invitationErrorStatus(code: StaffInvitationErrorCode): number {
  return ERROR_STATUS[code];
}

export function invitationFailure(error: unknown, scope: string): NextResponse {
  if (error instanceof InstitutionAccessDeniedError) {
    return NextResponse.json(
      {
        success: false,
        code: "FORBIDDEN",
        message: "لا تملك صلاحية إدارة الدعوات في هذه المؤسسة",
      },
      { status: 403 }
    );
  }
  if (error instanceof StaffInvitationError) {
    return NextResponse.json(
      { success: false, code: error.code, message: error.message },
      { status: invitationErrorStatus(error.code) }
    );
  }
  console.error(`[${scope}] failed:`, error);
  return NextResponse.json(
    {
      success: false,
      code: "INTERNAL_ERROR",
      message: "تعذّر تنفيذ الطلب — حاول مجدداً",
    },
    { status: 500 }
  );
}

/**
 * Resolve the acting centre for an institution-portal request.
 *
 * `requestedInstitutionId` is a selector, never a grant: a centre the account
 * does not own or administer resolves to `null` and the caller answers 403,
 * exactly like an unknown id. Returns `null` when the account may not invite.
 */
export async function resolveInvitationActor(
  userId: string,
  requestedInstitutionId: string | null | undefined
): Promise<InvitationActor | null> {
  const access = await resolveInstitutionAccess(userId, requestedInstitutionId);
  if (!access) return null;
  try {
    return institutionInvitationActor(access);
  } catch {
    return null;
  }
}

export const subjectsSchema = z
  .array(z.string().trim().min(1).max(60))
  .max(10)
  .optional();

export const invitationBodySchema = z.object({
  /** Optional selector; the server still resolves it against the database. */
  institutionId: z.string().trim().min(1).max(64).optional(),
  email: z.string().trim().min(3).max(190),
  /** Required by the institution UI; the D6 route overwrites it. */
  role: z.enum(["CENTER_ADMIN", "SECRETARY", "TEACHER", "SUPERVISOR", "STAFF"]),
  title: z.string().trim().max(120).optional(),
  subjects: subjectsSchema,
});

export type InvitationBody = z.infer<typeof invitationBodySchema>;

export function bodySelector(request: Request, body?: InvalidationSelector) {
  const fromQuery = new URL(request.url).searchParams.get("institution");
  return fromQuery || body?.institutionId || null;
}

type InvalidationSelector = { institutionId?: string };
