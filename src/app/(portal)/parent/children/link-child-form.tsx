"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";

/**
 * Link a child with the code a centre issued.
 *
 * The form sends the **code only** — never a student id — so the request cannot
 * name someone else's child. A valid code links immediately; a code for a pair
 * that was rejected or revoked before comes back `PENDING` and waits for the
 * centre, which is shown honestly instead of pretending the link is live.
 */
export function LinkChildForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"APPROVED" | "PENDING" | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/parent/guardians/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { status?: "APPROVED" | "PENDING"; message?: string }
        | null;

      if (response.status !== 200 || !payload?.status) {
        throw new Error(payload?.message ?? "تعذّر ربط الطالب");
      }

      setResult(payload.status);
      setCode("");
      if (payload.status === "APPROVED") router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "تعذّر ربط الطالب — تحقق من الرمز وحاول مجدداً."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {/*
        Disclosure before the guardian sends anything: a code opens a request,
        and an approval is scoped to the centre that issued it. This is the
        same statement the institution sees when it decides.
      */}
      <p className="rounded-xl bg-sarh-gold/10 px-3 py-2.5 text-[11px] leading-5 text-slate-700 dark:bg-white/5 dark:text-slate-300">
        بإرسال الرمز يُنشأ <strong>طلب ربط</strong> يراجعه المركز، ولا ترى أي
        بيانات قبل موافقته. عند الموافقة ستحصل على وصول إلى سجلات الطفل في{" "}
        <strong>هذا المركز فقط</strong>؛ كل مركز آخر يحتاج موافقة مستقلة، وسحب
        منحة مركز لا يقطع وصولك إلى المراكز الأخرى.
      </p>

      <label className="block sm:max-w-sm">
        <span className="mb-1 block text-xs font-bold text-sarh-navy dark:text-slate-200">
          رمز الدعوة
        </span>
        <input
          type="text"
          required
          minLength={4}
          maxLength={40}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="XXXX-XXXX-XX"
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          className="sarh-input text-center font-mono tracking-[0.25em]"
        />
      </label>

      {error ? (
        <p role="alert" className="text-xs font-bold text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {result === "APPROVED" ? (
        <p
          role="status"
          className="text-xs font-bold text-sarh-tealDeep dark:text-sarh-teal"
        >
          تم ربط الطالب بحسابك — يظهر الآن بين أبنائك.
        </p>
      ) : null}

      {result === "PENDING" ? (
        <p
          role="status"
          className="text-xs font-bold text-amber-600 dark:text-amber-400"
        >
          أُرسل طلب الربط إلى المركز — يظهر وصول هذا المركز بعد اعتماده. يمكنك
          متابعة حالة الطلب في لوحة «طلبات الربط» أدناه.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl bg-sarh-tealInk px-4 py-2.5 text-xs font-bold text-white shadow-teal-glow disabled:cursor-not-allowed disabled:opacity-60"
      >
        <KeyRound className="h-4 w-4" aria-hidden="true" />
        {busy ? "جارٍ إرسال الطلب…" : "إرسال طلب الربط"}
      </button>
    </form>
  );
}
