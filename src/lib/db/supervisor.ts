import type { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  LessonPlan,
  QualitySignal,
  ScopedTeacher,
  TeacherEvaluation,
} from "@/lib/data/portal";

/**
 * Supervisor-portal reads (`/supervisor/**`) — the oversight tier.
 *
 * A supervisor reviews *other people's* work, so every query here is scoped by
 * the supervisor's actual span: the institutions they hold a staff membership
 * in. A supervisor with no membership row is treated as platform-wide
 * (SUPER_ADMIN-style inspection), which is the only case in which these
 * queries widen.
 *
 * Nothing in this module returns teacher-private data (no messages, no
 * parents); it returns exactly the artefacts supervision acts on — lesson
 * plans, evaluations, quality signals — in the shapes the UI was written
 * against.
 */

/** `YYYY-MM-DD` in local time — the portal's date convention. */
function isoDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** `HH:MM` for “today at a glance” stamps. */
function clock(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

/**
 * Institution ids the given user supervises. Empty means “platform scope”,
 * not “sees nothing” — callers must branch on that explicitly.
 */
export async function supervisedInstitutionIds(
  supervisorId: string
): Promise<string[]> {
  const rows = await prisma.staffMember.findMany({
    where: { userId: supervisorId },
    select: { institutionId: true },
  });
  return [...new Set(rows.map((row) => row.institutionId))];
}

/** Prisma `where` fragment shared by the scoped queries below. */
function scopeFilter(ids: string[]) {
  return ids.length ? { institutionId: { in: ids } } : {};
}

/* ------------------------------------------------------------------ */
/* Lesson plans                                                        */
/* ------------------------------------------------------------------ */

/**
 * Every plan inside the supervisor's span, newest first.
 *
 * Authors are included because the queue is useless without knowing whose work
 * is waiting, and the reviewer relation is included so an already-reviewed
 * plan keeps its reviewer context on the drill-down pages.
 */
export async function loadSupervisorPlans(
  supervisorId: string,
  take = 24
): Promise<LessonPlan[]> {
  const ids = await supervisedInstitutionIds(supervisorId);

  const rows = await prisma.lessonPlan.findMany({
    where: scopeFilter(ids),
    include: {
      author: { select: { fullName: true } },
      institution: { select: { name: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take,
  });

  return rows.map((row) => ({
    id: row.id,
    teacherName: row.author.fullName,
    center: row.institution?.name ?? "—",
    subject: row.subject,
    gradeLevel: row.gradeLevel,
    title: row.title,
    submittedAt: isoDay(row.createdAt),
    status: row.status,
    completeness: row.completeness,
  }));
}

/** Counts per review state for the overview tiles. */
export interface PlanCounts {
  PENDING: number;
  APPROVED: number;
  REVISION: number;
}

export async function loadPlanCounts(
  supervisorId: string
): Promise<PlanCounts> {
  const ids = await supervisedInstitutionIds(supervisorId);
  const rows = await prisma.lessonPlan.groupBy({
    by: ["status"],
    where: scopeFilter(ids),
    _count: { _all: true },
  });

  const counts: PlanCounts = { PENDING: 0, APPROVED: 0, REVISION: 0 };
  for (const row of rows) counts[row.status] = row._count._all;
  return counts;
}

/* ------------------------------------------------------------------ */
/* Evaluations & scoped teachers                                       */
/* ------------------------------------------------------------------ */

/** Latest center a teacher is attached to (staff membership beats class). */
function teacherCenter(
  staff: { institution: { name: string } }[]
): string | undefined {
  return staff[0]?.institution.name;
}

export async function loadSupervisorEvaluations(
  supervisorId: string
): Promise<TeacherEvaluation[]> {
  const rows = await prisma.teacherEvaluation.findMany({
    where: { supervisorId },
    include: {
      teacher: {
        select: {
          fullName: true,
          staffRoles: {
            select: { institution: { select: { name: true } } },
            take: 1,
          },
          taughtClasses: { select: { subject: true }, take: 1 },
        },
      },
    },
    // Newest observation per teacher is the one the card should carry.
    orderBy: [{ createdAt: "desc" }],
  });

  const seen = new Set<string>();
  const evaluations: TeacherEvaluation[] = [];
  for (const row of rows) {
    if (seen.has(row.teacherId)) continue;
    seen.add(row.teacherId);
    evaluations.push({
      id: row.id,
      teacherName: row.teacher.fullName,
      center: teacherCenter(row.teacher.staffRoles) ?? "—",
      subject: row.teacher.taughtClasses[0]?.subject ?? "—",
      score: row.score,
      visits: row.classroomVisits,
      lastVisit: isoDay(row.createdAt),
      // Trend is derived from the teacher's evaluation history below when more
      // than one row exists; a single observation is honest as "flat".
      trend: "flat",
    });
  }

  // The page's trend chip must mean something: compare each teacher's latest
  // two scores rather than always admitting flatness.
  const byTeacher = new Map<string, number[]>();
  for (const row of rows) {
    byTeacher.set(row.teacherId, [
      ...(byTeacher.get(row.teacherId) ?? []),
      row.score,
    ]);
  }
  for (const evaluation of evaluations) {
    const scores = byTeacher.get(
      rows.find((row) => row.id === evaluation.id)?.teacherId ?? ""
    );
    if (scores && scores.length > 1) {
      const delta = scores[0] - scores[1];
      evaluation.trend = delta > 2 ? "up" : delta < -2 ? "down" : "flat";
    }
  }

  return evaluations;
}

/**
 * The teachers in scope, with the two figures supervision watches: plan
 * compliance (share of the teacher's plans already approved) and the latest
 * evaluation score.
 */
export async function loadScopedTeachers(
  supervisorId: string
): Promise<ScopedTeacher[]> {
  const evaluations = await loadSupervisorEvaluations(supervisorId);
  if (evaluations.length === 0) return [];

  const teacherRows = await prisma.teacherEvaluation.findMany({
    where: { supervisorId },
    select: {
      teacherId: true,
      teacher: {
        select: {
          fullName: true,
          staffRoles: {
            select: { institution: { select: { name: true } } },
            take: 1,
          },
          taughtClasses: {
            select: { subject: true, _count: { select: { enrollments: true } } },
          },
          _count: { select: { taughtClasses: true } },
        },
      },
    },
    distinct: ["teacherId"],
  });

  const planCounts = await prisma.lessonPlan.groupBy({
    by: ["authorId", "status"],
    where: { authorId: { in: teacherRows.map((row) => row.teacherId) } },
    _count: { _all: true },
  });

  const totals = new Map<string, { total: number; approved: number }>();
  for (const row of planCounts) {
    const entry = totals.get(row.authorId) ?? { total: 0, approved: 0 };
    entry.total += row._count._all;
    if (row.status === "APPROVED") entry.approved += row._count._all;
    totals.set(row.authorId, entry);
  }

  const scoreByTeacher = new Map(
    evaluations.map((row) => [row.teacherName, row.score])
  );

  return teacherRows.map((row) => {
    const counts = totals.get(row.teacherId) ?? { total: 0, approved: 0 };
    return {
      id: row.teacherId,
      name: row.teacher.fullName,
      center: teacherCenter(row.teacher.staffRoles) ?? "—",
      subject: row.teacher.taughtClasses[0]?.subject ?? "—",
      classes: row.teacher._count.taughtClasses,
      planCompliance: counts.total === 0 ? 1 : counts.approved / counts.total,
      score: scoreByTeacher.get(row.teacher.fullName) ?? 0,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Quality signals                                                     */
/* ------------------------------------------------------------------ */

const SIGNAL_KIND = {
  ALERT: "alert",
  ACHIEVEMENT: "achievement",
  INFO: "info",
} as const;

/** Recent quality signals raised inside (or towards) the supervisor's scope. */
export async function loadQualitySignals(
  supervisorId: string,
  take = 6
): Promise<QualitySignal[]> {
  const rows = await prisma.qualitySignal.findMany({
    where: { scopeOwnerId: supervisorId },
    orderBy: { createdAt: "desc" },
    take,
  });

  // QualitySignal has no institution relation (only an optional id), so the
  // centre names are resolved in one follow-up query rather than N includes.
  const institutionIds = [
    ...new Set(
      rows.flatMap((row) => (row.institutionId ? [row.institutionId] : []))
    ),
  ];
  const institutions = institutionIds.length
    ? await prisma.institution.findMany({
        where: { id: { in: institutionIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(institutions.map((row) => [row.id, row.name]));

  return rows.map((row) => ({
    id: row.id,
    kind: SIGNAL_KIND[row.kind],
    title: row.title,
    detail: row.detail ?? "",
    at: clock(row.createdAt),
    center:
      (row.institutionId ? nameById.get(row.institutionId) : undefined) ??
      "منصة صَرْح",
  }));
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

export interface SupervisorOverview {
  plans: LessonPlan[];
  planCounts: PlanCounts;
  evaluations: TeacherEvaluation[];
  teachers: ScopedTeacher[];
  signals: QualitySignal[];
  /** Average evaluation score across the span (0–100). */
  averageScore: number;
}

export async function loadSupervisorOverview(
  supervisorId: string
): Promise<SupervisorOverview> {
  const [plans, planCounts, evaluations, teachers, signals] = await Promise.all([
    loadSupervisorPlans(supervisorId, 6),
    loadPlanCounts(supervisorId),
    loadSupervisorEvaluations(supervisorId),
    loadScopedTeachers(supervisorId),
    loadQualitySignals(supervisorId, 4),
  ]);

  const averageScore = evaluations.length
    ? Math.round(
        evaluations.reduce((sum, row) => sum + row.score, 0) / evaluations.length
      )
    : 0;

  return { plans, planCounts, evaluations, teachers, signals, averageScore };
}

/** The tier labels the supervisor-scope header shows, in display order. */
export const OVERSEEN_TIERS: Role[] = ["TEACHER"];
