import { ShieldAlert } from "lucide-react";

import { Panel } from "@/components/portal/primitives";
import type { GuardianAccessDenial } from "@/lib/guardian-access";

/**
 * Shown instead of child data when the live database check in
 * `resolveGuardianAccess` denies the account.
 *
 * This is not a redirect: `PortalShell` and `middleware.ts` already gate the
 * route on the JWT, and a redirect loop would be the only way to re-check a
 * token whose claims are stale. Rendering the reason is honest — the account
 * can see that access changed and why, without a single child row being read.
 */
const COPY: Record<GuardianAccessDenial, { title: string; body: string }> = {
  NO_SESSION: {
    title: "انتهت الجلسة",
    body: "لم نتمكن من التحقق من جلستك. سجّل الدخول مجدداً لعرض بيانات أبنائك.",
  },
  ACCOUNT_MISSING: {
    title: "الحساب غير متاح",
    body: "لم يعد حسابك موجوداً في قاعدة البيانات. تواصل مع الدعم لإعادة تفعيله.",
  },
  NOT_PARENT: {
    title: "لا تملك صلاحية بوابة الأهالي",
    body: "دور حسابك الحالي لم يعد «ولي أمر». تُمنح هذه الصلاحية من قاعدة البيانات، ولا يكفي وجود جلسة سابقة — راجع إدارة المنصة.",
  },
  EMAIL_UNVERIFIED: {
    title: "البريد الإلكتروني غير موثّق",
    body: "لحماية بيانات الأطفال، لا تُعرض بيانات الأبناء قبل توثيق بريد الحساب. افتح رابط التوثيق المرسل إلى بريدك ثم أعد المحاولة.",
  },
};

export function GuardianAccessNotice({
  reason,
}: {
  reason: GuardianAccessDenial;
}) {
  const copy = COPY[reason];
  return (
    <Panel title={copy.title} icon={ShieldAlert}>
      <p className="text-sm leading-7 text-sarh-inkMute dark:text-slate-400">
        {copy.body}
      </p>
    </Panel>
  );
}
