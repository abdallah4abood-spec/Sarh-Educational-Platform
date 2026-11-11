import type { InstitutionStudentRow } from "@/lib/data/institution";
import { loadGuardianContactNames } from "@/lib/guardian-access";
import { acquireAdvisoryLock } from "@/lib/db/advisory-lock";
import {
  requireCapability,
  type InstitutionAccess,
} from "@/lib/institution-access";
import { prisma } from "@/lib/prisma";

/**
 * Institution student intake (`/institution/students`).
 *
 * Two rules shape everything here:
 *
 *   1. **Tenant first.** Every function takes an `InstitutionAccess` token
 *      produced by `resolveInstitutionAccess` from the database, and every
 *      query is keyed on `access.institutionId`. A class passed by the client
 *      is re-read with `institutionId` in the `where` clause, so a class id
 *      from another centre is indistinguishable from a non-existent one.
 *
 *   2. **No invented guardian.** A student created by a centre is written with
 *      `parentId = NULL` and **no** `StudentGuardian` row. The parent portal
 *      authorises exclusively through APPROVED links, so such a student is
 *      invisible to every family until a real linking flow (join codes /
 *      approval) exists. This module never fabricates a guardian account and
 *      never uses `parentId` as an authorisation fallback.
 *
 * `Enrollment.source = INSTITUTION` keeps these rows out of the referral
 * commission ledger, and `enrollmentStatus` answers "is the seat active?"
 * without overloading the payment field.
 *
 * Concurrency (no schema change): the duplicate rule is enforced under a
 * PostgreSQL **transaction-scoped advisory lock** keyed on the normalized
 * identity `(institution, name, dateOfBirth)`. Two identical submissions are
 * therefore serialised: the second one runs its duplicate check only after the
 * first has committed, so it sees the row and is refused. A second advisory
 * lock, keyed on the client's `Idempotency-Key`, serialises retries of the same
 * form submission. `hashtext` collisions can only over-serialise two unrelated
 * intakes; they can never let a duplicate through.
 */

/** Errors the route maps to HTTP status codes. */
export type InstitutionStudentErrorCode =
  | "CLASS_NOT_IN_INSTITUTION"
  | "DUPLICATE_STUDENT"
  | "INVALID_IDEMPOTENCY_KEY"
  | "INVALID_NAME"
  | "INVALID_DATE_OF_BIRTH"
  | "INVALID_GRADE_LEVEL";

export class InstitutionStudentError extends Error {
  constructor(
    readonly code: InstitutionStudentErrorCode,
    message: string
  ) {
    super(message);
    this.name = "InstitutionStudentError";
  }
}

export interface CreateInstitutionStudentInput {
  fullName: string;
  dateOfBirth: Date;
  gradeLevel: string;
  classId?: string | null;
  /**
   * Client-generated retry token, one per form submission. Optional: the
   * database-level duplicate rule does not depend on it.
   */
  idempotencyKey?: string | null;
}

export interface CreatedInstitutionStudent {
  studentId: string;
  enrollmentId: string;
  /** True when this answer replays an identical earlier submission. */
  replayed?: boolean;
}

/** Collapse whitespace so "أحمد  علي" and "أحمد علي" are one child. */
export function normalizeStudentName(value: string): string {
  return value.trim().replace(/\s+/g, " ").normalize("NFKC");
}

/** A date-only value the intake form can actually have produced. */
const EARLIEST_BIRTH = new Date("1990-01-01T00:00:00.000Z");

/**
 * Accepted `Idempotency-Key` shape: URL-safe, long enough to be unique, short
 * enough to be cheap to lock. Anything else is a client bug, not a retry.
 */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * In-process replay window for a repeated submission.
 *
 * This is a convenience for the same server process (double click, retry after
 * a dropped response). It is deliberately **not** the safety mechanism: the
 * durable guarantee is the advisory lock plus the duplicate check, which hold
 * across processes and restarts. Kept small and bounded so a long-lived server
 * cannot grow it without limit.
 */
const REPLAY_TTL_MS = 10 * 60 * 1000;
const REPLAY_LIMIT = 200;

interface ReplayEntry {
  at: number;
  fingerprint: string;
  result: { studentId: string; enrollmentId: string };
}

const replayCache = new Map<string, ReplayEntry>();

function replayScope(institutionId: string, idempotencyKey: string): string {
  // Scoped per tenant: the same token from two centres is two submissions.
  return `${institutionId}:${idempotencyKey}`;
}

function takeReplay(
  scope: string,
  fingerprint: string
): CreatedInstitutionStudent | null {
  const entry = replayCache.get(scope);
  if (!entry) return null;
  if (Date.now() - entry.at > REPLAY_TTL_MS) {
    replayCache.delete(scope);
    return null;
  }
  // Same token, different payload is not a retry: let the duplicate rule
  // decide instead of answering with someone else's ids.
  if (entry.fingerprint !== fingerprint) return null;
  return { ...entry.result, replayed: true };
}

function storeReplay(
  scope: string,
  fingerprint: string,
  result: { studentId: string; enrollmentId: string }
): void {
  if (replayCache.size >= REPLAY_LIMIT) {
    for (const [key, entry] of replayCache) {
      if (Date.now() - entry.at > REPLAY_TTL_MS) replayCache.delete(key);
    }
    const oldest = replayCache.keys().next();
    if (!oldest.done) replayCache.delete(oldest.value);
  }
  replayCache.set(scope, { at: Date.now(), fingerprint, result });
}

/**
 * The centre's students, newest first.
 *
 * Includes both institution-created rows and referrals, because this is the
 * operational list; the financial screen filters by `source` on its own.
 */
export async function loadInstitutionStudents(
  access: InstitutionAccess
): Promise<InstitutionStudentRow[]> {
  requireCapability(access, "students.read");

  const rows = await prisma.enrollment.findMany({
    where: { institutionId: access.institutionId },
    include: {
      student: { select: { id: true, fullName: true } },
      class: { select: { name: true, gradeLevel: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });

  const guardians = await loadGuardianContactNames(
    rows.map((row) => row.studentId),
    access.institutionId
  );

  return rows.map((row) => ({
    enrollmentId: row.id,
    studentId: row.student.id,
    name: row.student.fullName,
    gradeLevel: row.class?.gradeLevel ?? row.gradeLevel,
    className: row.class?.name ?? null,
    status: row.enrollmentStatus,
    source: row.source,
    guardian: guardians.get(row.studentId) ?? "—",
    registeredAt: row.createdAt.toISOString().slice(0, 10),
  }));
}

/** Classes of this centre — the only ones the intake form may offer. */
export async function loadInstitutionClassOptions(
  access: InstitutionAccess
): Promise<{ id: string; name: string; gradeLevel: string; subject: string }[]> {
  requireCapability(access, "students.write");

  return prisma.schoolClass.findMany({
    where: { institutionId: access.institutionId },
    select: { id: true, name: true, gradeLevel: true, subject: true },
    orderBy: [{ gradeLevel: "asc" }, { name: "asc" }],
  });
}

/**
 * Create one student and their seat in the centre, atomically.
 *
 * Duplicate rule (approved for this phase): one enrollment per
 * `(studentId, institutionId)` is the business invariant, but the database
 * does **not** carry a unique index yet — the current model has one `classId`
 * per enrollment and does not represent multi-class membership, so the
 * constraint is enforced here, in the service, and can be tightened later
 * without a rollback. Because this entry point always creates a *new* student,
 * the practical duplicate is the same child entered twice; that is caught by
 * a case-insensitive `(institution, fullName, dateOfBirth)` check inside the
 * same transaction, and the check is serialised by an advisory lock so two
 * simultaneous requests cannot both pass it.
 *
 * The name/date match is a **duplicate guard, not an identity proof**: a
 * genuine twin with the same name and birthday is refused here and has to be
 * resolved by a human, which is the safe direction to be wrong in.
 *
 * Withdrawing a seat (`enrollmentStatus = WITHDRAWN`) is not exposed yet; the
 * duplicate rule still sees the withdrawn row, so re-admitting a child is a
 * deliberate future decision rather than an accidental second enrollment.
 *
 * No guardian account, no `StudentGuardian` row, no commission, and no
 * `parentId` are invented.
 */
export async function createInstitutionStudent(
  access: InstitutionAccess,
  input: CreateInstitutionStudentInput
): Promise<CreatedInstitutionStudent> {
  requireCapability(access, "students.write");

  const fullName = normalizeStudentName(input.fullName);
  if (fullName.length < 2) {
    throw new InstitutionStudentError(
      "INVALID_NAME",
      "اسم الطالب قصير جداً"
    );
  }

  const gradeLevel = input.gradeLevel.trim();
  if (gradeLevel.length === 0 || gradeLevel.length > 40) {
    throw new InstitutionStudentError(
      "INVALID_GRADE_LEVEL",
      "الصف الدراسي غير صالح"
    );
  }

  const dateOfBirth = input.dateOfBirth;
  if (
    Number.isNaN(dateOfBirth.getTime()) ||
    dateOfBirth < EARLIEST_BIRTH ||
    dateOfBirth.getTime() > Date.now()
  ) {
    throw new InstitutionStudentError(
      "INVALID_DATE_OF_BIRTH",
      "تاريخ الميلاد غير صالح"
    );
  }

  const classId = input.classId?.trim() || null;

  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey && !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new InstitutionStudentError(
      "INVALID_IDEMPOTENCY_KEY",
      "مفتاح إعادة المحاولة غير صالح"
    );
  }

  const birthDay = dateOfBirth.toISOString().slice(0, 10);
  const scope = idempotencyKey
    ? replayScope(access.institutionId, idempotencyKey)
    : null;
  // What a replay must match: the same token with a different payload is a new
  // request, not a retry.
  const fingerprint = [fullName, birthDay, gradeLevel, classId ?? ""].join("\u0000");
  const identityKey = `intake-identity:${access.institutionId}:${fullName.toLowerCase()}:${birthDay}`;

  const outcome = await prisma.$transaction(async (tx) => {
    // 1. Serialise retries of the same submission, then answer from the replay
    //    window if this exact payload already succeeded here.
    if (idempotencyKey && scope) {
      await acquireAdvisoryLock(tx, `intake-retry:${scope}`);
      const replay = takeReplay(scope, fingerprint);
      if (replay) return { result: replay, fresh: false as const };
    }

    // 2. Serialise submissions of the same child. Acquired *before* the
    //    duplicate read, so the second transaction sees the first's committed
    //    row instead of racing it.
    await acquireAdvisoryLock(tx, identityKey);

    if (idempotencyKey && scope) {
      // Another request with this token may have committed while we waited.
      const replay = takeReplay(scope, fingerprint);
      if (replay) return { result: replay, fresh: false as const };
    }

    // Re-read the class inside the tenant scope: an id from another centre
    // must behave exactly like an unknown id.
    let resolvedGrade = gradeLevel;
    if (classId) {
      const schoolClass = await tx.schoolClass.findFirst({
        where: { id: classId, institutionId: access.institutionId },
        select: { gradeLevel: true },
      });
      if (!schoolClass) {
        throw new InstitutionStudentError(
          "CLASS_NOT_IN_INSTITUTION",
          "الفصل المحدد لا يتبع هذه المؤسسة"
        );
      }
      // The class owns the authoritative grade label.
      resolvedGrade = schoolClass.gradeLevel;
    }

    const duplicate = await tx.enrollment.findFirst({
      where: {
        institutionId: access.institutionId,
        student: {
          is: {
            fullName: { equals: fullName, mode: "insensitive" },
            dateOfBirth,
          },
        },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new InstitutionStudentError(
        "DUPLICATE_STUDENT",
        "يوجد تسجيل مطابق لهذا الطالب في المؤسسة"
      );
    }

    const student = await tx.student.create({
      data: {
        fullName,
        dateOfBirth,
        // Explicitly null: the centre is not the guardian, and no account is
        // invented to satisfy a column.
        parentId: null,
      },
      select: { id: true },
    });

    const enrollment = await tx.enrollment.create({
      data: {
        studentId: student.id,
        institutionId: access.institutionId,
        gradeLevel: resolvedGrade,
        classId,
        // Operational intake carries no referral commission.
        commissionFee: 0,
        // `status` is the commission state and is intentionally left at its
        // default; `enrollmentStatus` is what the portal displays.
        source: "INSTITUTION",
        enrollmentStatus: "ACTIVE",
      },
      select: { id: true },
    });

    return {
      result: { studentId: student.id, enrollmentId: enrollment.id },
      fresh: true as const,
    };
  }, { timeout: 15_000, maxWait: 10_000 });

  // Recorded only after the write is committed, so a rollback can never leave
  // the replay window pointing at ids that do not exist.
  if (outcome.fresh && scope) {
    storeReplay(scope, fingerprint, outcome.result);
  }
  return outcome.result;
}
