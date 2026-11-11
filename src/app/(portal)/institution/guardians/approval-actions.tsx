"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";

/**
 * Approve or reject one pending guardianship request.
 *
 * Rejection needs a second click (an explicit confirmation) because it is a
 * decision the family sees; approval is one click. Both are optimistic-free:
 * the row is only removed after the server answers 200 and the page refreshes,
 * so a failed request never looks like a completed decision.
 *
 * The in-flight ref is convenience only. The server serialises decisions per
 * pair and refuses anything that is no longer PENDING, which is what actually
 * prevents a double click from deciding twice.
 */
export function ApprovalActions({
  linkId,
  institutionId,
  studentName,
}: {
  linkId: string;
  institutionId: string;
  studentName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"APPROVE" | "REJECT" | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function decide(decision: "APPROVE" | "REJECT") {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(decision);
    setError(null);
    try {
      const response = await fetch(
        `/api/institution/guardians/${encodeURIComponent(linkId)}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, institutionId }),
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.message ?? "تعذّر تنفيذ القرار");
      }
      setConfirmReject(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof TypeError
          ? "تعذّر الوصول إلى الخادم — تحقق من الاتصال وحاول مجدداً"
          : caught instanceof Error && caught.message
            ? caught.message
            : "تعذّر تنفيذ القرار"
      );
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void decide("APPROVE")}
          aria-label={`اعتماد ربط ولي أمر الطالب ${studentName}`}
          className="inline-flex items-center gap-1 rounded-xl bg-sarh-tealInk px-2.5 py-1.5 text-[11px] font-bold text-white shadow-teal-glow transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "APPROVE" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          اعتماد
        </button>

        {confirmReject ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void decide("REJECT")}
            className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "REJECT" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            تأكيد الرفض
          </button>
        ) : (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => setConfirmReject(true)}
            className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-rose-600 ring-1 ring-inset ring-rose-300 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-400 dark:ring-rose-500/40 dark:hover:bg-rose-500/10"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            رفض
          </button>
        )}

        {confirmReject ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => setConfirmReject(false)}
            className="text-[11px] font-bold text-sarh-inkMute dark:text-slate-400 hover:underline"
          >
            تراجع
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="max-w-52 text-center text-[10px] font-bold text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
