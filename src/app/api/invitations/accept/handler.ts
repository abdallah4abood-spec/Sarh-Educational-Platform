import { NextResponse } from "next/server";
import { z } from "zod";

import {
  acceptStaffInvitation,
  StaffInvitationError,
} from "@/lib/db/staff-invitations";
import {
  CROSS_ORIGIN_STATUS,
  crossOriginRejection,
  isSameOriginRequest,
} from "@/lib/http/same-origin";
import { checkRateLimit, clearFailures, recordFailure } from "@/lib/rate-limit";
import { invitationFailure } from "@/lib/staff-invitation-http";

/**
 * POST /api/invitations/accept — the invitee turns a token into a membership.
 *
 * The body carries the token and nothing else. The role, the centre and the
 * display title all come from the invitation row; the account's email and
 * verification state are read from the live `User` row inside the service, so a
 * stale JWT can neither substitute its claims nor claim an unverified address.
 *
 * Rate limited per account: a token is 256 bits, but a throttle still blunts
 * scripted guessing and accidental retry loops. The limiter is in-process only
 * (see `src/lib/rate-limit.ts`) — it is not a distributed security boundary.
 */

const bodySchema = z.object({
  token: z.string().trim().min(32).max(128),
});

const COUNTED_FAILURES = new Set(["INVALID_TOKEN", "INVITATION_NOT_FOUND"]);

export async function acceptInvitationResponse(
  userId: string,
  request: Request
): Promise<NextResponse> {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(crossOriginRejection(), {
      status: CROSS_ORIGIN_STATUS,
    });
  }

  const limitKey = `staff-invitation:accept:${userId}`;
  const limit = checkRateLimit(limitKey);
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

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    recordFailure(limitKey);
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_TOKEN",
        message: "رابط الدعوة غير صالح",
      },
      { status: 400 }
    );
  }

  try {
    const accepted = await acceptStaffInvitation(userId, parsed.data.token);
    clearFailures(limitKey);
    return NextResponse.json({ success: true, accepted });
  } catch (error) {
    if (error instanceof StaffInvitationError && COUNTED_FAILURES.has(error.code)) {
      recordFailure(limitKey);
    }
    return invitationFailure(error, "invitations/accept");
  }
}
