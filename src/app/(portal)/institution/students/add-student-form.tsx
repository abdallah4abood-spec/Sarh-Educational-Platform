"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

/**
 * Institution intake form.
 *
 * Success is only shown after the API answered `201` — the student and the
 * enrollment are written in one transaction server-side, so a green message
 * can never appear for a half-saved row. The class list arrives from the
 * server already scoped to this centre; the handler still re-validates it.
 *
 * Every submission carries an `Idempotency-Key` that is generated once per
 * form fill-in: a double click or a retry after a dropped response answers
 * `200` with the original ids (`replayed: true`) instead of `409`, and can
 * never create a second student. The key is rotated after a success, so the
 * next child is a genuinely new submission.
 */

/** URL-safe, unique enough to survive a reload of the same form. */
function newIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
export function AddStudentForm({
  institutionId,
  classes,
}: {
  institutionId: string;
  classes: { id: string; name: string; gradeLevel: string; subject: string }[];
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [classId, setClassId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [replayed, setReplayed] = useState(false);
  const idempotencyKey = useRef(newIdempotencyKey());

  const selectedClass = classes.find((entry) => entry.id === classId);
  const effectiveGrade = selectedClass?.gradeLevel ?? gradeLevel;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    setReplayed(false);
    try {
      const response = await fetch("/api/institution/students", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Retries of this exact submission replay instead of duplicating.
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify({
          institutionId,
          fullName,
          dateOfBirth,
          gradeLevel: effectiveGrade,
          ...(classId ? { classId } : {}),
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { message?: string; replayed?: boolean }
        | null;

      // 201 = new row, 200 = the same submission replayed. Anything else is a
      // real failure and must not show a success message.
      if (response.status !== 201 && response.status !== 200) {
        throw new Error(payload?.message ?? "تعذّر حفظ الطالب");
      }

      setReplayed(payload?.replayed === true);
      setSaved(true);
      setFullName("");
      setDateOfBirth("");
      setGradeLevel("");
      setClassId("");
      idempotencyKey.current = newIdempotencyKey();
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "تعذّر حفظ الطالب — تحقق من الاتصال وحاول مجدداً."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-sarh-navy dark:text-slate-200">
            اسم الطالب
          </span>
          <input
            type="text"
            required
            minLength={2}
            maxLength={120}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="الاسم الكامل"
            className="sarh-input"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-sarh-navy dark:text-slate-200">
            تاريخ الميلاد
          </span>
          <input
            type="date"
            required
            value={dateOfBirth}
            onChange={(event) => setDateOfBirth(event.target.value)}
            className="sarh-input"
            dir="ltr"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-sarh-navy dark:text-slate-200">
            الصف الدراسي
          </span>
          <input
            type="text"
            required
            maxLength={40}
            value={effectiveGrade}
            onChange={(event) => setGradeLevel(event.target.value)}
            disabled={Boolean(selectedClass)}
            placeholder="مثال: الصف الخامس"
            className="sarh-input disabled:opacity-70"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-sarh-navy dark:text-slate-200">
            الفصل (اختياري)
          </span>
          <select
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            className="sarh-input"
          >
            <option value="">بدون فصل بعد</option>
            {classes.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name} — {entry.gradeLevel}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p role="alert" className="text-xs font-bold text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-xs font-bold text-sarh-tealDeep dark:text-sarh-teal">
          {replayed
            ? "تم حفظ هذا الطالب مسبقاً — لم يُنشأ سجل مكرر."
            : "تم حفظ الطالب وتسجيله في المؤسسة."}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-sarh-tealInk px-4 py-2.5 text-xs font-bold text-white shadow-teal-glow disabled:cursor-not-allowed disabled:opacity-60"
      >
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        {saving ? "جارٍ الحفظ…" : "إضافة طالب"}
      </button>
    </form>
  );
}
