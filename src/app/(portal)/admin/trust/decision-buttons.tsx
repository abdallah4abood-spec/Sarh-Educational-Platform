"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Approve/reject action for one trust-queue row.
 *
 * The decision persists through `/api/admin/institutions/:id/trust` — a real
 * `Institution` update, the same write the Financial Centre's approval table
 * performs — and then refreshes the server component so the queue, the
 * institution register and the public directory all re-read the database
 * together instead of drifting apart.
 */
export function TrustDecisionButtons({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"VERIFIED" | "REJECTED" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(status: "VERIFIED" | "REJECTED") {
    setBusy(status);
    setError(null);
    try {
      const response = await fetch(`/api/admin/institutions/${id}/trust`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error(String(response.status));
      router.refresh();
    } catch {
      setError(`تعذّر حفظ قرار «${name}» — حاول مجدداً.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void decide("VERIFIED")}
        className="rounded-lg bg-sarh-teal px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-sarh-tealDeep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy === "VERIFIED" ? "جارٍ الاعتماد…" : "اعتماد"}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void decide("REJECTED")}
        className="rounded-lg border border-sarh-borderLight px-3 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sarh-borderDark dark:text-slate-300"
      >
        {busy === "REJECTED" ? "جارٍ الرفض…" : "رفض"}
      </button>
      {error ? (
        <span className="text-[10px] font-bold text-red-600 dark:text-red-400">
          {error}
        </span>
      ) : null}
    </span>
  );
}
