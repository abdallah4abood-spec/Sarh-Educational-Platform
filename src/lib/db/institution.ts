import { prisma } from "@/lib/prisma";
import {
  hasCapability,
  requireCapability,
  type InstitutionAccess,
} from "@/lib/institution-access";
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
 * Every loader takes an `InstitutionAccess` token, not a bare id. That token
 * is produced only by `resolveInstitutionAccess` in
 * `src/lib/institution-access.ts`, which verifies ownership or an active
 * manager membership against the database. Passing a query-string or
 * request-body id straight to a loader is consequently a type error rather
 * than a tenant leak, and every read below is keyed on the token's
 * `institutionId`.
 */

/** Header identity for the centre pages. */
export async function loadInstitutionHeader(access: InstitutionAccess) {
  requireCapability(access, "institution.read");

  const row = await prisma.institution.findUnique({
    where: { id: access.institutionId },
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
  access: InstitutionAccess,
  take = 40
): Promise<CommissionRow[]> {
  requireCapability(access, "commissions.read");

  const rows = await prisma.enrollment.findMany({
    where: { institutionId: access.institutionId },
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
  access: InstitutionAccess
): Promise<RosterStudent[]> {
  requireCapability(access, "roster.read");

  const rows = await prisma.enrollment.findMany({
    where: { institutionId: access.institutionId },
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

export async function loadInstitutionStaff(
  access: InstitutionAccess
): Promise<StaffRow[]> {
  requireCapability(access, "staff.read");

  const rows = await prisma.staffMember.findMany({
    where: { institutionId: access.institutionId },
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
    // `title` is the human-facing position; `role` governs access only.
    role: row.title,
    subjects: row.subjects.join("، ") || "—",
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
  access: InstitutionAccess
): Promise<DirectoryChecklistItem[]> {
  requireCapability(access, "profile.read");

  const rows = await prisma.directoryChecklistItem.findMany({
    where: { institutionId: access.institutionId },
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
export async function loadInstitutionProfile(access: InstitutionAccess) {
  requireCapability(access, "profile.read");

  const row = await prisma.institution.findUnique({
    where: { id: access.institutionId },
    include: {
      students: { select: { status: true } },
    },
  });
  if (!row) return null;

  const canViewFinance = hasCapability(access, "commissions.read");
  const verifiedSeats = row.students.filter(
    (enrollment) => enrollment.status === "VERIFIED"
  ).length;

  return {
    name: row.name,
    zone: `${row.zone} — ${row.address}`,
    phone: row.phone ?? "—",
    verified: row.trustStatus === "VERIFIED",
    rating: row.rating,
    // Verified-enrolment counts and occupancy are finance-derived. A
    // CENTER_ADMIN gets `null` so the value never leaves the database, rather
    // than receiving a number the UI is expected to hide.
    reviews: canViewFinance ? verifiedSeats : null,
    occupancy: canViewFinance
      ? row.students.length === 0
        ? 0
        : verifiedSeats / row.students.length
      : null,
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
  access: InstitutionAccess
): Promise<string[]> {
  requireCapability(access, "ai_studio.use");

  const rows = await prisma.schoolClass.findMany({
    where: { institutionId: access.institutionId },
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
