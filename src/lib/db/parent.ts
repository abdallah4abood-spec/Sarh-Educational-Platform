import {
  grantedInstitutionIds,
  grantsForStudent,
  isLinkedStudent,
  type GuardianAccess,
  type GuardianGrantScope,
} from "@/lib/guardian-access";
import { prisma } from "@/lib/prisma";
import {
  dayKey,
  isSchoolDay,
  type AgeTier,
  type FeedChild,
  type FeedDayLog,
  type HomeworkItem,
  type ScoreEntry,
} from "@/lib/data/feed";
import type {
  ParentAnnouncement,
  SubjectPerformance,
} from "@/lib/data/portal";

/**
 * Parent-portal reads — phase 4.3.
 *
 * Scoping rule: every institutional row is read by an approved
 * `(studentId, institutionId)` grant. A child with an APPROVED family link but
 * no grant still appears as an identity card ("not enrolled"); no log, grade,
 * announcement or contact from any institution is read for that child.
 *
 * `Student.parentId` and `StudentGuardian.status` are never authorisation
 * sources here.
 */

/* ------------------------------------------------------------------ */
/* Children                                                            */
/* ------------------------------------------------------------------ */

function allowedInstitutions(access: GuardianAccess): Set<string> {
  return new Set(grantedInstitutionIds(access));
}

/**
 * The signed-in parent's children, with the institution and class they are
 * enrolled in.
 *
 * Only enrollments at institutions where the guardian holds a grant are
 * eligible. When a child has grants at more than one institution, the most
 * recent ACTIVE enrollment supplies the card label; the feed itself still
 * merges only the granted institutions' logs.
 */
export async function loadFeedChildren(
  access: GuardianAccess
): Promise<FeedChild[]> {
  if (access.linkedStudentIds.length === 0) return [];

  const allowed = allowedInstitutions(access);
  const students = await prisma.student.findMany({
    where: { id: { in: [...access.linkedStudentIds] } },
    orderBy: { fullName: "asc" },
    include: {
      enrollments: {
        where: allowed.size ? { institutionId: { in: [...allowed] } } : undefined,
        orderBy: { createdAt: "desc" },
        include: {
          institution: { select: { id: true, name: true, type: true } },
          class: { select: { gradeLevel: true } },
        },
      },
    },
  });

  return students.map((student) => {
    const grantedForChild = new Set(grantedInstitutionIds(access, student.id));
    const eligible = student.enrollments
      .filter((enrollment) => grantedForChild.has(enrollment.institutionId))
      .sort((a, b) => {
        if (a.enrollmentStatus !== b.enrollmentStatus) {
          return a.enrollmentStatus === "ACTIVE" ? -1 : 1;
        }
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
    const enrollment = eligible[0];
    const tier: AgeTier =
      enrollment?.institution.type === "KINDERGARTEN"
        ? "KINDERGARTEN"
        : "EDUCATIONAL_CENTER";

    return {
      id: student.id,
      name: student.fullName,
      tier,
      institutionId: enrollment?.institution.id ?? "",
      institutionName: enrollment?.institution.name ?? "غير مسجل",
      gradeLevel:
        enrollment?.class?.gradeLevel ?? enrollment?.gradeLevel ?? "غير مسجل",
    };
  });
}

/* ------------------------------------------------------------------ */
/* Daily logs                                                          */
/* ------------------------------------------------------------------ */

type LogRow = Awaited<ReturnType<typeof queryLogs>>[number];

function queryLogs(
  scopes: readonly GuardianGrantScope[],
  from: Date,
  to: Date
) {
  if (scopes.length === 0) {
    return prisma.dailyLog.findMany({
      where: { id: "__no_grant__" },
      include: { institution: { select: { id: true, name: true } } },
    });
  }
  return prisma.dailyLog.findMany({
    where: {
      OR: scopes.map((scope) => ({
        studentId: scope.studentId,
        institutionId: scope.institutionId,
      })),
      date: { gte: from, lte: to },
    },
    include: { institution: { select: { id: true, name: true } } },
    orderBy: { date: "desc" },
  });
}

/** `gradesJson` is untyped in the database, so narrow it at the boundary. */
function toScoreEntries(gradesJson: unknown): ScoreEntry[] {
  if (!gradesJson || typeof gradesJson !== "object" || Array.isArray(gradesJson)) {
    return [];
  }
  return Object.entries(gradesJson as Record<string, unknown>)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .map(([subject, score]) => ({ subject, score, total: 100 }));
}

/** `homework` is Json in the database; shape it into the UI's item type. */
function toHomework(homework: unknown, logId: string): HomeworkItem[] {
  if (!Array.isArray(homework)) return [];
  return homework.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as { title?: unknown; subject?: unknown; done?: unknown };
    if (typeof item.title !== "string") return [];
    return [
      {
        id: `${logId}:hw-${index}`,
        title: item.title,
        subject: typeof item.subject === "string" ? item.subject : "",
        done: item.done === true,
      },
    ];
  });
}

/** One Prisma row → the feed's `FeedDayLog`. */
function toFeedDayLog(log: LogRow): FeedDayLog {
  return {
    id: log.id,
    childId: log.studentId,
    institutionId: log.institutionId,
    date: dayKey(log.date),
    attendance: log.attendance,
    dayPlan: log.dayPlan,
    activities: log.dayPlan,
    photos: log.activityPhotos,
    pickupPerson: log.pickupPerson
      ? { name: log.pickupPerson, relation: "", verified: true }
      : null,
    aiSummary: log.aiSummary,
    homework: toHomework(log.homework, log.id),
    scores: toScoreEntries(log.gradesJson),
  };
}

/**
 * Every daily log for one child inside a date window, keyed by `YYYY-MM-DD`.
 * A child with no grant in an institution never reads that institution's logs.
 */
export async function loadChildLogs(
  access: GuardianAccess,
  childId: string,
  windowDays = 21
): Promise<Map<string, FeedDayLog>> {
  if (!isLinkedStudent(access, childId)) return new Map();
  const scopes = grantsForStudent(access, childId);
  if (scopes.length === 0) return new Map();

  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const logs = await queryLogs(scopes, from, to);
  return new Map(logs.map((log) => [dayKey(log.date), toFeedDayLog(log)]));
}

/** Whether a log exists for a child on a given day. */
export function isLoggedDay(
  logs: Map<string, FeedDayLog>,
  date: Date
): boolean {
  return logs.has(dayKey(date)) || !isSchoolDay(date);
}

/* ------------------------------------------------------------------ */
/* Children overview                                                   */
/* ------------------------------------------------------------------ */

export interface ChildCard {
  child: FeedChild;
  performance: SubjectPerformance[];
  attendanceRate: number;
  logsCount: number;
}

/** One card per child for `/parent/children`, scoped to approved grants. */
export async function loadChildrenOverview(
  access: GuardianAccess
): Promise<ChildCard[]> {
  const children = await loadFeedChildren(access);
  const childIds = new Set(children.map((child) => child.id));
  const scopes = access.grants.filter((scope) => childIds.has(scope.studentId));
  if (children.length === 0) return [];

  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
  const where = scopes.length
    ? {
        OR: scopes.map((scope) => ({
          studentId: scope.studentId,
          institutionId: scope.institutionId,
        })),
      }
    : { id: "__no_grant__" };

  const [performance, logs] = await Promise.all([
    prisma.subjectPerformance.findMany({
      where,
      orderBy: { subject: "asc" },
    }),
    prisma.dailyLog.groupBy({
      by: ["studentId", "attendance"],
      where: { ...where, date: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  return children.map((child) => {
    const rows = logs.filter((row) => row.studentId === child.id);
    const total = rows.reduce((sum, row) => sum + row._count._all, 0);
    const present = rows
      .filter((row) => row.attendance)
      .reduce((sum, row) => sum + row._count._all, 0);

    const bySubject = new Map<string, number[]>();
    for (const row of performance) {
      if (row.studentId !== child.id) continue;
      bySubject.set(row.subject, [
        ...(bySubject.get(row.subject) ?? []),
        row.score,
      ]);
    }

    return {
      child,
      performance: [...bySubject.entries()].map(([subject, scores]) => ({
        subject,
        percent: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      })),
      attendanceRate: total === 0 ? 0 : Math.round((present / total) * 100) / 100,
      logsCount: total,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export interface ParentDashboard {
  children: FeedChild[];
  todayDayPlan: string[];
  pendingHomework: number;
  institutionCount: number;
  announcements: ParentAnnouncement[];
  messages: {
    id: string;
    from: string;
    subject: string;
    at: string;
    unread: boolean;
  }[];
  unreadCount: number;
  performance: SubjectPerformance[];
  overall: number;
}

const ANNOUNCEMENT_KIND = {
  HOLIDAY: "holiday",
  SCHEDULE: "schedule",
  MEETING: "meeting",
} as const;

function relativeStamp(date: Date): string {
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes()
    ).padStart(2, "0")}`;
  }
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (date.toDateString() === yesterday.toDateString()) return "أمس";
  return dayKey(date);
}

export async function loadParentDashboard(
  access: GuardianAccess
): Promise<ParentDashboard> {
  const children = await loadFeedChildren(access);
  const childIds = new Set(children.map((child) => child.id));
  const scopes = access.grants.filter((scope) => childIds.has(scope.studentId));
  const institutionIds = [
    ...new Set(scopes.map((scope) => scope.institutionId)),
  ];

  const today = new Date();
  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  const [todayLogs, performance, announcements, messages] = await Promise.all([
    queryLogs(scopes, startOfToday, endOfToday),
    scopes.length
      ? prisma.subjectPerformance.findMany({
          where: {
            OR: scopes.map((scope) => ({
              studentId: scope.studentId,
              institutionId: scope.institutionId,
            })),
          },
          orderBy: { subject: "asc" },
        })
      : [],
    // No grants => platform notices only. `{}` inside OR would match every row.
    prisma.announcement.findMany({
      where: institutionIds.length
        ? {
            OR: [
              { institutionId: null },
              { institutionId: { in: institutionIds } },
            ],
          }
        : { institutionId: null },
      include: { institution: { select: { name: true } } },
      orderBy: { publishedAt: "desc" },
      take: 4,
    }),
    prisma.message.findMany({
      where: { toUserId: access.userId },
      include: { fromUser: { select: { fullName: true } } },
      orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
      take: 5,
    }),
  ]);

  // Prefer a child the family can actually read: the first linked child may
  // have no grant yet, and their card is identity-only.
  const primaryChild =
    children.find((child) => child.institutionId) ?? children[0];
  const primaryLog = todayLogs.find((log) => log.studentId === primaryChild?.id);

  const pendingHomework = todayLogs.reduce(
    (total, log) =>
      total +
      toHomework(log.homework, log.id).filter((item) => !item.done).length,
    0
  );

  const bySubject = new Map<string, number[]>();
  for (const row of performance) {
    bySubject.set(row.subject, [
      ...(bySubject.get(row.subject) ?? []),
      row.score,
    ]);
  }
  const subjectRows: SubjectPerformance[] = [...bySubject.entries()].map(
    ([subject, scores]) => ({
      subject,
      percent: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    })
  );
  const overall = subjectRows.length
    ? Math.round(
        subjectRows.reduce((total, row) => total + row.percent, 0) /
          subjectRows.length
      )
    : 0;

  return {
    children,
    todayDayPlan: primaryLog?.dayPlan ?? [],
    pendingHomework,
    institutionCount: institutionIds.length,
    announcements: announcements.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      date: dayKey(row.publishedAt),
      center: row.institution?.name ?? "منصة صَرْح",
      kind: ANNOUNCEMENT_KIND[row.kind],
    })),
    messages: messages.map((row) => ({
      id: row.id,
      from: row.fromUser.fullName,
      subject: row.subject,
      at: relativeStamp(row.createdAt),
      unread: row.readAt === null,
    })),
    unreadCount: messages.filter((row) => row.readAt === null).length,
    performance: subjectRows,
    overall,
  };
}
