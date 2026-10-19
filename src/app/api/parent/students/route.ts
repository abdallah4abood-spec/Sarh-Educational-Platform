import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/parent/students — register a child on the signed-in parent's
 * account.
 *
 * `parentId` is taken from the session and never from the request body, so a
 * crafted payload cannot attach a student to someone else's family.
 * `middleware.ts` guards `/api/parent/**` for the PARENT / SUPER_ADMIN tiers;
 * the handler re-checks the session as defence in depth.
 */
const childSchema = z.object({
  fullName: z.string().trim().min(2, "الاسم قصير جداً").max(120),
  /** Optional ISO date (YYYY-MM-DD); defaults to a school-age placeholder. */
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح")
    .optional(),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const roles = session?.user?.roles ?? [];
  if (!session?.user || !roles.includes("PARENT")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = childSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const fallbackBirth = new Date();
  fallbackBirth.setFullYear(fallbackBirth.getFullYear() - 8);

  const student = await prisma.student.create({
    data: {
      fullName: parsed.data.fullName,
      parentId: session.user.id,
      dateOfBirth: parsed.data.dateOfBirth
        ? new Date(`${parsed.data.dateOfBirth}T00:00:00`)
        : fallbackBirth,
    },
    select: { id: true, fullName: true },
  });

  return NextResponse.json({ ok: true, student }, { status: 201 });
}
