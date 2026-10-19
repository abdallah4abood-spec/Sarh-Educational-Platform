import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  ClipboardList,
  Eye,
  Gauge,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";

import { Meter, PageHeader, Panel, StatCard } from "@/components/portal/primitives";
import { StatusPill, planPill } from "@/components/portal/status-pill";
import { DataTable, type Column } from "@/components/ui/data-table";
import { authOptions } from "@/lib/auth";
import type { ScopedTeacher } from "@/lib/data/portal";
import { loadSupervisorOverview } from "@/lib/db/supervisor";

export const metadata: Metadata = {
  title: "لوحة الإشراف",
  description:
    "نطاق الإشراف التعليمي: خطط الدروس بانتظار المراجعة، مؤشرات الجودة، وإحصاءات تقييم أداء المعلمين مع الزيارات الصفية.",
};

const SIGNAL_STYLE: Record<
  string,
  { tone: "rose" | "teal" | "navy"; label: string }
> = {
  alert: { tone: "rose", label: "تنبيه" },
  achievement: { tone: "teal", label: "إنجاز" },
  info: { tone: "navy", label: "معلومة" },
};

/**
 * Supervisor overview (Pillar 2 — oversight tier).
 *
 * The counterpart of the teacher dashboard, and deliberately its mirror image:
 * the teacher sees *their* classes and today's execution, the supervisor sees
 * *other people's* work — submitted plans, evaluation scores, quality signals —
 * and nothing that belongs to classroom execution.
 */
export default async function SupervisorOverviewPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  /*
   * The whole oversight scope is read from PostgreSQL for the signed-in
   * supervisor: the plans in their institutions, their evaluations, and the
   * quality signals raised inside their span — no bundled rows anywhere.
   */
  const data = userId
    ? await loadSupervisorOverview(userId)
    : {
        plans: [],
        planCounts: { PENDING: 0, APPROVED: 0, REVISION: 0 },
        evaluations: [],
        teachers: [],
        signals: [],
        averageScore: 0,
      };

  const pendingPlans = data.plans.filter((plan) => plan.status === "PENDING");
  const visits = data.evaluations.reduce((sum, row) => sum + row.visits, 0);
  const topTeachers = [...data.teachers]
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const columns: Column<ScopedTeacher>[] = [
    {
      key: "name",
      header: "المعلم",
      cell: (row) => (
        <span className="font-semibold text-sarh-navy dark:text-white">
          {row.name}
        </span>
      ),
    },
    { key: "center", header: "المركز", cell: (row) => row.center },
    { key: "subject", header: "التخصص", cell: (row) => row.subject },
    {
      key: "classes",
      header: "الفصول",
      align: "center",
      cell: (row) => (
        <span className="font-mono tabular-nums">{row.classes}</span>
      ),
    },
    {
      key: "compliance",
      header: "التزام الخطط",
      cell: (row) => (
        <div className="min-w-32">
          <Meter
            value={row.planCompliance * 100}
            accent={row.planCompliance < 0.7 ? "rose" : "teal"}
            valueLabel={`${Math.round(row.planCompliance * 100)}%`}
          />
        </div>
      ),
    },
    {
      key: "score",
      header: "الأداء",
      align: "end",
      cell: (row) => (
        <span
          className="font-mono font-bold tabular-nums text-sarh-navy dark:text-white"
          dir="ltr"
        >
          {row.score}%
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["بوابة الإشراف"]}
        title="لوحة الإشراف"
        lead="متابعة جودة التعليم داخل نطاقك: الخطط، الزيارات الصفية، ومؤشرات الأداء."
        icon={Eye}
        actions={
          <StatusPill tone="navy">
            {data.teachers.length} معلماً في نطاقك
          </StatusPill>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="خطط بانتظار المراجعة"
          value={String(data.planCounts.PENDING)}
          hint={`و${data.planCounts.REVISION} خطة بحاجة تعديل`}
          icon={ClipboardList}
          accent="gold"
          href="/supervisor/plans"
          cta="مراجعة الخطط"
        />
        <StatCard
          label="الزيارات الصفية"
          value={String(visits)}
          hint="زيارة مكتملة هذا الفصل"
          icon={Users}
          accent="teal"
          href="/supervisor/evaluations"
          cta="سجل الزيارات"
        />
        <StatCard
          label="متوسط أداء المعلمين"
          value={`${data.averageScore}%`}
          hint="محسوب من آخر تقييم معتمد"
          icon={BarChart3}
          accent="navy"
          href="/supervisor/evaluations"
        />
        <StatCard
          label="إشارات جودة مفتوحة"
          value={String(data.signals.length)}
          hint="تحتاج متابعة أو توثيقاً"
          icon={AlertTriangle}
          accent="rose"
          href="/supervisor/evaluations"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <Panel
            title="خطط الدروس بانتظار المراجعة"
            description="تحقق من اكتمال الخطة قبل اعتمادها أو إعادتها للمعلم"
            icon={ClipboardList}
            moreHref="/supervisor/plans"
          >
            <ul className="divide-y divide-sarh-borderLight dark:divide-sarh-borderDark">
              {pendingPlans.map((plan) => {
                const pill = planPill(plan.status);
                return (
                  <li
                    key={plan.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-sarh-navy dark:text-white">
                        {plan.title}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {plan.teacherName} — {plan.subject} · {plan.gradeLevel}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="hidden text-[11px] text-slate-400 sm:block" dir="ltr">
                        {plan.submittedAt}
                      </span>
                      <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                      <Link
                        href="/supervisor/plans"
                        className="text-xs font-bold text-sarh-teal hover:underline"
                      >
                        مراجعة
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel
            title="المعلمون في نطاقي"
            description="التزام الخطط ومؤشر الأداء لكل معلم"
            icon={Users}
            moreHref="/supervisor/teachers"
          >
            <DataTable
              columns={columns}
              rows={data.teachers}
              rowKey={(row) => row.id}
            />
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel
            title="إشارات الجودة"
            description="أحدث ما رصده النظام اليوم"
            icon={Gauge}
            moreHref="/supervisor/evaluations"
          >
            <ul className="space-y-3">
              {data.signals.map((signal) => {
                const style = SIGNAL_STYLE[signal.kind];
                return (
                  <li
                    key={signal.id}
                    className="rounded-xl border border-sarh-borderLight p-3 dark:border-sarh-borderDark"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <StatusPill tone={style.tone}>{style.label}</StatusPill>
                      <span
                        className="font-mono text-[11px] font-bold tabular-nums text-slate-400"
                        dir="ltr"
                      >
                        {signal.at}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-bold text-sarh-navy dark:text-slate-200">
                      {signal.title}
                    </p>
                    <p className="mt-1 text-[11px] leading-6 text-slate-500 dark:text-slate-400">
                      {signal.detail}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel
            title="أعلى المعلمين أداءً"
            icon={Trophy}
            moreHref="/supervisor/evaluations"
          >
            <ul className="space-y-4">
              {topTeachers.map((teacher) => (
                <li key={teacher.id}>
                  <p className="mb-1 flex items-center justify-between gap-2 text-xs font-bold text-sarh-navy dark:text-slate-200">
                    <span>{teacher.name}</span>
                    <span className="font-mono tabular-nums text-slate-400" dir="ltr">
                      {teacher.score}%
                    </span>
                  </p>
                  <Meter value={teacher.score} accent="teal" />
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="أدوات الإشراف" icon={Sparkles}>
            <p className="text-sm leading-7 text-slate-500 dark:text-slate-400">
              أدوات التقارير والزيارات الصفية تُجهَّز حسب نطاق إشرافك، ويمكنك طلب
              تقرير مخصص لأي معلم أو مركز.
            </p>
            <Link
              href="/supervisor/evaluations"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-sarh-teal hover:underline"
            >
              فتح تقييم الأداء
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}
