import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/admin/institutions/:id/trust — verify or reject one centre.
 *
 * This is the single write behind both the `/admin/trust` queue and the
 * Financial Centre's approval table, so the two screens cannot disagree:
 * approving here is what flips an institution to VERIFIED in the public
 * directory, and rejecting stamps the reviewer's note the centre sees in its
 * own profile checklist.
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
  const roles = session?.user?.roles ?? [];
  if (!session?.user || !roles.includes("SUPER_ADMIN")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const institution = await prisma.institution.update({
      where: { id: params.id },
      data: {
        trustStatus: parsed.data.status,
        trustNote: parsed.data.note ?? null,
      },
      select: { id: true, trustStatus: true },
    });
    return NextResponse.json({ ok: true, institution });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
