"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

/**
 * Add-child form (parent portal).
 *
 * The submit persists through `/api/parent/students` — a real `Student` write
 * under the session's parent id — and then refreshes the server component so
 * the new child appears with its live enrollment state instead of a locally
 * invented row.
 */
export function AddChildForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/parent/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          ...(dateOfBirth ? { dateOfBirth } : {}),
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setFullName("");
      setDateOfBirth("");
      router.refresh();
    } catch {
      setError("تعذّر حفظ الطالب — تحقق من الاتصال وحاول مجدداً.");
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
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="الاسم الكامل"
            className="sarh-input"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-sarh-navy dark:text-slate-200">
            تاريخ الميلاد (اختياري)
          </span>
          <input
            type="date"
            value={dateOfBirth}
            onChange={(event) => setDateOfBirth(event.target.value)}
            className="sarh-input"
            dir="ltr"
          />
        </label>
      </div>

      {error ? (
        <p role="alert" className="text-xs font-bold text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-sarh-teal px-4 py-2.5 text-xs font-bold text-white shadow-teal-glow disabled:cursor-not-allowed disabled:opacity-60"
      >
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        {saving ? "جارٍ الحفظ…" : "إضافة طالب"}
      </button>
    </form>
  );
}
