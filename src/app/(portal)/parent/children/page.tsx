import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { ArrowLeft, GraduationCap, UserPlus, Users } from "lucide-react";

import { Meter, PageHeader, Panel, StatCard } from "@/components/portal/primitives";
import { StatusPill } from "@/components/portal/status-pill";
import { authOptions } from "@/lib/auth";
import { loadChildrenOverview } from "@/lib/db/parent";

import { AddChildForm } from "./add-child-form";

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
  const userId = session?.user?.id;
  const cards = userId ? await loadChildrenOverview(userId) : [];

  const attended = cards.filter((card) => card.attendanceRate >= 0.8).length;

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["بوابة الأهالي", "أبنائي"]}
        title="أبنائي"
        lead="كل طفل في بطاقة واحدة: مركزه وصفه، نسبة حضوره آخر ٢٨ يوماً، ومؤشرات مواده — مع إمكانية إضافة طالب جديد."
        icon={Users}
      />

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
          <p className="text-sm text-slate-500 dark:text-slate-400">
            أضف أول طفل ليبدأ المركز بإرسال يومياته وإعلاناته إلى حسابك.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ child, performance, attendanceRate, logsCount }) => (
            <Panel
              key={child.id}
              title={child.name}
              description={`${child.gradeLevel} — ${child.institutionName}`}
              icon={GraduationCap}
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={child.tier === "KINDERGARTEN" ? "gold" : "teal"}>
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
                  <p className="text-[11px] text-slate-400">
                    لا توجد بيانات مواد بعد — تظهر بعد أول تقييم في المركز.
                  </p>
                ) : null}
              </div>

              <Link
                href="/parent/feed"
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-sarh-teal hover:underline"
              >
                عرض اليومية
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Panel>
          ))}
        </div>
      )}

      <Panel
        title="إضافة طالب آخر"
        description="يُحفظ مباشرة على حسابك في قاعدة البيانات"
        icon={UserPlus}
      >
        <AddChildForm />
      </Panel>
    </div>
  );
}
