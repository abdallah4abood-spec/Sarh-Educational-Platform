import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { requireLiveSuperAdmin } from "@/lib/admin-access";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/admin/transactions/:id — approve or reject one receipt.
 *
 * The Financial Centre's reconciler calls this when a reviewer confirms OCR
 * output. `middleware.ts` already guards `/api/admin/**`, but the handler
 * re-checks the session so the write is defended even if the route is ever
 * reached through another matcher.
 *
 * The update is intentionally narrow: only `status`, `reviewNote` and
 * `reviewedAt` move. Amounts and OCR data are evidence — a review decides on
 * them, it never rewrites them.
 */
const reviewSchema = z.object({
  status: z.enum(["VERIFIED", "REJECTED"]),
  note: z.string().trim().max(500).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const denied = await requireLiveSuperAdmin(session);
  if (denied) return denied;

  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const transaction = await prisma.paymentTransaction.update({
      where: { id: params.id },
      data: {
        status: parsed.data.status,
        reviewNote: parsed.data.note ?? null,
        reviewedAt: new Date(),
      },
      select: { id: true, status: true },
    });
    return NextResponse.json({ ok: true, transaction });
  } catch {
    // A missing row is the only expected failure here (deleted or bad id).
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
