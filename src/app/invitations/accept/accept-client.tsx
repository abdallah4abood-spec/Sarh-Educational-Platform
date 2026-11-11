"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Check, Loader2, ShieldAlert } from "lucide-react";

/**
 * Accept-invitation button.
 *
 * Accepting is a deliberate click, never an automatic effect: a mail scanner
 * that pre-opens the link must not consume the invitation.
 *
 * After the server confirms, the session is refreshed with
 * `useSession().update({})`. That call is what rewrites the JWT cookie: the
 * server-side `jwt` callback re-reads the tiers from the database and ignores
 * anything this client sends, so the new TEACHER (or institution) tier appears
 * without signing out — and can only appear if the membership really exists.
 */
export function AcceptInvitationClient({ token }: { token: string }) {
  const router = useRouter();
  const { update } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function accept() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setDone(null);

    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { message?: string; accepted?: { role?: string } }
        | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "تعذّر قبول الدعوة");
      }

      const role = payload?.accepted?.role;
      setDone("تم قبول الدعوة وأصبحت عضواً في المركز.");

      // Rebuild the session from the database, then land on the right portal.
      try {
        await update({});
      } catch {
        // The membership exists regardless; a failed refresh only delays the
        // new portal key until the next sign-in.
      }
      router.refresh();
      router.push(role === "CENTER_ADMIN" ? "/institution" : role === "TEACHER" ? "/teacher" : "/");
    } catch (caught) {
      setError(
        caught instanceof TypeError
          ? "تعذّر الوصول إلى الخادم — تحقق من الاتصال وحاول مجدداً"
          : caught instanceof Error && caught.message
            ? caught.message
            : "تعذّر قبول الدعوة"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => void accept()}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sarh-tealInk px-4 py-3 text-sm font-bold text-white shadow-teal-glow transition disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="h-4 w-4" aria-hidden="true" />
        )}
        قبول الدعوة
      </button>

      <div aria-live="polite">
        {error ? (
          <p className="flex items-start gap-2 rounded-xl border border-sarh-rose/30 bg-sarh-rose/10 px-3 py-2 text-xs font-semibold text-sarh-roseInk">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}
        {done ? (
          <p className="rounded-xl border border-sarh-teal/30 bg-sarh-teal/10 px-3 py-2 text-xs font-semibold text-sarh-tealInk">
            {done}
          </p>
        ) : null}
      </div>
    </div>
  );
}
