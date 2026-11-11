"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  Check,
  Clock,
  Link2,
  Loader2,
  MailPlus,
  RotateCw,
  Send,
} from "lucide-react";

import type { StaffRole } from "@prisma/client";

import type { StaffInvitationRow } from "@/lib/db/staff-invitations";

/**
 * Staff-invitation manager — shared by the institution roster and D6.
 *
 * One component, one set of endpoints-per-caller: the institution page passes
 * its own routes and the roles the caller may offer; the SUPER_ADMIN page (D6)
 * passes its routes and a single fixed `CENTER_ADMIN` role. The component never
 * decides what may be invited — it renders the list the server already computed
 * and posts the choice; the server re-validates the role against the inviter's
 * kind and never trusts this form.
 *
 * Sending is not optimistic: the row appears only after the server answers, and
 * the panel reports `emailSent` exactly as the API returned it. When the mail
 * provider is unavailable the API includes the acceptance path, and it is shown
 * here as a copyable link instead of a success message.
 */

interface RoleOption {
  value: StaffRole;
  label: string;
}

export interface InvitationManagerProps {
  institutionId: string;
  /** Collection endpoint: GET list, POST invite. */
  createEndpoint: string;
  /** Item endpoint, `{id}` replaced with the invitation id. */
  itemEndpoint: string;
  /** Roles this caller may offer. Empty is never sent by the server. */
  roles: RoleOption[];
  invitations: StaffInvitationRow[];
  description: string;
}

const STATUS_LABEL: Record<StaffInvitationRow["status"], string> = {
  PENDING: "بانتظار القبول",
  ACCEPTED: "مقبولة",
  REVOKED: "مسحوبة",
  EXPIRED: "منتهية",
};

const STATUS_CLASS: Record<StaffInvitationRow["status"], string> = {
  PENDING: "border-sarh-teal/30 bg-sarh-teal/10 text-sarh-tealInk",
  ACCEPTED: "border-sarh-teal/30 bg-sarh-teal/10 text-sarh-tealInk",
  REVOKED: "border-sarh-rose/30 bg-sarh-rose/10 text-sarh-roseInk",
  EXPIRED: "border-sarh-slate/30 bg-sarh-slate/10 text-sarh-inkMute",
};

const STATUS_ICON = {
  PENDING: Clock,
  ACCEPTED: Check,
  REVOKED: Ban,
  EXPIRED: Clock,
} as const;

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}

export function StaffInvitationManager({
  institutionId,
  createEndpoint,
  itemEndpoint,
  roles,
  invitations,
  description,
}: InvitationManagerProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [subjects, setSubjects] = useState("");
  const [role, setRole] = useState<StaffRole>(roles[0]?.value ?? "TEACHER");
  const [busy, setBusy] = useState<"create" | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fallbackPath, setFallbackPath] = useState<string | null>(null);
  const inFlight = useRef(false);

  const itemUrl = (id: string) =>
    itemEndpoint.replace("{id}", encodeURIComponent(id));

  async function readMessage(response: Response): Promise<string | null> {
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;
    return payload?.message ?? null;
  }

  async function createInvitation() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy("create");
    setError(null);
    setNotice(null);
    setFallbackPath(null);

    try {
      const response = await fetch(createEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institutionId,
          email,
          role,
          ...(title.trim() ? { title: title.trim() } : {}),
          ...(subjects.trim()
            ? {
                subjects: subjects
                  .split(/[,،]/)
                  .map((value) => value.trim())
                  .filter(Boolean),
              }
            : {}),
        }),
      });

      if (!response.ok) {
        throw new Error((await readMessage(response)) ?? "تعذّر إنشاء الدعوة");
      }

      const payload = (await response.json().catch(() => null)) as
        | { emailSent?: boolean; acceptPath?: string }
        | null;

      if (payload?.emailSent === false) {
        // The API never claims a message went out when it did not.
        setNotice("أُنشئت الدعوة، لكن تعذّر إرسال البريد — انسخ الرابط وشاركه مباشرة:");
        setFallbackPath(payload.acceptPath ?? null);
      } else {
        setNotice("أُرسلت الدعوة بالبريد إلى العنوان المحدد.");
      }

      setEmail("");
      setTitle("");
      setSubjects("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof TypeError
          ? "تعذّر الوصول إلى الخادم — تحقق من الاتصال وحاول مجدداً"
          : caught instanceof Error && caught.message
            ? caught.message
            : "تعذّر إنشاء الدعوة"
      );
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  async function act(id: string, action: "resend" | "revoke") {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(id);
    setError(null);
    setNotice(null);
    setFallbackPath(null);

    try {
      const response = await fetch(itemUrl(id), {
        method: action === "revoke" ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "revoke" ? undefined : JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(
          (await readMessage(response)) ??
            (action === "revoke" ? "تعذّر سحب الدعوة" : "تعذّر إعادة الإرسال")
        );
      }

      if (action === "revoke") {
        setNotice("سُحبت الدعوة. الرابط السابق لم يعد صالحاً.");
      } else {
        const payload = (await response.json().catch(() => null)) as
          | { emailSent?: boolean; acceptPath?: string }
          | null;
        if (payload?.emailSent === false) {
          setNotice("أُعيد توليد الرابط، لكن تعذّر إرسال البريد — انسخه وشاركه:");
          setFallbackPath(payload.acceptPath ?? null);
        } else {
          setNotice("أُعيد إرسال الدعوة برابط جديد، والرابط القديم لم يعد صالحاً.");
        }
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof TypeError
          ? "تعذّر الوصول إلى الخادم — تحقق من الاتصال وحاول مجدداً"
          : caught instanceof Error && caught.message
            ? caught.message
            : "تعذّر تنفيذ الطلب"
      );
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  const canSubmit = email.trim().length > 3 && busy === null && roles.length > 0;

  return (
    <div className="space-y-4">
      <p className="text-sm leading-7 text-sarh-inkMute dark:text-slate-300">
        {description}
      </p>

      {roles.length > 0 ? (
        <form
          className="grid gap-3 rounded-2xl border border-sarh-navy/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void createInvitation();
          }}
        >
          <label className="space-y-1 text-xs font-semibold text-sarh-inkMute">
            البريد الإلكتروني
            <input
              type="email"
              required
              dir="ltr"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-sarh-navy/15 bg-white px-3 py-2 text-sm text-sarh-navy outline-none focus:border-sarh-teal dark:border-white/15 dark:bg-sarh-navy dark:text-white"
              placeholder="name@example.com"
            />
          </label>

          <label className="space-y-1 text-xs font-semibold text-sarh-inkMute">
            الدور
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as StaffRole)}
              disabled={roles.length === 1}
              className="w-full rounded-xl border border-sarh-navy/15 bg-white px-3 py-2 text-sm text-sarh-navy outline-none focus:border-sarh-teal disabled:opacity-70 dark:border-white/15 dark:bg-sarh-navy dark:text-white"
            >
              {roles.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-semibold text-sarh-inkMute">
            المنصب الظاهر (اختياري)
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-xl border border-sarh-navy/15 bg-white px-3 py-2 text-sm text-sarh-navy outline-none focus:border-sarh-teal dark:border-white/15 dark:bg-sarh-navy dark:text-white"
              placeholder="معلمة رياضيات"
            />
          </label>

          <label className="space-y-1 text-xs font-semibold text-sarh-inkMute">
            التخصصات (اختياري، مفصولة بفاصلة)
            <input
              type="text"
              value={subjects}
              onChange={(event) => setSubjects(event.target.value)}
              className="w-full rounded-xl border border-sarh-navy/15 bg-white px-3 py-2 text-sm text-sarh-navy outline-none focus:border-sarh-teal dark:border-white/15 dark:bg-sarh-navy dark:text-white"
              placeholder="رياضيات، فيزياء"
            />
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-xl bg-sarh-tealInk px-4 py-2 text-sm font-bold text-white shadow-teal-glow transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "create" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <MailPlus className="h-4 w-4" aria-hidden="true" />
              )}
              إرسال دعوة
            </button>
          </div>
        </form>
      ) : null}

      <div aria-live="polite" className="space-y-2">
        {error ? (
          <p className="rounded-xl border border-sarh-rose/30 bg-sarh-rose/10 px-3 py-2 text-xs font-semibold text-sarh-roseInk">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-xl border border-sarh-gold/40 bg-sarh-gold/10 px-3 py-2 text-xs font-semibold text-sarh-navy dark:text-white">
            {notice}
          </p>
        ) : null}
        {fallbackPath ? (
          <p
            dir="ltr"
            className="flex items-start gap-2 overflow-x-auto rounded-xl border border-sarh-navy/15 bg-white px-3 py-2 text-[11px] text-sarh-navy dark:border-white/15 dark:bg-sarh-navy dark:text-white"
          >
            <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <code className="break-all">{fallbackPath}</code>
          </p>
        ) : null}
      </div>

      <ul className="space-y-2">
        {invitations.length === 0 ? (
          <li className="rounded-xl border border-dashed border-sarh-navy/15 px-4 py-6 text-center text-xs text-sarh-inkMute dark:border-white/15">
            لا توجد دعوات بعد.
          </li>
        ) : (
          invitations.map((invitation) => {
            const Icon = STATUS_ICON[invitation.status];
            const pending = invitation.status === "PENDING";
            return (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sarh-navy/10 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/5"
              >
                <div className="min-w-0">
                  <p dir="ltr" className="truncate text-sm font-bold text-sarh-navy dark:text-white">
                    {invitation.email}
                  </p>
                  <p className="mt-0.5 text-[11px] text-sarh-inkMute dark:text-slate-400">
                    {invitation.roleLabel} · {invitation.title} · تنتهي{" "}
                    {formatDate(invitation.expiresAt)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold ${STATUS_CLASS[invitation.status]}`}
                  >
                    <Icon className="h-3 w-3" aria-hidden="true" />
                    {STATUS_LABEL[invitation.status]}
                  </span>

                  {invitation.status !== "ACCEPTED" ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void act(invitation.id, "resend")}
                      className="inline-flex items-center gap-1 rounded-lg border border-sarh-teal/40 px-2 py-1 text-[11px] font-bold text-sarh-tealInk transition hover:bg-sarh-teal/10 disabled:opacity-60"
                    >
                      {busy === invitation.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      ) : (
                        <RotateCw className="h-3 w-3" aria-hidden="true" />
                      )}
                      إعادة إرسال
                    </button>
                  ) : null}

                  {pending ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void act(invitation.id, "revoke")}
                      className="inline-flex items-center gap-1 rounded-lg border border-sarh-rose/40 px-2 py-1 text-[11px] font-bold text-sarh-roseInk transition hover:bg-sarh-rose/10 disabled:opacity-60"
                    >
                      <Ban className="h-3 w-3" aria-hidden="true" />
                      سحب
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ul>

      <p className="flex items-center gap-1.5 text-[11px] text-sarh-inkMute dark:text-slate-400">
        <Send className="h-3 w-3" aria-hidden="true" />
        الدعوة صالحة ٧ أيام، والقبول يتطلب تسجيل الدخول بالبريد نفسه بعد تأكيده.
      </p>
    </div>
  );
}
