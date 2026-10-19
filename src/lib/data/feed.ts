/**
 * Parent Portal — Child Daily Feed contract (Design.md Prompt 3).
 *
 * This module owns the *shapes* and the calendar arithmetic; the rows
 * themselves come from `src/lib/db/parent.ts`, which reads PostgreSQL. What is
 * left here is what a database cannot supply: the `FeedDayLog` contract the
 * feed renders against, the weekday rules of the Palestinian school week, and
 * the `YYYY-MM-DD` key both sides agree on.
 */

export type AgeTier = "KINDERGARTEN" | "EDUCATIONAL_CENTER";

/** One child of the signed-in parent — drives the switcher + feed mode. */
export interface FeedChild {
  id: string;
  name: string;
  tier: AgeTier;
  institutionId: string;
  institutionName: string;
  gradeLevel: string;
}

export interface HomeworkItem {
  id: string;
  title: string;
  subject: string;
  done: boolean;
}

export interface ScoreEntry {
  subject: string;
  /** 0–100. */
  score: number;
  total: number;
}

export interface PickupPerson {
  name: string;
  relation: string;
  verified: boolean;
}

/** One day of one child, as the feed renders it. */
export interface FeedDayLog {
  id: string;
  childId: string;
  institutionId: string;
  /** YYYY-MM-DD */
  date: string;
  attendance: boolean;
  /** The day's programme as an ordered timeline ("08:00 — طابور صباحي"). */
  dayPlan: string[];
  /** Kindergarten vocabulary for the same timeline. */
  activities: string[];
  /** Public URLs of the day's photos (`DailyLog.activityPhotos`). */
  photos: string[];
  pickupPerson: PickupPerson | null;
  aiSummary: string | null;
  homework: HomeworkItem[];
  scores: ScoreEntry[];
}

/** Friday & Saturday are the weekend — no school log is produced. */
export function isSchoolDay(date: Date): boolean {
  const day = date.getDay(); // 0=Sun … 5=Fri, 6=Sat
  return day !== 5 && day !== 6;
}

/** Stable YYYY-MM-DD key in *local* time. */
export function dayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/** The 7 days of the week containing `anchor` (Saturday → Friday window). */
export function weekDays(anchor: Date): Date[] {
  const start = new Date(anchor);
  const weekday = start.getDay(); // 0=Sun
  // Shift back to Saturday (6) so the strip shows a full school week.
  const shift = (weekday + 1) % 7;
  start.setDate(start.getDate() - shift);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

const AR_WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function weekdayAr(date: Date): string {
  return AR_WEEKDAYS[date.getDay()];
}
