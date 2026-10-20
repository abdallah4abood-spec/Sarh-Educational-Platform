import type { Prisma, Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { effectiveRoles, PLATFORM_ADMIN_ROLE } from "@/lib/roles";
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
 * the supervisor's actual span: the institutions they hold an **active** staff
 * membership in. The scope is resolved on the server from the signed-in user
 * id on every call (`resolveSupervisorScope`) and fails closed — a supervisor
 * with no usable membership row reads nothing. Only `SUPER_ADMIN`, which
 * `roles.ts` deliberately lets into every portal for inspection, is
 * platform-wide.
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

/* ------------------------------------------------------------------ */
/* Scope resolution — the single gate every read below goes through    */
/* ------------------------------------------------------------------ */

/**
 * What a caller is allowed to read.
 *
 *   `institutions` — a supervisor holding at least one ACTIVE staff
 *                    membership; only those institution ids are queried.
 *   `platform`     — SUPER_ADMIN, platform-wide by design (`roles.ts`).
 *   `denied`       — everything else, including a SUPERVISOR whose membership
 *                    is missing, inactive or unverifiable. Fails closed: the
 *                    caller reads nothing rather than everything.
 */
export type SupervisorScope =
  | { kind: "institutions"; institutionIds: string[] }
  | { kind: "platform" }
  | {
      kind: "denied";
      reason: "unknown-user" | "not-supervisor" | "no-membership";
    };

/**
 * Institution ids the given user actively supervises.
 *
 * Only ACTIVE memberships count: a membership that has lapsed (ON_LEAVE,
 * INACTIVE) is not a claim on a centre's supervision data. An empty array
 * means “no active span” — never “platform scope”. Callers must not flatten
 * it into an empty `where`, which would widen the query; use
 * `resolveSupervisorScope` instead.
 */
export async function supervisedInstitutionIds(
  supervisorId: string
): Promise<string[]> {
  if (!supervisorId) return [];
  const rows = await prisma.staffMember.findMany({
    where: { userId: supervisorId, status: "ACTIVE" },
    select: { institutionId: true },
  });
  return [...new Set(rows.map((row) => row.institutionId))];
}

/**
 * Resolve the caller's supervision scope from their own account.
 *
 * The role is read from the database rather than trusted from the request:
 * an account that is not a supervisor (and not the platform admin) has no
 * business in these reads even if it somehow reaches a loader.
 */
export async function resolveSupervisorScope(
  supervisorId: string
): Promise<SupervisorScope> {
  if (!supervisorId) return { kind: "denied", reason: "unknown-user" };

  const user = await prisma.user.findUnique({
    where: { id: supervisorId },
    select: { role: true, roles: true },
  });
  if (!user) return { kind: "denied", reason: "unknown-user" };

  const roles = effectiveRoles(user.role, user.roles);
  if (roles.includes(PLATFORM_ADMIN_ROLE)) return { kind: "platform" };
  if (!roles.includes("SUPERVISOR")) {
    return { kind: "denied", reason: "not-supervisor" };
  }

  const institutionIds = await supervisedInstitutionIds(supervisorId);
  if (institutionIds.length === 0) {
    return { kind: "denied", reason: "no-membership" };
  }
  return { kind: "institutions", institutionIds };
}

/**
 * Prisma `where` fragment for a resolved scope.
 *
 * A denied scope becomes an empty `IN` — which matches no row — so a query
 * reached without an early return still cannot leak another institution's
 * rows. It is never `{}`.
 */
function institutionScopeWhere(
  scope: SupervisorScope
): Prisma.LessonPlanWhereInput {
  if (scope.kind === "platform") return {};
  const institutionIds = scope.kind === "institutions" ? scope.institutionIds : [];
  return { institutionId: { in: institutionIds } };
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
  const scope = await resolveSupervisorScope(supervisorId);
  if (scope.kind === "denied") return [];

  const rows = await prisma.lessonPlan.findMany({
    where: institutionScopeWhere(scope),
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
  const counts: PlanCounts = { PENDING: 0, APPROVED: 0, REVISION: 0 };
  const scope = await resolveSupervisorScope(supervisorId);
  if (scope.kind === "denied") return counts;

  const rows = await prisma.lessonPlan.groupBy({
    by: ["status"],
    where: institutionScopeWhere(scope),
    _count: { _all: true },
  });

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
  const scope = await resolveSupervisorScope(supervisorId);
  if (scope.kind === "denied") return [];
  return evaluationsFor(scope, supervisorId);
}

/** Staff-membership filter for the teacher label on a scoped read. */
function staffLabelFilter(
  scope: SupervisorScope
): { institutionId: { in: string[] } } | undefined {
  return scope.kind === "institutions"
    ? { institutionId: { in: scope.institutionIds } }
    : undefined;
}

/**
 * The supervisor's own observation rows.
 *
 * Bounded by `supervisorId` itself: these are records this account authored.
 * The teacher's centre label is resolved inside the supervisor's span only, so
 * a multi-centre teacher is never described by a centre the supervisor has no
 * claim on.
 */
async function evaluationsFor(
  scope: SupervisorScope,
  supervisorId: string
): Promise<TeacherEvaluation[]> {
  const labelFilter = staffLabelFilter(scope);
  const rows = await prisma.teacherEvaluation.findMany({
    where: { supervisorId },
    include: {
      teacher: {
        select: {
          fullName: true,
          staffRoles: {
            ...(labelFilter ? { where: labelFilter } : {}),
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
  const scope = await resolveSupervisorScope(supervisorId);
  if (scope.kind === "denied") return [];

  const evaluations = await evaluationsFor(scope, supervisorId);
  if (evaluations.length === 0) return [];

  const labelFilter = staffLabelFilter(scope);
  const teacherRows = await prisma.teacherEvaluation.findMany({
    where: { supervisorId },
    select: {
      teacherId: true,
      teacher: {
        select: {
          fullName: true,
          staffRoles: {
            ...(labelFilter ? { where: labelFilter } : {}),
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

  // Plan compliance is a figure about *this* span: a teacher who also works in
  // another centre must be scored on the plans the supervisor can see, not on
  // their total output platform-wide.
  const planCounts = await prisma.lessonPlan.groupBy({
    by: ["authorId", "status"],
    where: {
      authorId: { in: teacherRows.map((row) => row.teacherId) },
      ...(scope.kind === "institutions"
        ? { institutionId: { in: scope.institutionIds } }
        : {}),
    },
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
  const scope = await resolveSupervisorScope(supervisorId);
  if (scope.kind === "denied") return [];

  const rows = await prisma.qualitySignal.findMany({
    // A signal is in scope when this supervisor raised it *and* it belongs to
    // one of their institutions — or to none (platform-wide context). A signal
    // pinned to another centre is not theirs to read.
    where:
      scope.kind === "platform"
        ? { scopeOwnerId: supervisorId }
        : {
            scopeOwnerId: supervisorId,
            OR: [
              { institutionId: null },
              { institutionId: { in: scope.institutionIds } },
            ],
          },
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
