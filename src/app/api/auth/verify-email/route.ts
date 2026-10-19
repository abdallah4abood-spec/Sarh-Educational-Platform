import { NextResponse } from "next/server";

import { consumeVerificationToken } from "@/lib/verification";

/**
 * GET /api/auth/verify-email?token=…
 *
 * The link sent by `sendVerificationEmail`. It is a top-level browser
 * navigation, so the answer is always a redirect back into the UI:
 *
 *   /auth/signin?verified=1     → emailVerified stamped, user may sign in
 *   /auth/signin?verify=expired → token found but past its 24h window
 *   /auth/signin?verify=invalid → unknown token (or no token at all)
 *   /auth/signin?verify=error   → the database was unreachable
 *
 * A redirect (rather than JSON) keeps the flow usable from a mail client on a
 * phone, and never leaks whether an address is registered.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";

  if (!token) {
    return NextResponse.redirect(
      new URL("/auth/signin?verify=invalid", request.url)
    );
  }

  const outcome = await consumeVerificationToken(token);

  if (outcome.ok) {
    return NextResponse.redirect(
      new URL("/auth/signin?verified=1", request.url)
    );
  }

  const code =
    outcome.reason === "EXPIRED"
      ? "expired"
      : outcome.reason === "DB_UNAVAILABLE"
        ? "error"
        : "invalid";

  return NextResponse.redirect(
    new URL(`/auth/signin?verify=${code}`, request.url)
  );
}
