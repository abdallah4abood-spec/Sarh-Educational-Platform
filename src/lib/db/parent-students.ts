import { resolveGuardianAccess } from "@/lib/guardian-access";
import { prisma } from "@/lib/prisma";

/**
 * Parent-portal child creation.
 *
 * Extracted from `POST /api/parent/students` so the write and its guard are
 * testable without an HTTP request, and so the route stays a thin translator.
 * The behaviour is unchanged:
 *
 *   • authority comes from `resolveGuardianAccess` (live PARENT tier + verified
 *     email, read from the database — not from the JWT alone);
 *   • the student is written with `parentId = userId` for the legacy column;
 *   • an APPROVED, primary `StudentGuardian` link is created in the **same
 *     transaction**, which is what the parent portal actually authorises
 *     against. A child created here is therefore visible immediately, while a
 *     student created by an institution (no link) stays invisible.
 */
export class ParentStudentForbiddenError extends Error {
  constructor() {
    super("Parent student creation requires a live, verified PARENT account");
    this.name = "ParentStudentForbiddenError";
  }
}

export interface CreateParentStudentInput {
  fullName: string;
  /** Defaults to a school-age placeholder when the form omits it. */
  dateOfBirth?: Date | null;
}

export async function createParentStudent(
  userId: string | null | undefined,
  input: CreateParentStudentInput
): Promise<{ id: string; fullName: string }> {
  const access = await resolveGuardianAccess(userId);
  if (!access.ok) throw new ParentStudentForbiddenError();

  const dateOfBirth = input.dateOfBirth ?? schoolAgePlaceholder();

  return prisma.$transaction(async (tx) => {
    const created = await tx.student.create({
      data: {
        fullName: input.fullName,
        parentId: access.access.userId,
        dateOfBirth,
      },
      select: { id: true, fullName: true },
    });

    const now = new Date();
    await tx.studentGuardian.create({
      data: {
        studentId: created.id,
        userId: access.access.userId,
        status: "APPROVED",
        isPrimary: true,
        requestedAt: now,
        approvedAt: now,
        events: {
          create: {
            studentId: created.id,
            guardianId: access.access.userId,
            action: "APPROVED",
            note: "أُنشئ الطالب من حساب ولي الأمر نفسه",
          },
        },
      },
    });

    return created;
  });
}

/** Eight years old — the previous route's default when no date was sent. */
function schoolAgePlaceholder(): Date {
  const fallback = new Date();
  fallback.setFullYear(fallback.getFullYear() - 8);
  return fallback;
}
