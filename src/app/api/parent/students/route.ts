import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import {
  createParentStudent,
  ParentStudentForbiddenError,
} from "@/lib/db/parent-students";

/**
 * POST /api/parent/students — register a child on the signed-in parent's
 * account.
 *
 * `parentId` is taken from the session and never from the request body, so a
 * crafted payload cannot attach a student to someone else's family.
 * `middleware.ts` guards `/api/parent/**` for the PARENT / SUPER_ADMIN tiers;
 * the service re-checks the **live** account (PARENT tier + verified email)
 * as defence in depth.
 *
 * The child is created together with an APPROVED, primary `StudentGuardian`
 * link for the same account, in one transaction. Parent-portal reads
 * authorise against that table only, so without it the child would be
 * invisible — this keeps the existing path working end to end without adding
 * any new linking UI.
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
  if (!session?.user?.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = childSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const student = await createParentStudent(session.user.id, {
      fullName: parsed.data.fullName,
      dateOfBirth: parsed.data.dateOfBirth
        ? new Date(`${parsed.data.dateOfBirth}T00:00:00`)
        : null,
    });

    // Only after the transaction committed.
    return NextResponse.json({ ok: true, student }, { status: 201 });
  } catch (error) {
    if (error instanceof ParentStudentForbiddenError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    console.error("[parent/students] create failed:", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}
