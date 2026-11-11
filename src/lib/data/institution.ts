/**
 * Institution Portal — AI Teacher Studio view contracts (Design.md Prompt 4).
 *
 * The shapes here mirror what `src/lib/db/institution.ts` reads from
 * PostgreSQL (`Enrollment` / `Student`); the rows themselves never live in
 * this module. `QUIZ_DIFFICULTIES` is a UI option list (not data), and the
 * subject options arrive as props from the signed-in centre's own classes.
 */

export type CommissionStatus = "PENDING" | "VERIFIED" | "REJECTED";

export interface RosterStudent {
  id: string;
  name: string;
  gradeLevel: string;
  /** Primary APPROVED guardian, or "—" when no guardian account is linked. */
  guardian: string;
}

/**
 * One row of the centre's own student list (`/institution/students`).
 *
 * `status` is the operational seat state — never the commission state, which
 * lives on the financial screen alone. `source` distinguishes the centre's
 * intake from a platform referral.
 */
export interface InstitutionStudentRow {
  enrollmentId: string;
  studentId: string;
  name: string;
  gradeLevel: string;
  /** School class inside this centre, or null when not yet placed. */
  className: string | null;
  status: "ACTIVE" | "WITHDRAWN";
  source: "PLATFORM_REFERRAL" | "INSTITUTION";
  /** Primary APPROVED guardian, or "—" when none is linked yet. */
  guardian: string;
  /** YYYY-MM-DD */
  registeredAt: string;
}

export interface CommissionRow {
  id: string;
  studentName: string;
  centerName: string;
  gradeLevel: string;
  referralFee: number;
  status: CommissionStatus;
  /** YYYY-MM-DD */
  registeredAt: string;
}

/** Difficulty levels offered by the quiz generator (UI option list). */
export const QUIZ_DIFFICULTIES = ["سهل", "متوسط", "صعب"] as const;

/**
 * One pending guardianship request in the centre's approval queue.
 *
 * `originInstitutionId` is the centre whose code opened the request; null only
 * for rows written before phase 4.2 (there are none in the current data).
 */
export interface GuardianApprovalRow {
  grantId: string;
  linkId: string;
  institutionId: string;
  studentId: string;
  studentName: string;
  guardianName: string;
  guardianEmail: string;
  relation: string | null;
  /** ISO timestamp. */
  requestedAt: string;
  originInstitutionId: string | null;
}

/** One approved guardian of a student enrolled in this centre. */
export interface ApprovedGuardianRow {
  grantId: string;
  linkId: string;
  institutionId: string;
  studentName: string;
  guardianName: string;
  guardianEmail: string;
  isPrimary: boolean;
  /** ISO timestamp, or null for a legacy row without one. */
  approvedAt: string | null;
}
