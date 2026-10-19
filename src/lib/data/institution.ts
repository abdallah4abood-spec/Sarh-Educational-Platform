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
  guardian: string;
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
