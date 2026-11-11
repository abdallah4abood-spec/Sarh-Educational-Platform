import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { ArrowLeft, GraduationCap, KeyRound, UserPlus, Users } from "lucide-react";

import { GuardianAccessNotice } from "@/components/parent/guardian-access-notice";
import { Meter, PageHeader, Panel, StatCard } from "@/components/portal/primitives";
import { StatusPill, guardianLinkPill } from "@/components/portal/status-pill";
import { authOptions } from "@/lib/auth";
import { loadOwnLinkRequests } from "@/lib/db/guardian-approvals";
import { loadChildrenOverview } from "@/lib/db/parent";
import { resolveGuardianAccess } from "@/lib/guardian-access";

import { AddChildForm } from "./add-child-form";
import { LinkChildForm } from "./link-child-form";

const dateFormat = new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" });

export const metadata: Metadata = {
  title: "أبنائي",
  description:
    "قائمة أبناء ولي الأمر مع المركز والصف ونسبة الحضور ومؤشرات المواد — وإضافة طالب جديد إلى الحساب.",
};

/**
 * Parent → My children (the dashboard's «أبنائي» drill-down).
 *
 * Every card is read from PostgreSQL scoped to the signed-in parent: the
 * enrolment identity from `Student`/`Enrollment`, the attendance share from
 * real `DailyLog` rows, and the subject meters from `SubjectPerformance`.
 * Adding a child writes through the parent API and refreshes this page.
 */
export default async function ParentChildrenPage() {
  const session = await getServerSession(authOptions);
  const access = await resolveGuardianAccess(session?.user?.id);
  const cards = access.ok ? await loadChildrenOverview(access.access) : [];
  const requests = session?.user?.id
    ? await loadOwnLinkRequests(session.user.id)
    : [];

  const attended = cards.filter((card) => card.attendanceRate >= 0.8).length;

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["بوابة الأهالي", "أبنائي"]}
        title="أبنائي"
        lead="كل طفل في بطاقة واحدة: مركزه وصفه، نسبة حضوره آخر ٢٨ يوماً، ومؤشرات مواده — مع إمكانية إضافة طالب جديد."
        icon={Users}
      />

      {!access.ok ? <GuardianAccessNotice reason={access.reason} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="عدد الأبناء"
          value={String(cards.length)}
          hint="مسجّلون على حسابك"
          icon={Users}
          accent="navy"
        />
        <StatCard
          label="حضور منتظم"
          value={String(attended)}
          hint="نسبة حضور ٨٠٪ أو أعلى"
          icon={GraduationCap}
          accent="teal"
        />
        <StatCard
          label="يوميات هذا الشهر"
          value={String(cards.reduce((sum, card) => sum + card.logsCount, 0))}
          hint="سجلات يومية من المراكز"
          icon={GraduationCap}
          accent="gold"
          href="/parent/feed"
          cta="يومية الطفل"
        />
      </div>

      {cards.length === 0 ? (
        <Panel title="لا أبناء بعد" icon={Users}>
          <p className="text-sm text-sarh-inkMute dark:text-slate-400">
            أضف أول طفل ليبدأ المركز بإرسال يومياته وإعلاناته إلى حسابك.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ child, performance, attendanceRate, logsCount }) =>
            child.institutionId ? (
              <Panel
                key={child.id}
                title={child.name}
                description={`${child.gradeLevel} — ${child.institutionName}`}
                icon={GraduationCap}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill
                    tone={child.tier === "KINDERGARTEN" ? "gold" : "teal"}
                  >
                    {child.tier === "KINDERGARTEN" ? "روضة" : "مركز تعليمي"}
                  </StatusPill>
                  <StatusPill tone="slate">{logsCount} يوميات (٢٨ يوماً)</StatusPill>
                </div>

                <div className="mt-4 space-y-3">
                  <Meter
                    label="نسبة الحضور"
                    value={attendanceRate * 100}
                    accent={attendanceRate >= 0.8 ? "teal" : "gold"}
                  />
                  {performance.slice(0, 3).map((row) => (
                    <Meter
                      key={row.subject}
                      label={row.subject}
                      value={row.percent}
                      accent="teal"
                    />
                  ))}
                  {performance.length === 0 ? (
                    <p className="text-[11px] text-sarh-inkMute dark:text-slate-400">
                      لا توجد بيانات مواد بعد — تظهر بعد أول تقييم في المركز.
                    </p>
                  ) : null}
                </div>

                <Link
                  href="/parent/feed"
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-sarh-tealInk dark:text-sarh-teal hover:underline"
                >
                  عرض اليومية
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </Panel>
            ) : (
              <Panel
                key={child.id}
                title={child.name}
                description="حساب طالب — بلا مؤسسة مرتبطة"
                icon={KeyRound}
              >
                <StatusPill tone="slate">غير مسجل في مؤسسة</StatusPill>
                <p className="mt-4 text-xs leading-6 text-sarh-inkMute dark:text-slate-400">
                  هذه البطاقة للهوية فقط. لا تظهر أي يوميات أو درجات أو إعلانات
                  مؤسسية حتى يعتمد أحد المراكز طلب ربطك برمز دعوة.
                </p>
              </Panel>
            )
          )}
        </div>
      )}

      {requests.length > 0 ? (
        <Panel
          title="طلبات الربط"
          description="طلبات فتحها رمز المركز وتنتظر قراره — تظهر هنا حتى لا يبقى الطلب صامتاً"
          icon={KeyRound}
        >
          <ul className="space-y-2">
            {requests.map((request) => {
              const pill = guardianLinkPill(request.status);
              const date = new Date(request.requestedAt);
              return (
                <li
                  key={request.linkId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sarh-mist/60 px-3 py-2.5 dark:bg-white/5"
                >
                  <div>
                    <p className="text-sm font-semibold text-sarh-navy dark:text-white">
                      {request.studentName}
                    </p>
                    <p className="mt-0.5 text-[11px] text-sarh-inkMute dark:text-slate-400">
                      {request.institutionName} ·{" "}
                      {Number.isNaN(date.getTime())
                        ? "—"
                        : dateFormat.format(date)}
                    </p>
                  </div>
                  <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] leading-5 text-sarh-inkMute dark:text-slate-400">
            لا يمنح الطلب المعلّق أي وصول. عند الرفض أو سحب المنحة يبقى ظاهراً
            هنا كسجل، ولا يُعاد فتحه إلا برمز جديد من المركز.
          </p>
        </Panel>
      ) : null}

      <Panel
        title="إضافة طالب آخر"
        description="يُحفظ مباشرة على حسابك في قاعدة البيانات"
        icon={UserPlus}
      >
        <AddChildForm />
      </Panel>

      <Panel
        title="ربط طالب من مركز"
        description="أدخل رمز الدعوة الذي سلّمك إياه المركز لربط حسابك بسجل الطفل"
        icon={KeyRound}
      >
        <LinkChildForm />
      </Panel>
    </div>
  );
}
