import Dexie, { type Table } from "dexie";

/**
 * SARH (صَرْح) — IndexedDB layer via Dexie.
 *
 * Offline-first contract (Agent.md §7 / Design.md Prompt 3):
 * attendance and daily-log writes land here **immediately**, then a
 * background queue flushes them to the API as soon as connectivity returns.
 */

export type SyncState = "pending" | "syncing" | "synced" | "failed";

/** A pending attendance mutation captured while the device was offline. */
export interface AttendanceMutation {
  id?: number;
  studentId: string;
  institutionId: string;
  /** ISO date (YYYY-MM-DD) of the school day. */
  date: string;
  present: boolean;
  note?: string | null;
  photoDataUrl?: string | null;
  createdAt: number;
  syncState: SyncState;
  retryCount: number;
  lastError?: string | null;
}

/** Cached server-side daily log so the feed renders without a network. */
export interface CachedDailyLog {
  id: string;
  studentId: string;
  institutionId: string;
  date: string;
  attendance: boolean;
  dayPlan: string | null;
  activityPhotos: string[];
  pickupPerson: string | null;
  aiSummary: string | null;
  gradesJson: unknown | null;
  cachedAt: number;
}

/** Cached student profile for the child switcher (works fully offline). */
export interface CachedStudent {
  id: string;
  fullName: string;
  /** "KINDERGARTEN" | "EDUCATIONAL_CENTER" — drives the feed mode. */
  tier: string;
  parentId: string;
  institutionName?: string | null;
  cachedAt: number;
}

class SarhOfflineDB extends Dexie {
  attendance!: Table<AttendanceMutation, number>;
  dailyLogs!: Table<CachedDailyLog, string>;
  students!: Table<CachedStudent, string>;

  constructor() {
    super("sarh-offline");

    this.version(1).stores({
      attendance: "++id, studentId, institutionId, date, syncState, [studentId+date]",
      dailyLogs: "id, studentId, date, [studentId+date]",
      students: "id, parentId, tier",
    });
  }
}

export const db = new SarhOfflineDB();

/** Number of mutations still waiting to reach the server. */
export async function pendingSyncCount(): Promise<number> {
  return db.attendance.where("syncState").anyOf("pending", "failed", "syncing").count();
}

/** Clear all local caches — used on logout so no student data lingers. */
export async function clearOfflineCache(): Promise<void> {
  await Promise.all([db.students.clear(), db.dailyLogs.clear(), db.attendance.clear()]);
}
