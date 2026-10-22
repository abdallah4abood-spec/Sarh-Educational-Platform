/**
 * Portal dashboards — view contracts (Design.md / Agent.md module map).
 *
 * Every dashboard in the platform is a *view* over these types; the rows come
 * from the `src/lib/db/*` loaders, which read PostgreSQL scoped to the
 * signed-in account. Nothing in this module is data.
 */

/* ------------------------------------------------------------------ */
/* Teacher portal                                                      */
/* ------------------------------------------------------------------ */

export type SlotStatus = "DONE" | "NOW" | "UPCOMING";

export interface TeacherClass {
  id: string;
  /** صف دراسي, e.g. الصف الأول أ */
  name: string;
  gradeLevel: string;
  subject: string;
  room: string;
  students: number;
  /** Share of the term's lessons delivered (0–1). */
  planProgress: number;
  /** Attendance average over the last four weeks (0–1). */
  attendanceRate: number;
  nextLesson: string;
  /** Weekly lesson slots. */
  weeklyLessons: number;
}

export interface TimetableSlot {
  id: string;
  start: string;
  end: string;
  subject: string;
  gradeLevel: string;
  className: string;
  room: string;
  /** `lesson` is a teaching slot, `activity` is a practical/lab block. */
  kind: "lesson" | "activity";
  status: SlotStatus;
}

export type StudentAttendance = "PRESENT" | "ABSENT" | "LATE";

export interface ClassStudent {
  id: string;
  name: string;
  attendance: StudentAttendance;
  /** Term average, 0–100. */
  score: number;
  guardian: string;
  notes: string;
}

/* ------------------------------------------------------------------ */
/* Supervisor portal                                                   */
/* ------------------------------------------------------------------ */

/** Mirrors the Prisma `PlanStatus` enum value-for-value. */
export type PlanStatus = "PENDING" | "APPROVED" | "REVISION";

export interface LessonPlan {
  id: string;
  teacherName: string;
  center: string;
  subject: string;
  gradeLevel: string;
  title: string;
  /** YYYY-MM-DD */
  submittedAt: string;
  status: PlanStatus;
  /** AI pre-check score for completeness, 0–100. */
  completeness: number;
}

export interface TeacherEvaluation {
  id: string;
  teacherName: string;
  center: string;
  subject: string;
  /** Overall performance score, 0–100. */
  score: number;
  /** Classroom visits completed this term. */
  visits: number;
  /** YYYY-MM-DD of the last visit. */
  lastVisit: string;
  trend: "up" | "flat" | "down";
}

export interface ScopedTeacher {
  id: string;
  name: string;
  center: string;
  subject: string;
  classes: number;
  /** Share of plans submitted on time (0–1). */
  planCompliance: number;
  score: number;
}

export interface QualitySignal {
  id: string;
  kind: "alert" | "achievement" | "info";
  title: string;
  detail: string;
  /** HH:MM today */
  at: string;
  center: string;
}

/* ------------------------------------------------------------------ */
/* Institution portal                                                  */
/* ------------------------------------------------------------------ */

export interface StaffRow {
  id: string;
  name: string;
  /** منصب داخل المركز — نص وصفي من `StaffMember.title`، وليس حكمًا للصلاحيات */
  role: string;
  subjects: string;
  classes: number;
  status: "ACTIVE" | "ON_LEAVE" | "PENDING_INVITE";
}

export interface DirectoryChecklistItem {
  id: string;
  label: string;
  done: boolean;
  hint: string;
}

/* ------------------------------------------------------------------ */
/* Admin portal                                                        */
/* ------------------------------------------------------------------ */

export interface ActivityPoint {
  day: string;
  value: number;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  /** Primary tier. */
  tier: string;
  /** Extra tiers granted to the same account. */
  extraTiers: string[];
  status: "ACTIVE" | "UNVERIFIED" | "SUSPENDED";
  /** YYYY-MM-DD */
  joinedAt: string;
}

export interface AdminInstitutionRow {
  id: string;
  name: string;
  type: "روضة أطفال" | "مركز تعليمي";
  zone: string;
  owner: string;
  rating: number;
  students: number;
  /** Verification state shown in the directory. */
  state: "VERIFIED" | "PENDING" | "SUSPENDED";
  /** Platform commission, ILS. */
  commission: number;
}

/* ------------------------------------------------------------------ */
/* Parent portal                                                       */
/* ------------------------------------------------------------------ */

export interface ParentAnnouncement {
  id: string;
  title: string;
  body: string;
  /** YYYY-MM-DD */
  date: string;
  center: string;
  kind: "holiday" | "schedule" | "meeting";
}

export interface SubjectPerformance {
  subject: string;
  /** Completion 0–100. */
  percent: number;
}
