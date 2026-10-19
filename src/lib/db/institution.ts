import { prisma } from "@/lib/prisma";
import type {
  CommissionRow,
  RosterStudent,
} from "@/lib/data/institution";
import type {
  DirectoryChecklistItem,
  StaffRow,
} from "@/lib/data/portal";

/**
 * Institution-portal reads (`/institution/**`) — multi-tenant centre admin.
 *
 * A centre account must only ever see its own centre. `resolveInstitutionId`
 * is the gate: it walks the account's ownership first, then its staff
 * membership, and every loader below takes the resolved id — never a query
 * string — so an edited URL cannot open another tenant's roster or revenue.
 */

/**
 * The institution this account administers.
 *
 * Ownership wins over staff membership: an owner who is also on staff should
 * land on the centre they actually own. `null` means the account is not
 * attached to any centre yet (the pages render an empty-state then).
 */
export async function resolveInstitutionId(
  userId: string
): Promise<string | null> {
  const owned = await prisma.institution.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (owned) return owned.id;

  const staff = await prisma.staffMember.findFirst({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    select: { institutionId: true },
  });
  return staff?.institutionId ?? null;
}

/** Header identity for the centre pages. */
export async function loadInstitutionHeader(institutionId: string) {
  const row = await prisma.institution.findUnique({
    where: { id: institutionId },
    include: { _count: { select: { students: true, staff: true } } },
  });
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    zone: row.zone,
    phone: row.phone ?? "—",
    verified: row.trustStatus === "VERIFIED",
    trustStatus: row.trustStatus,
    rating: row.rating,
    students: row._count.students,
    staff: row._count.staff,
  };
}

/* ------------------------------------------------------------------ */
/* Commissions (Enrollment → referral fee)                             */
/* ------------------------------------------------------------------ */

function toCommissionRow(row: {
  id: string;
  gradeLevel: string;
  commissionFee: number;
  status: CommissionRow["status"];
  createdAt: Date;
  student: { fullName: string };
  institution: { name: string };
  class: { gradeLevel: string } | null;
}): CommissionRow {
  return {
    id: row.id,
    studentName: row.student.fullName,
    centerName: row.institution.name,
    gradeLevel: row.class?.gradeLevel ?? row.gradeLevel,
    referralFee: row.commissionFee,
    status: row.status,
    registeredAt: row.createdAt.toISOString().slice(0, 10),
  };
}

/** Referral rows for one centre, newest first. */
export async function loadInstitutionCommissions(
  institutionId: string,
  take = 40
): Promise<CommissionRow[]> {
  const rows = await prisma.enrollment.findMany({
    where: { institutionId },
    include: {
      student: { select: { fullName: true } },
      institution: { select: { name: true } },
      class: { select: { gradeLevel: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map(toCommissionRow);
}

/* ------------------------------------------------------------------ */
/* Roster (AI studio attendance tool)                                  */
/* ------------------------------------------------------------------ */

/** Enrolled students of the centre, shaped for the 1-click attendance grid. */
export async function loadInstitutionRoster(
  institutionId: string
): Promise<RosterStudent[]> {
  const rows = await prisma.enrollment.findMany({
    where: { institutionId },
    include: {
      student: {
        select: {
          id: true,
          fullName: true,
          parent: { select: { fullName: true } },
        },
      },
      class: { select: { gradeLevel: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((row) => ({
    id: row.student.id,
    name: row.student.fullName,
    gradeLevel: row.class?.gradeLevel ?? row.gradeLevel,
    guardian: row.student.parent.fullName,
  }));
}

/* ------------------------------------------------------------------ */
/* Staff                                                               */
/* ------------------------------------------------------------------ */

const ROLE_BY_TITLE = (title: string): StaffRow["role"] => {
  if (/مدير/.test(title)) return "مدير المركز";
  if (/مشرف/.test(title)) return "مشرف";
  if (/معلم|معلّ/.test(title)) return "معلم";
  return "إداري";
};

export async function loadInstitutionStaff(
  institutionId: string
): Promise<StaffRow[]> {
  const rows = await prisma.staffMember.findMany({
    where: { institutionId },
    include: {
      user: {
        select: {
          fullName: true,
          _count: { select: { taughtClasses: true } },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.user.fullName,
    role: ROLE_BY_TITLE(row.title),
    subjects: row.subjects.join("، ") || row.title,
    classes: row.user._count.taughtClasses,
    status:
      row.status === "ON_LEAVE"
        ? "ON_LEAVE"
        : row.status === "INACTIVE"
          ? "PENDING_INVITE"
          : "ACTIVE",
  }));
}

/* ------------------------------------------------------------------ */
/* Public-directory completeness                                       */
/* ------------------------------------------------------------------ */

/** Static guidance per checklist requirement; the done flag is live. */
const CHECKLIST_HINTS: Record<string, string> = {
  contact: "الهاتف والعنوان والمنطقة ظاهرة في الدليل",
  photos: "صور المركز والمرافق بجودة معتمدة",
  fees: "أكمل نطاق الرسوم لكل مرحلة ليظهر ملخّص السعر",
  hours: "أوقات العمل وأيام العطل محدّثة",
  license: "ارفع الترخيص لتفعيل شارة «موثّق» في الدليل",
};

export async function loadDirectoryChecklist(
  institutionId: string
): Promise<DirectoryChecklistItem[]> {
  const rows = await prisma.directoryChecklistItem.findMany({
    where: { institutionId },
    orderBy: { key: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    done: row.done,
    hint: CHECKLIST_HINTS[row.key] ?? "أكمل هذا البند ليظهر ملف المركز مكتملاً",
  }));
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

/**
 * The centre's public-profile summary. `reviews` counts real, verified
 * enrollments rather than a fabricated review count, and `occupancy` is the
 * share of seats referred through Sarh that finance has verified.
 */
export async function loadInstitutionProfile(institutionId: string) {
  const row = await prisma.institution.findUnique({
    where: { id: institutionId },
    include: {
      students: { select: { status: true } },
    },
  });
  if (!row) return null;

  const verifiedSeats = row.students.filter(
    (enrollment) => enrollment.status === "VERIFIED"
  ).length;

  return {
    name: row.name,
    zone: `${row.zone} — ${row.address}`,
    phone: row.phone ?? "—",
    verified: row.trustStatus === "VERIFIED",
    rating: row.rating,
    reviews: verifiedSeats,
    occupancy: row.students.length === 0 ? 0 : verifiedSeats / row.students.length,
    description: row.description ?? "",
    trustNote: row.trustNote ?? "",
  };
}

/* ------------------------------------------------------------------ */
/* AI studio options                                                   */
/* ------------------------------------------------------------------ */

/**
 * Subjects offered by the quiz generator for this centre: the distinct
 * subjects actually taught in its classes, so the picker cannot offer a
 * subject no teacher can act on.
 */
export async function loadInstitutionSubjects(
  institutionId: string
): Promise<string[]> {
  const rows = await prisma.schoolClass.findMany({
    where: { institutionId },
    select: { subject: true },
    distinct: ["subject"],
    orderBy: { subject: "asc" },
  });
  return rows.map((row) => row.subject);
}

/** Recent quizzes authored for this centre's teachers, for the studio list. */
export async function loadRecentQuizzes(authorIds: string[], take = 6) {
  if (authorIds.length === 0) return [];
  const rows = await prisma.quiz.findMany({
    where: { authorId: { in: authorIds } },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    lesson: row.lesson,
    difficulty: row.difficulty,
    createdAt: row.createdAt.toISOString().slice(0, 10),
  }));
}
