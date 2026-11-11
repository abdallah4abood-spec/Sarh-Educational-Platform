import { prisma } from "@/lib/prisma";

const PREFIX = "uw-test-";

/**
 * Removes the rows this file created.
 *
 * Only `student` and `user` are cleaned here, so no other model has a cleanup
 * policy in this file. A write to one of those models that touches an ownership
 * column cannot be shown to stay inside the fixture: it is reported as
 * unsupported, never as a confirmed violation, and never silently accepted.
 */
async function clearFixtures() {
  await prisma.student.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

export async function unprovenWrites(patch: Record<string, unknown>) {
  // 1. Ownership column on a model this file never cleans.
  await prisma.enrollment.update({
    where: { id: `${PREFIX}enrollment-1` },
    data: { institutionId: "another-institution" },
  });

  // 2. Descriptive column on the same model: still no policy, but nothing that
  //    decides which fixture row this is, so the verdict is unchanged.
  await prisma.enrollment.update({
    where: { id: `${PREFIX}enrollment-1` },
    data: { gradeLevel: "grade-2" },
  });

  // 3. The update branch of an upsert is judged on its own, even though the
  //    create branch would be scoped by the file's student cleanup.
  await prisma.enrollment.upsert({
    where: { id: `${PREFIX}enrollment-1` },
    create: {
      studentId: `${PREFIX}student-1`,
      institutionId: `${PREFIX}institution-1`,
      gradeLevel: "grade-1",
      commissionFee: 0,
    },
    update: { institutionId: "another-institution" },
  });

  // 4. An unresolvable spread may carry any key, including an ownership
  //    column, so the payload cannot be shown to be descriptive.
  await prisma.schoolClass.update({
    where: { id: `${PREFIX}class-1` },
    data: { ...patch, name: "class-1" },
  });

  await clearFixtures();
}
