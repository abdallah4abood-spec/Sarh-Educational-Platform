import { prisma } from "@/lib/prisma";
import type { RosterStudent } from "@/lib/data/institution";
import type {
  ClassStudent,
  PlanStatus,
  SlotStatus,
  TeacherClass,
  TimetableSlot,
} from "@/lib/data/portal";

/**
 * Teacher-portal reads (`/teacher/**`) — the execution tier.
 *
 * Everything is scoped to the signed-in teacher: the classes they actually
 * teach, the roster of those classes, and their own timetable. There is no
 * "all classes" query in this module on purpose — a teacher portal that can
 * render another teacher's roster is a data-leak, not a feature.
 */

/** Minutes since midnight for an `HH:MM` string. */
function minutesOfDay(value: string): number {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  return (hours || 0) * 60 + (minutes || 0);
}

/**
 * Where the current wall-clock sits relative to a slot.
 *
 * `NOW` is deliberately a little generous (±15 min) so a lesson the teacher is
 * standing in front of still reads as "الآن" rather than flipping the moment
 * the minute hand moves.
 */
function slotStatus(startsAt: string, endsAt: string, now: Date): SlotStatus {
  const current = now.getHours() * 60 + now.getMinutes();
  const start = minutesOfDay(startsAt);
  const end = minutesOfDay(endsAt);
  if (current > end + 15) return "DONE";
  if (current >= start - 15 && current <= end + 15) return "NOW";
  return "UPCOMING";
}

/** Attendance rate over a window, as a 0–1 share. */
function rate(present: number, total: number): number {
  return total === 0 ? 0 : Math.round((present / total) * 1000) / 1000;
}

export interface TeacherOverview {
  classes: TeacherClass[];
  today: TimetableSlot[];
  /** Open lesson plans the teacher is still expected to finish. */
  plansByStatus: Record<PlanStatus, number>;
  /** Students across every class, for the "عدد طلابي" tile. */
  studentCount: number;
}

/**
 * The teacher's own classes with the two figures the cards advertise:
 * attendance (from real daily logs, last 28 days) and plan progress (from the
 * class row, which supervision updates as the term advances).
 */
export async function loadTeacherClasses(teacherId: string): Promise<TeacherClass[]> {
  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

  const classes = await prisma.schoolClass.findMany({
    where: { teacherId },
    orderBy: { gradeLevel: "asc" },
    include: {
      _count: { select: { enrollments: true, slots: true } },
      enrollments: { select: { studentId: true } },
      slots: { orderBy: [{ weekday: "asc" }, { startsAt: "asc" }] },
    },
  });

  const studentIds = classes.flatMap((row) =>
    row.enrollments.map((enrollment) => enrollment.studentId)
  );

  // One query for every log in the window, then aggregate in memory: a
  // per-class `count()` would be N round-trips for the same rows.
  const logs = studentIds.length
    ? await prisma.dailyLog.groupBy({
        by: ["studentId"],
        where: { studentId: { in: studentIds }, date: { gte: since } },
        _count: { _all: true },
      })
    : [];
  const attendanceByStudent = new Map(
    logs.map((row) => [row.studentId, row._count._all])
  );

  const presentLogs = studentIds.length
    ? await prisma.dailyLog.groupBy({
        by: ["studentId"],
        where: {
          studentId: { in: studentIds },
          date: { gte: since },
          attendance: true,
        },
        _count: { _all: true },
      })
    : [];
  const presentByStudent = new Map(
    presentLogs.map((row) => [row.studentId, row._count._all])
  );

  return classes.map((row) => {
    const mine = row.enrollments.map((enrollment) => enrollment.studentId);
    const totalLogs = mine.reduce(
      (sum, studentId) => sum + (attendanceByStudent.get(studentId) ?? 0),
      0
    );
    const present = mine.reduce(
      (sum, studentId) => sum + (presentByStudent.get(studentId) ?? 0),
      0
    );
    const next = row.slots[0];

    return {
      id: row.id,
      name: row.name,
      gradeLevel: row.gradeLevel,
      subject: row.subject,
      room: row.room ?? "—",
      students: row._count.enrollments,
      planProgress: row.planProgress / 100,
      attendanceRate: rate(present, totalLogs),
      nextLesson: next ? `${next.startsAt}` : "لا حصص مجدولة",
      weeklyLessons: row._count.slots,
    };
  });
}

/** The teacher's timetable for one weekday (defaults to today). */
export async function loadTeacherTimetable(
  teacherId: string,
  weekday = new Date().getDay(),
  now = new Date()
): Promise<TimetableSlot[]> {
  const slots = await prisma.timetableSlot.findMany({
    where: { teacherId, weekday },
    orderBy: { startsAt: "asc" },
    include: { class: { select: { name: true, gradeLevel: true, room: true } } },
  });

  return slots.map((slot) => ({
    id: slot.id,
    start: slot.startsAt,
    end: slot.endsAt,
    subject: slot.subject,
    gradeLevel: slot.class?.gradeLevel ?? "—",
    className: slot.class?.name ?? "—",
    room: slot.room ?? slot.class?.room ?? "—",
    // Practical blocks (science/IT) are the ones with a lab-shaped room name;
    // everything else is a normal lesson.
    kind: /مختبر|معمل|حاسوب/.test(slot.room ?? "") ? "activity" : "lesson",
    status: slotStatus(slot.startsAt, slot.endsAt, now),
  }));
}

export async function loadTeacherOverview(teacherId: string): Promise<TeacherOverview> {
  const [classes, today, planCounts] = await Promise.all([
    loadTeacherClasses(teacherId),
    loadTeacherTimetable(teacherId),
    prisma.lessonPlan.groupBy({
      by: ["status"],
      where: { authorId: teacherId },
      _count: { _all: true },
    }),
  ]);

  const plansByStatus: Record<PlanStatus, number> = {
    PENDING: 0,
    APPROVED: 0,
    REVISION: 0,
  };
  for (const row of planCounts) plansByStatus[row.status] = row._count._all;

  return {
    classes,
    today,
    plansByStatus,
    studentCount: classes.reduce((sum, row) => sum + row.students, 0),
  };
}

/**
 * Roster for one class: who is in it, whether they showed up today, their
 * average in the class's subject, and the guardian to call.
 *
 * The class must belong to `teacherId`, so the drill-down URL cannot be edited
 * to read another teacher's roster.
 */
export async function loadClassRoster(
  teacherId: string,
  classId: string
): Promise<{ className: string; students: ClassStudent[] } | null> {
  const schoolClass = await prisma.schoolClass.findFirst({
    where: { id: classId, teacherId },
    include: {
      enrollments: {
        include: {
          student: {
            include: { parent: { select: { fullName: true } } },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!schoolClass) return null;

  const studentIds = schoolClass.enrollments.map((row) => row.studentId);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const [todayLogs, performance] = await Promise.all([
    studentIds.length
      ? prisma.dailyLog.findMany({
          where: {
            studentId: { in: studentIds },
            date: { gte: startOfToday, lte: endOfToday },
          },
          orderBy: { date: "desc" },
        })
      : [],
    studentIds.length
      ? prisma.subjectPerformance.findMany({
          where: { studentId: { in: studentIds }, subject: schoolClass.subject },
        })
      : [],
  ]);

  const logByStudent = new Map(todayLogs.map((log) => [log.studentId, log]));
  const scoreByStudent = new Map(
    performance.map((row) => [row.studentId, row.score])
  );

  return {
    className: schoolClass.name,
    students: schoolClass.enrollments.map((row) => {
      const log = logByStudent.get(row.studentId);
      return {
        id: row.studentId,
        name: row.student.fullName,
        attendance: !log ? "PRESENT" : log.attendance ? (log.lateMinutes > 0 ? "LATE" : "PRESENT") : "ABSENT",
        score: scoreByStudent.get(row.studentId) ?? 0,
        guardian: row.student.parent.fullName,
        notes: log?.teacherNote ?? "",
      };
    }),
  };
}

/**
 * The teacher's grading load this week, derived from the homework recorded in
 * their classes' daily logs — the only place homework actually lives. `done`
 * items are the graded ones; the rest are still waiting on the teacher, so the
 * tile and the workload list can never contradict the logs they come from.
 */
export async function loadTeacherWorkload(
  teacherId: string,
  windowDays = 7
): Promise<{ total: number; graded: number; pending: number }> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const studentIds = (
    await prisma.schoolClass.findMany({
      where: { teacherId },
      select: { enrollments: { select: { studentId: true } } },
    })
  ).flatMap((row) => row.enrollments.map((enrollment) => enrollment.studentId));

  if (studentIds.length === 0) return { total: 0, graded: 0, pending: 0 };

  const logs = await prisma.dailyLog.findMany({
    where: { studentId: { in: studentIds }, date: { gte: since } },
    select: { homework: true },
  });

  let total = 0;
  let graded = 0;
  for (const log of logs) {
    if (!Array.isArray(log.homework)) continue;
    for (const entry of log.homework) {
      if (!entry || typeof entry !== "object") continue;
      if (typeof (entry as { title?: unknown }).title !== "string") continue;
      total += 1;
      if ((entry as { done?: unknown }).done === true) graded += 1;
    }
  }

  return { total, graded, pending: total - graded };
}

export interface TeacherStudio {
  /** Students of every class this teacher owns, for the attendance grid. */
  roster: RosterStudent[];
  /** Institution of the teacher's first class (the queue's tenant key). */
  institutionId: string;
  /** Distinct subjects the teacher actually teaches. */
  subjects: string[];
}

/**
 * Everything the shared AI tools need, scoped to one teacher: the roster of
 * their own classes, the tenant to file attendance under, and the subjects
 * they can generate quizzes for.
 */
export async function loadTeacherStudio(
  teacherId: string
): Promise<TeacherStudio> {
  const classes = await prisma.schoolClass.findMany({
    where: { teacherId },
    select: { id: true, subject: true, institutionId: true },
    orderBy: { gradeLevel: "asc" },
  });

  const enrollments = await prisma.enrollment.findMany({
    where: { class: { teacherId } },
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

  return {
    roster: enrollments.map((row) => ({
      id: row.student.id,
      name: row.student.fullName,
      gradeLevel: row.class?.gradeLevel ?? row.gradeLevel,
      guardian: row.student.parent.fullName,
    })),
    institutionId: classes[0]?.institutionId ?? "",
    subjects: [...new Set(classes.map((row) => row.subject))],
  };
}

export interface AttendanceBoard {
  id: string;
  name: string;
  subject: string;
  students: ClassStudent[];
}

/**
 * Every class the teacher owns, each with its full roster — the attendance
 * workspace renders one section per class, so grouping happens once here
 * instead of the page re-shaping three arrays.
 */
export async function loadTeacherAttendanceBoard(
  teacherId: string
): Promise<AttendanceBoard[]> {
  const classes = await prisma.schoolClass.findMany({
    where: { teacherId },
    orderBy: { gradeLevel: "asc" },
    select: { id: true, name: true, subject: true },
  });

  return Promise.all(
    classes.map(async (row) => ({
      ...row,
      students: (await loadClassRoster(teacherId, row.id))?.students ?? [],
    }))
  );
}

/** Subjects this teacher teaches → the classes in which they teach them. */
export async function loadTeacherAssignments(
  teacherId: string
): Promise<{ subject: string; classes: string[] }[]> {
  const classes = await prisma.schoolClass.findMany({
    where: { teacherId },
    select: { name: true, subject: true },
    orderBy: { name: "asc" },
  });

  const grouped = new Map<string, string[]>();
  for (const row of classes) {
    grouped.set(row.subject, [...(grouped.get(row.subject) ?? []), row.name]);
  }
  return [...grouped.entries()].map(([subject, list]) => ({
    subject,
    classes: list,
  }));
}
