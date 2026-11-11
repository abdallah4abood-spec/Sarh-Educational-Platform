"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldOff, X } from "lucide-react";

/**
 * Withdraw one APPROVED grant for THIS centre only.
 *
 * Revocation is irreversible from the UI's point of view (a new code + a new
 * decision are needed to reopen it), so it takes a second click. The server
 * refuses anything that is no longer APPROVED and scopes the write to the
 * caller's centre; this component never sends a link id.
 */
export function RevokeGrantAction({
  grantId,
  institutionId,
  studentName,
}: {
  grantId: string;
  institutionId: string;
  studentName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function revoke() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/institution/guardians/grants/${encodeURIComponent(grantId)}/revoke`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ institutionId }),
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.message ?? "تعذّر سحب المنحة");
      }
      setConfirming(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof TypeError
          ? "تعذّر الوصول إلى الخادم — تحقق من الاتصال"
          : caught instanceof Error && caught.message
            ? caught.message
            : "تعذّر سحب المنحة"
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`سحب منحة ولي أمر الطالب ${studentName}`}
          className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-rose-600 ring-1 ring-inset ring-rose-300 transition hover:bg-rose-50 dark:text-rose-400 dark:ring-rose-500/40 dark:hover:bg-rose-500/10"
        >
          <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
          سحب
        </button>
        {error ? (
          <p role="alert" className="max-w-44 text-center text-[10px] font-bold text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => void revoke()}
          className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          تأكيد السحب
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(false)}
          className="inline-flex items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-bold text-sarh-inkMute dark:text-slate-400 hover:underline"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          تراجع
        </button>
      </div>
      {error ? (
        <p role="alert" className="max-w-44 text-center text-[10px] font-bold text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
