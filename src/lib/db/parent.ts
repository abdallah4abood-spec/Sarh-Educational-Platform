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
 * Parent-portal reads.
 *
 * Every function here is a Server-Component query: it takes the authenticated
 * `session.user.id` and returns the same TypeScript shapes the UI was already
 * written against, so swapping the source from a bundled fixture to PostgreSQL
 * never touched a single JSX expression. Nothing in this file is importable
 * from a Client Component — the data has to arrive as props, which is what
 * keeps the Prisma client out of the browser bundle.
 *
 * Scoping rule: a parent only ever sees rows reachable from their own
 * `Student` rows. `parentId` is taken from the session and never from a query
 * string, so a crafted `?childId=` cannot cross accounts.
 */

/* ------------------------------------------------------------------ */
/* Children                                                            */
/* ------------------------------------------------------------------ */

/**
 * The signed-in parent's children, with the institution and class they are
 * enrolled in.
 *
 * A child can hold more than one enrollment (a kindergarten plus a summer
 * centre); the feed shows the *most recent* one because that is the
 * institution currently producing their daily log, which is what the tier chip
 * and the log queries are keyed on.
 */
export async function loadFeedChildren(parentId: string): Promise<FeedChild[]> {
  const students = await prisma.student.findMany({
    where: { parentId },
    orderBy: { fullName: "asc" },
    include: {
      enrollments: {
        orderBy: { createdAt: "desc" },
        include: {
          institution: { select: { id: true, name: true, type: true } },
          class: { select: { gradeLevel: true } },
        },
      },
    },
  });

  return students.map((student) => {
    const enrollment = student.enrollments[0];
    const tier: AgeTier = enrollment?.institution.type === "KINDERGARTEN"
      ? "KINDERGARTEN"
      : "EDUCATIONAL_CENTER";

    return {
      id: student.id,
      name: student.fullName,
      tier,
      institutionId: enrollment?.institution.id ?? "",
      institutionName: enrollment?.institution.name ?? "غير مسجّل",
      // The class's own grade label is more precise than the enrollment's
      // free-text copy when a child has been re-seated mid-term.
      gradeLevel:
        enrollment?.class?.gradeLevel ?? enrollment?.gradeLevel ?? "غير محدد",
    };
  });
}

/* ------------------------------------------------------------------ */
/* Daily logs                                                          */
/* ------------------------------------------------------------------ */

type LogRow = Awaited<ReturnType<typeof queryLogs>>[number];

function queryLogs(studentIds: string[], from: Date, to: Date) {
  return prisma.dailyLog.findMany({
    where: {
      studentId: { in: studentIds },
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
    // The stored programme is the programme; "activities" is the kindergarten
    // vocabulary for the same timeline, so it mirrors dayPlan rather than
    // inventing a second list the database does not have.
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
 *
 * Returns a map rather than an array because the feed navigates by date: the
 * week strip asks "is there a log for this day?" on every render, and a map
 * turns that into an O(1) lookup instead of a scan. Weekends simply have no
 * key, which is exactly how the UI already renders a rest day.
 *
 * The child is verified to belong to `parentId` first — a missing or foreign
 * child yields an empty map, never someone else's log.
 */
export async function loadChildLogs(
  parentId: string,
  childId: string,
  windowDays = 21
): Promise<Map<string, FeedDayLog>> {
  const owns = await prisma.student.findFirst({
    where: { id: childId, parentId },
    select: { id: true },
  });
  if (!owns) return new Map();

  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const logs = await queryLogs([childId], from, to);
  return new Map(logs.map((log) => [dayKey(log.date), toFeedDayLog(log)]));
}

/**
 * Whether a log exists for a child on a given day.
 *
 * Used by the week strip, which must not claim a rest day when the log row is
 * simply missing (a data gap) rather than genuinely absent (a weekend).
 */
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
  /** Per-subject term rows for this child. */
  performance: SubjectPerformance[];
  /** Share of school days attended over the last 28 days (0–1). */
  attendanceRate: number;
  /** Daily logs recorded in the same window. */
  logsCount: number;
}

/**
 * One card per child for `/parent/children`: enrollment identity, subject
 * rows and the attendance share computed from real logs — the same rows the
 * feed renders, aggregated rather than duplicated.
 */
export async function loadChildrenOverview(
  parentId: string
): Promise<ChildCard[]> {
  const children = await loadFeedChildren(parentId);
  const childIds = children.map((child) => child.id);
  if (childIds.length === 0) return [];

  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

  const [performance, logs] = await Promise.all([
    prisma.subjectPerformance.findMany({
      where: { studentId: { in: childIds } },
      orderBy: { subject: "asc" },
    }),
    prisma.dailyLog.groupBy({
      by: ["studentId", "attendance"],
      where: { studentId: { in: childIds }, date: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  return children.map((child) => {
    const rows = logs.filter((row) => row.studentId === child.id);
    const total = rows.reduce((sum, row) => sum + row._count._all, 0);
    const present = rows
      .filter((row) => row.attendance)
      .reduce((sum, row) => sum + row._count._all, 0);

    return {
      child,
      performance: performance
        .filter((row) => row.studentId === child.id)
        .map((row) => ({
          subject: row.subject,
          percent: Math.round((row.score / 100) * 100),
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
  /** Programme for the primary child today (empty on a rest day). */
  todayDayPlan: string[];
  /** Open homework items across today's logs. */
  pendingHomework: number;
  /** Distinct institutions the children are enrolled in. */
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

/** HH:MM for today, otherwise the date — the tile is a glance, not a log. */
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
  parentId: string
): Promise<ParentDashboard> {
  const children = await loadFeedChildren(parentId);
  const childIds = children.map((child) => child.id);

  const today = new Date();
  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  const institutionIds = [
    ...new Set(children.map((child) => child.institutionId).filter(Boolean)),
  ];

  const [todayLogs, performance, announcements, messages] = await Promise.all([
    childIds.length ? queryLogs(childIds, startOfToday, endOfToday) : [],
    childIds.length
      ? prisma.subjectPerformance.findMany({
          where: { studentId: { in: childIds } },
          orderBy: { subject: "asc" },
        })
      : [],
    // A parent sees platform-wide notices plus notices from their own centres.
    prisma.announcement.findMany({
      where: {
        OR: [
          { institutionId: null },
          institutionIds.length ? { institutionId: { in: institutionIds } } : {},
        ],
      },
      include: { institution: { select: { name: true } } },
      orderBy: { publishedAt: "desc" },
      take: 4,
    }),
    prisma.message.findMany({
      where: { toUserId: parentId },
      include: { fromUser: { select: { fullName: true } } },
      orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
      take: 5,
    }),
  ]);

  const primaryChild = children[0];
  const primaryLog = todayLogs.find((log) => log.studentId === primaryChild?.id);

  const pendingHomework = todayLogs.reduce(
    (total, log) =>
      total +
      toHomework(log.homework, log.id).filter((item) => !item.done).length,
    0
  );

  // The ring is the average of each subject's latest score across the family's
  // children — a single honest figure rather than a stored constant.
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
