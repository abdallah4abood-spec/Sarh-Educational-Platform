import type { ReactNode } from "react";
import Link from "next/link";
import { Building2, ShieldAlert, ShieldQuestion } from "lucide-react";

import type { TeacherScopeDenialReason } from "@/lib/teacher-access";

/**
 * The two non-data states of the teacher portal (decision D5).
 *
 * Both render **no** teacher rows. A denied account sees why, and an account
 * that works at more than one centre sees the selector — never one centre's
 * classes under another centre's heading.
 */

const REASON_TEXT: Record<
  TeacherScopeDenialReason,
  { title: string; body: string }
> = {
  "unknown-user": {
    title: "تعذّر التحقق من الحساب",
    body: "لم نتمكن من العثور على حسابك. أعد تسجيل الدخول، وإن استمرت المشكلة فتواصل مع إدارة المنصة.",
  },
  "not-teacher": {
    title: "لا توجد عضوية تعليمية",
    body: "بوابة المعلمين مخصّصة للهيئة التعليمية في المراكز والروضات. لا تملك عضويات تعليمية حالياً.",
  },
  "no-membership": {
    title: "العضوية غير نشطة",
    body: "لا توجد عضوية تعليمية نشطة لهذا الحساب في أي مركز. تواصل مع إدارة المركز لإعادة تفعيلها.",
  },
  "institution-not-granted": {
    title: "المؤسسة غير متاحة",
    body: "المؤسسة المحددة في الرابط لا تتبع عضوياتك التعليمية النشطة. اختر مؤسسة من قائمتك أدناه.",
  },
  "lookup-failed": {
    title: "تعذّر التحقق من العضوية",
    body: "حدث خطأ أثناء قراءة بيانات العضوية، ولم نعرض أي بيانات احتياطاً. أعد تحميل الصفحة بعد قليل.",
  },
};

export function TeacherScopeNotice({
  reason,
}: {
  reason: TeacherScopeDenialReason;
}) {
  const text = REASON_TEXT[reason];

  return (
    <section
      role="status"
      className="rounded-2xl border border-sarh-gold/40 bg-sarh-gold/10 px-5 py-6 dark:border-sarh-gold/30"
    >
      <p className="flex items-center gap-2 text-base font-bold text-sarh-goldInk dark:text-sarh-gold">
        <ShieldAlert className="h-5 w-5" aria-hidden="true" />
        {text.title}
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-sarh-inkMute dark:text-slate-300">
        {text.body}
      </p>
    </section>
  );
}

export function TeacherInstitutionPicker({
  institutions,
  current,
}: {
  institutions: { id: string; name: string }[];
  /** Path that receives `?institution=`, e.g. `/teacher/classes`. */
  current: string;
}) {
  return (
    <section className="rounded-2xl border border-sarh-borderLight bg-white p-5 dark:border-sarh-borderDark dark:bg-sarh-cardDark">
      <p className="flex items-center gap-2 text-base font-bold text-sarh-navy dark:text-white">
        <ShieldQuestion className="h-5 w-5 text-sarh-tealInk dark:text-sarh-teal" aria-hidden="true" />
        اختر مؤسسة للعمل عليها
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-sarh-inkMute dark:text-slate-400">
        عضويّتك التعليمية نشطة في أكثر من مؤسسة. اختر المؤسسة التي تعمل عليها الآن
        لعرض فصولها وطلابها فقط.
      </p>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {institutions.map((institution) => (
          <li key={institution.id}>
            <Link
              href={{ pathname: current, query: { institution: institution.id } }}
              className="flex items-center gap-3 rounded-xl border border-sarh-borderLight px-4 py-3 transition-colors hover:border-sarh-teal/50 hover:bg-sarh-teal/5 dark:border-sarh-borderDark"
            >
              <Building2
                className="h-4 w-4 shrink-0 text-sarh-tealInk dark:text-sarh-teal"
                aria-hidden="true"
              />
              <span className="text-sm font-bold text-sarh-navy dark:text-white">
                {institution.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Shared page body for the two non-data states. */
export function TeacherScopeGate({
  state,
  path,
}: {
  state:
    | { kind: "denied"; reason: TeacherScopeDenialReason }
    | { kind: "ambiguous"; institutions: { id: string; name: string }[] };
  path: string;
}): ReactNode {
  return state.kind === "denied" ? (
    <TeacherScopeNotice reason={state.reason} />
  ) : (
    <TeacherInstitutionPicker institutions={state.institutions} current={path} />
  );
}
