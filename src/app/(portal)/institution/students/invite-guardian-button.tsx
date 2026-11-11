"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldOff,
} from "lucide-react";

import { Modal } from "@/components/ui/modal";

/**
 * Invite a guardian for one student.
 *
 * The dialog has two separate jobs, deliberately not merged:
 *
 *   • **Show the state.** Opening it only *reads* — does this student have a
 *     live code, and until when? A code cannot be displayed twice (only its
 *     digest is stored), so reopening must never pretend otherwise.
 *   • **Issue a new one.** That is an explicit click, and when a code is
 *     already live it needs a second confirmation, because issuing expires the
 *     previous code immediately.
 *
 * Every action button is disabled while a request is in flight and the handlers
 * are guarded by a ref, so a double click cannot fire two issues. That guard is
 * convenience only: the server serialises issuance per student with an advisory
 * lock, which is what actually guarantees one live code.
 */

interface IssuedCode {
  code: string;
  displayCode: string;
  expiresAt: string;
}

interface ActiveCode {
  active: boolean;
  expiresAt?: string;
}

/**
 * A rejected `fetch` (offline, server restarting) is a `TypeError` whose message
 * is browser English — never surface that in an Arabic dialog.
 */
function failureMessage(caught: unknown, fallback: string): string {
  if (caught instanceof TypeError) return fallback;
  return caught instanceof Error && caught.message ? caught.message : fallback;
}

function expiryLabel(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(date);
}

export function InviteGuardianButton({
  studentId,
  studentName,
  institutionId,
}: {
  studentId: string;
  studentName: string;
  institutionId: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<ActiveCode | null>(null);
  const [issued, setIssued] = useState<IssuedCode | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inFlight = useRef(false);

  const endpoint = `/api/institution/students/${encodeURIComponent(
    studentId
  )}/join-code`;
  const statusEndpoint = `${endpoint}?institution=${encodeURIComponent(
    institutionId
  )}`;

  /**
   * Read-only: never issues, never extends a code.
   *
   * Deliberately not behind the in-flight guard: a read is idempotent, and if a
   * previous issue is still settling the dialog must still learn the truth
   * rather than open blank.
   */
  async function loadStatus() {
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(statusEndpoint, {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | (ActiveCode & { message?: string })
        | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "تعذّر تحميل حالة الرمز");
      }
      setActive({
        active: payload?.active === true,
        expiresAt: payload?.expiresAt,
      });
    } catch (caught) {
      setError(
        failureMessage(caught, "تعذّر تحميل حالة الرمز — تحقق من الاتصال وحاول مجدداً")
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function openDialog() {
    // Opening is a read. It must not rotate a code the centre already handed to
    // a family, which is exactly what an unconditional POST here used to do.
    setOpen(true);
    setIssued(null);
    setConfirming(false);
    setError(null);
    setCopied(false);
    setActive(null);
    void loadStatus();
  }

  async function issue() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setConfirming(false);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (Partial<IssuedCode> & { message?: string })
        | null;

      if (response.status !== 201 || !payload?.code) {
        throw new Error(payload?.message ?? "تعذّر إنشاء رمز الدعوة");
      }

      setIssued({
        code: payload.code,
        displayCode: payload.displayCode ?? payload.code,
        expiresAt: payload.expiresAt ?? "",
      });
      setActive({ active: true, expiresAt: payload.expiresAt });
      setCopied(false);
    } catch (caught) {
      setError(
        failureMessage(caught, "تعذّر إنشاء رمز الدعوة — تحقق من الاتصال وحاول مجدداً")
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function revoke() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(payload?.message ?? "تعذّر إلغاء الرمز");
      }
      setIssued(null);
      setActive({ active: false });
      setCopied(false);
      setConfirming(false);
    } catch (caught) {
      setError(failureMessage(caught, "تعذّر إلغاء الرمز — تحقق من الاتصال وحاول مجدداً"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function copy() {
    if (!issued) return;
    // A failure from an earlier attempt must not outlive this one.
    setError(null);
    try {
      // Copy what is on screen, so a paste reads the same as the panel.
      await navigator.clipboard.writeText(issued.displayCode);
      setCopied(true);
    } catch {
      setError("تعذّر النسخ — انسخ الرمز يدوياً قبل الإغلاق.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={busy}
        aria-busy={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-sarh-teal/30 px-2.5 py-1.5 text-[11px] font-bold text-sarh-tealInk dark:text-sarh-teal transition-colors hover:bg-sarh-teal/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal disabled:cursor-not-allowed disabled:opacity-60"
      >
        <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
        دعوة
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`دعوة ولي أمر — ${studentName}`}
        closeLabel="إغلاق"
      >
        <div className="space-y-4" dir="rtl">
          {busy ? (
            <p className="flex items-center gap-2 text-sm text-sarh-inkMute dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {issued ? "جارٍ تنفيذ الطلب…" : "جارٍ التحقق من حالة الرمز…"}
            </p>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600 dark:bg-red-500/10 dark:text-red-400"
            >
              {error}
            </p>
          ) : null}

          {error && !busy && !issued ? (
            <button
              type="button"
              onClick={() => void loadStatus()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-600 dark:border-slate-600 dark:text-slate-300"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              إعادة المحاولة
            </button>
          ) : null}

          {issued ? (
            <div className="space-y-4">
              <p className="text-xs leading-6 text-slate-600 dark:text-slate-300">
                سلّم هذا الرمز لولي الأمر ليُدخله من بوابة الأهالي. يظهر{" "}
                <strong>مرة واحدة فقط</strong> ولا يمكن استرجاعه لاحقاً.
              </p>

              <div className="rounded-2xl border border-sarh-borderLight bg-sarh-mist/60 p-4 text-center dark:border-sarh-borderDark dark:bg-white/5">
                <code
                  dir="ltr"
                  className="select-all font-mono text-2xl font-bold tracking-[0.35em] text-sarh-navy dark:text-white"
                >
                  {issued.displayCode}
                </code>
                <p className="mt-2 text-[11px] text-sarh-inkMute dark:text-slate-400">
                  صالح حتى {expiryLabel(issued.expiresAt)} — استخدام واحد، ولطالب
                  واحد في هذا المركز.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copy()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sarh-tealInk px-3 py-2 text-xs font-bold text-white shadow-teal-glow focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal disabled:opacity-60"
                >
                  {copied ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  )}
                  {copied ? "تم النسخ" : "نسخ الرمز"}
                </button>
                <button
                  type="button"
                  onClick={() => void revoke()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300"
                >
                  <ShieldOff className="h-4 w-4" aria-hidden="true" />
                  إلغاء الرمز
                </button>
              </div>

              <p
                aria-live="polite"
                className="text-[11px] leading-5 text-sarh-inkMute dark:text-slate-400"
              >
                عند إدخال الرمز يُنشأ <strong>طلب ربط معلّق</strong>، ولا يرى ولي
                الأمر أي بيانات حتى تعتمده من صفحة «أولياء الأمور». الاعتماد يمنحه
                رؤية سجلات الطفل لدى جميع مراكزه المسجّل بها. إن أُغلقت هذه النافذة
                قبل النسخ، افتحها مرة أخرى لإصدار رمز جديد بعد تأكيد التحذير.
              </p>
            </div>
          ) : null}

          {!busy && !issued && active ? (
            active.active ? (
              confirming ? (
                <div className="space-y-3">
                  <div className="rounded-xl bg-amber-50 px-3 py-3 text-xs leading-6 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                    <p className="mb-1 flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                      سيتم إلغاء الرمز الحالي فوراً
                    </p>
                    <p>
                      الرمز النشط حالياً (صالح حتى{" "}
                      {expiryLabel(active.expiresAt)}) لن يعمل بعد هذه الخطوة.
                      أرسل الرمز الجديد لولي الأمر بعد ظهوره.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void issue()}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-sarh-goldInk px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                    >
                      تأكيد الإصدار
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      disabled={busy}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300"
                    >
                      تراجع
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                    يوجد رمز دعوة نشط لهذا الطالب، صالح حتى{" "}
                    <strong>{expiryLabel(active.expiresAt)}</strong>.
                  </p>
                  <p className="rounded-xl bg-sarh-teal/8 px-3 py-2 text-[11px] leading-5 text-slate-600 dark:bg-white/5 dark:text-slate-300">
                    لا يمكن عرض الرمز مرة أخرى بعد إغلاق النافذة — لم يُحفظ إلا
                    بصمته. إن لم يعد الرمز معك، أصدر رمزاً جديداً (سيُنهي الحالي).
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirming(true)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-sarh-gold/50 px-3 py-2 text-xs font-bold text-sarh-gold disabled:opacity-60"
                    >
                      <KeyRound className="h-4 w-4" aria-hidden="true" />
                      إصدار رمز جديد
                    </button>
                    {/* Revoking is still possible without issuing a replacement. */}
                    <button
                      type="button"
                      onClick={() => void revoke()}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300"
                    >
                      <ShieldOff className="h-4 w-4" aria-hidden="true" />
                      إلغاء الرمز الحالي
                    </button>
                  </div>
                </div>
              )
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-sarh-inkMute dark:text-slate-400">
                  لا يوجد رمز دعوة نشط لهذا الطالب.
                </p>
                <button
                  type="button"
                  onClick={() => void issue()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sarh-tealInk px-3 py-2 text-xs font-bold text-white shadow-teal-glow disabled:opacity-60"
                >
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                  إصدار رمز
                </button>
              </div>
            )
          ) : null}
        </div>
      </Modal>
    </>
  );
}
