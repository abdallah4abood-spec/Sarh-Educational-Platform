import { loadGuardianContactNames } from "@/lib/guardian-access";
import { prisma } from "@/lib/prisma";
import type { RosterStudent } from "@/lib/data/institution";
import type {
  ClassStudent,
  PlanStatus,
  SlotStatus,
  TeacherClass,
  TimetableSlot,
} from "@/lib/data/portal";
import type { TeacherScope } from "@/lib/teacher-access";

/**
 * Teacher-portal reads (`/teacher/**`) — the execution tier.
 *
 * Every function takes a `TeacherScope` (decision D5) instead of a bare
 * `teacherId`. The scope is produced by `resolveTeacherScope` from an ACTIVE
 * teaching membership and carries the one institution the caller is working
 * in, so **every** query here filters on both `teacherId` and `institutionId`.
 *
 * Why both: a class can be assigned to a teacher at a centre where their
 * membership has since lapsed. `teacherId` alone would still match that row —
 * assignment is not authorisation — so the institution is part of the `where`
 * on every read, including the relations that hang off it.
 *
 * There is deliberately no "all classes" query in this module: a teacher
 * portal that can render another teacher's roster is a data-leak, not a
 * feature.
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
export async function loadTeacherClasses(
  scope: TeacherScope
): Promise<TeacherClass[]> {
  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

  const classes = await prisma.schoolClass.findMany({
    where: {
      teacherId: scope.userId,
      institutionId: scope.institutionId,
    },
    orderBy: { gradeLevel: "asc" },
    include: {
      // Attendance and headcount describe the class as it is today: a
      // withdrawn seat keeps its history but leaves the class figures.
      _count: {
        select: {
          enrollments: { where: { enrollmentStatus: "ACTIVE" } },
          slots: true,
        },
      },
      enrollments: {
        where: { enrollmentStatus: "ACTIVE" },
        select: { studentId: true },
      },
      slots: { orderBy: [{ weekday: "asc" }, { startsAt: "asc" }] },
    },
  });

  const studentIds = classes.flatMap((row) =>
    row.enrollments.map((enrollment) => enrollment.studentId)
  );

  // Aggregate by (student, institution): the same pupil can sit in classes at
  // two centres, and one centre's logs must never feed the other's rate.
  const logs = studentIds.length
    ? await prisma.dailyLog.groupBy({
        by: ["studentId", "institutionId"],
        where: { studentId: { in: studentIds }, date: { gte: since } },
        _count: { _all: true },
      })
    : [];
  const attendanceByStudent = new Map(
    logs.map((row) => [
      `${row.studentId}:${row.institutionId}`,
      row._count._all,
    ])
  );

  const presentLogs = studentIds.length
    ? await prisma.dailyLog.groupBy({
        by: ["studentId", "institutionId"],
        where: {
          studentId: { in: studentIds },
          date: { gte: since },
          attendance: true,
        },
        _count: { _all: true },
      })
    : [];
  const presentByStudent = new Map(
    presentLogs.map((row) => [
      `${row.studentId}:${row.institutionId}`,
      row._count._all,
    ])
  );

  return classes.map((row) => {
    const mine = row.enrollments.map((enrollment) => enrollment.studentId);
    const totalLogs = mine.reduce(
      (sum, studentId) =>
        sum +
        (attendanceByStudent.get(`${studentId}:${row.institutionId}`) ?? 0),
      0
    );
    const present = mine.reduce(
      (sum, studentId) =>
        sum +
        (presentByStudent.get(`${studentId}:${row.institutionId}`) ?? 0),
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
  scope: TeacherScope,
  weekday = new Date().getDay(),
  now = new Date()
): Promise<TimetableSlot[]> {
  const slots = await prisma.timetableSlot.findMany({
    where: {
      teacherId: scope.userId,
      weekday,
      // Slots carry no institution of their own, so the class is the anchor.
      // A slot with no class cannot be attributed to a centre and is dropped
      // rather than shown in whichever one happens to be selected.
      class: { institutionId: scope.institutionId },
    },
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

export async function loadTeacherOverview(
  scope: TeacherScope
): Promise<TeacherOverview> {
  const [classes, today, planCounts] = await Promise.all([
    loadTeacherClasses(scope),
    loadTeacherTimetable(scope),
    prisma.lessonPlan.groupBy({
      by: ["status"],
      // A plan without an institution is not attributable to this centre; it
      // is excluded rather than counted on a screen that claims this scope.
      where: {
        authorId: scope.userId,
        institutionId: scope.institutionId,
      },
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
  scope: TeacherScope,
  classId: string
): Promise<{ className: string; students: ClassStudent[] } | null> {
  const schoolClass = await prisma.schoolClass.findFirst({
    // Assignment alone is not authorisation: the class must also sit in the
    // institution the caller's ACTIVE membership covers.
    where: {
      id: classId,
      teacherId: scope.userId,
      institutionId: scope.institutionId,
    },
    include: {
      enrollments: {
        // The roster behind attendance/grading is the current class; a
        // withdrawn student's logs stay in the database but are not a row the
        // teacher is asked to mark today.
        where: { enrollmentStatus: "ACTIVE" },
        include: { student: { select: { fullName: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!schoolClass) return null;

  const studentIds = schoolClass.enrollments.map((row) => row.studentId);
  const guardians = await loadGuardianContactNames(
    studentIds,
    schoolClass.institutionId
  );

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const [todayLogs, performance] = await Promise.all([
    studentIds.length
      ? prisma.dailyLog.findMany({
          where: {
            studentId: { in: studentIds },
            institutionId: schoolClass.institutionId,
            date: { gte: startOfToday, lte: endOfToday },
          },
          orderBy: { date: "desc" },
        })
      : [],
    studentIds.length
      ? prisma.subjectPerformance.findMany({
          where: {
            studentId: { in: studentIds },
            institutionId: schoolClass.institutionId,
            subject: schoolClass.subject,
          },
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
        // No approved guardian → "—"; the roster never assumes one exists.
        guardian: guardians.get(row.studentId) ?? "—",
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
  scope: TeacherScope,
  windowDays = 7
): Promise<{ total: number; graded: number; pending: number }> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const pairs = await prisma.schoolClass
    .findMany({
      where: {
        teacherId: scope.userId,
        institutionId: scope.institutionId,
      },
      select: {
        institutionId: true,
        enrollments: {
          where: { enrollmentStatus: "ACTIVE" },
          select: { studentId: true },
        },
      },
    })
    .then((classes) =>
      classes.flatMap((row) =>
        row.enrollments.map((enrollment) => ({
          studentId: enrollment.studentId,
          institutionId: row.institutionId,
        }))
      )
    );

  if (pairs.length === 0) return { total: 0, graded: 0, pending: 0 };

  const logs = await prisma.dailyLog.findMany({
    where: { OR: pairs, date: { gte: since } },
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
  /** Students of every class this teacher owns *in the scoped centre*. */
  roster: RosterStudent[];
  /**
   * The centre this payload belongs to — taken from the validated scope.
   * It is never derived from class ordering: a teacher with classes in two
   * centres must not have one centre's rows filed under the other's key.
   */
  institutionId: string;
  /** Distinct subjects the teacher actually teaches in this centre. */
  subjects: string[];
}

/**
 * Everything the shared AI tools need, scoped to one teacher: the roster of
 * their own classes, the tenant to file attendance under, and the subjects
 * they can generate quizzes for.
 */
export async function loadTeacherStudio(
  scope: TeacherScope
): Promise<TeacherStudio> {
  const classes = await prisma.schoolClass.findMany({
    where: {
      teacherId: scope.userId,
      institutionId: scope.institutionId,
    },
    select: { id: true, subject: true },
    orderBy: { gradeLevel: "asc" },
  });

  const enrollments = await prisma.enrollment.findMany({
    // The shared attendance grid only offers students the teacher can mark
    // in the centre the scope selected.
    where: {
      class: {
        teacherId: scope.userId,
        institutionId: scope.institutionId,
      },
      enrollmentStatus: "ACTIVE",
    },
    include: {
      student: { select: { id: true, fullName: true } },
      class: { select: { gradeLevel: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // A teacher can own classes at more than one centre. Contact names are
  // read from the selected tenant only, so a roster rendered for centre A can
  // never show a guardian whose grant exists only at centre B.
  const guardians = await loadGuardianContactNames(
    enrollments.map((row) => row.student.id),
    scope.institutionId
  );

  return {
    roster: enrollments.map((row) => ({
      id: row.student.id,
      name: row.student.fullName,
      gradeLevel: row.class?.gradeLevel ?? row.gradeLevel,
      guardian: guardians.get(row.student.id) ?? "—",
    })),
    institutionId: scope.institutionId,
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
  scope: TeacherScope
): Promise<AttendanceBoard[]> {
  const classes = await prisma.schoolClass.findMany({
    where: {
      teacherId: scope.userId,
      institutionId: scope.institutionId,
    },
    orderBy: { gradeLevel: "asc" },
    select: { id: true, name: true, subject: true },
  });

  return Promise.all(
    classes.map(async (row) => ({
      ...row,
      students: (await loadClassRoster(scope, row.id))?.students ?? [],
    }))
  );
}

/** Subjects this teacher teaches → the classes in which they teach them. */
export async function loadTeacherAssignments(
  scope: TeacherScope
): Promise<{ subject: string; classes: string[] }[]> {
  const classes = await prisma.schoolClass.findMany({
    where: {
      teacherId: scope.userId,
      institutionId: scope.institutionId,
    },
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
