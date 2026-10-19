import type { ReactNode } from "react";
import Link from "next/link";
import { getServerSession } from "next-auth";
import {
  ArrowLeft,
  BellRing,
  KeyRound,
  LogOut,
  MailCheck,
  ShieldCheck,
  UserCircle2,
} from "lucide-react";

import { Panel, PageHeader } from "@/components/portal/primitives";
import { StatusPill } from "@/components/portal/status-pill";
import { PORTAL_NOTIFICATIONS } from "@/components/portal/nav-config";
import { authOptions } from "@/lib/auth";
import { ROLE_DESCRIPTION, ROLE_LABEL, effectiveRoles, portalById, type PortalId } from "@/lib/roles";

/**
 * Settings screen shared by all five tiers.
 *
 * It is a *server* component on purpose: name, email, tiers and verification
 * state come from the session, so the page cannot display a value the account
 * does not actually hold. There are no fake preference toggles here — a switch
 * that writes nowhere is worse than no switch — only the controls that really
 * exist today (password reset, sign-out, and the notification feed this tier
 * genuinely receives), plus a slot for tier-specific blocks.
 */
export async function SettingsPanel({
  portalId,
  lead,
  children,
}: {
  portalId: PortalId;
  lead?: string;
  children?: ReactNode;
}) {
  const portal = portalById(portalId);
  const session = await getServerSession(authOptions);
  const roles = effectiveRoles(session?.user?.role, session?.user?.roles);
  const primary = session?.user?.role;
  const extra = roles.filter((role) => role !== primary);
  const notifications = PORTAL_NOTIFICATIONS[portalId];

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={[portal.caption, "الإعدادات"]}
        title="إعدادات الحساب"
        lead={
          lead ??
          "بيانات حسابك وصلاحياتك وإشعاراتك في هذه البوابة — تُقرأ مباشرة من قاعدة بيانات صَرْح."
        }
        icon={UserCircle2}
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Panel title="بيانات الحساب" icon={ShieldCheck} description="لا يمكن تعديلها من هنا">
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400">الاسم</dt>
              <dd className="font-bold text-sarh-navy dark:text-white">
                {session?.user?.name ?? "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400">البريد الإلكتروني</dt>
              <dd className="font-medium text-sarh-navy dark:text-slate-200" dir="ltr">
                {session?.user?.email ?? "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400">حالة البريد</dt>
              <dd>
                {session?.user?.emailVerified ? (
                  <StatusPill tone="teal" icon={MailCheck}>
                    موثّق
                  </StatusPill>
                ) : (
                  <StatusPill tone="gold">غير مفعّل</StatusPill>
                )}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400">الفئة الأساسية</dt>
              <dd className="text-end">
                <span className="block font-bold text-sarh-navy dark:text-white">
                  {primary ? ROLE_LABEL[primary] : "—"}
                </span>
                <span className="mt-0.5 block text-[11px] text-slate-400">
                  {primary ? ROLE_DESCRIPTION[primary] : ""}
                </span>
              </dd>
            </div>
            {extra.length > 0 ? (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">
                  صلاحيات إضافية
                </dt>
                <dd className="flex flex-wrap justify-end gap-1.5">
                  {extra.map((role) => (
                    <StatusPill key={role} tone="violet">
                      {ROLE_LABEL[role]}
                    </StatusPill>
                  ))}
                </dd>
              </div>
            ) : null}
          </dl>

          <p className="mt-4 rounded-xl bg-sarh-teal/8 px-3 py-3 text-xs leading-6 text-slate-600 dark:bg-white/5 dark:text-slate-300">
            للانتقال بين بواباتك دون تسجيل خروج، استخدم <strong>مبدّل البوابة</strong>{" "}
            في الشريط العلوي — ولا يظهر إلا للفئات التي يملكها حسابك فعلاً.
          </p>
        </Panel>

        <div className="space-y-5">
          <Panel title="الأمان" icon={KeyRound}>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="/auth/forgot-password"
                  className="flex items-center justify-between gap-2 rounded-xl border border-sarh-borderLight px-3 py-2.5 text-xs font-bold text-sarh-navy transition-colors hover:border-sarh-teal/50 hover:bg-sarh-teal/5 dark:border-sarh-borderDark dark:text-slate-200"
                >
                  تغيير كلمة المرور
                  <ArrowLeft className="h-3.5 w-3.5 text-sarh-teal" aria-hidden="true" />
                </Link>
              </li>
              <li className="flex items-start gap-2 rounded-xl border border-sarh-borderLight px-3 py-2.5 text-[11px] leading-6 text-slate-500 dark:border-sarh-borderDark dark:text-slate-400">
                <LogOut className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sarh-teal" aria-hidden="true" />
                زر <strong>تسجيل الخروج</strong> متاح في قائمة حسابك أعلى كل لوحة تحكم،
                وينهي الجلسة على هذا الجهاز فقط.
              </li>
            </ul>
          </Panel>

          <Panel
            title="إشعاراتك في هذه البوابة"
            icon={BellRing}
            description={`${notifications.length} إشعارات محفوظة`}
          >
            <ul className="divide-y divide-sarh-borderLight dark:divide-sarh-borderDark">
              {notifications.map((item) => (
                <li key={item.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-sarh-navy dark:text-slate-200">
                      {item.title}
                    </p>
                    <span className="shrink-0 text-[11px] text-slate-400">{item.at}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-6 text-slate-500 dark:text-slate-400">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>

          {children}
        </div>
      </div>
    </div>
  );
}
