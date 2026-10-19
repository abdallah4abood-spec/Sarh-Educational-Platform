import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { CheckCircle2, ClipboardList, RefreshCcw, Timer } from "lucide-react";

import { Meter, PageHeader, Panel, StatCard } from "@/components/portal/primitives";
import { StatusPill, planPill } from "@/components/portal/status-pill";
import { DataTable, type Column } from "@/components/ui/data-table";
import { authOptions } from "@/lib/auth";
import type { LessonPlan } from "@/lib/data/portal";
import { loadSupervisorPlans } from "@/lib/db/supervisor";

export const metadata: Metadata = {
  title: "مراجعة الخطط",
  description:
    "طابور مراجعة خطط الدروس: اكتمال الخطة، تاريخ التقديم، وحالة الاعتماد — لاعتماد الخطة أو إعادتها للمعلم مع ملاحظات.",
};

/**
 * Supervisor → Plan review (drill-down of the plan queue panel).
 *
 * The oversight workspace: nothing here executes a lesson, it only judges what
 * a teacher submitted — the clean functional split with the teacher portal.
 */
export default async function SupervisorPlansPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const plans = userId ? await loadSupervisorPlans(userId, 50) : [];

  const pending = plans.filter((plan) => plan.status === "PENDING");
  const approved = plans.filter((plan) => plan.status === "APPROVED");
  const revision = plans.filter((plan) => plan.status === "REVISION");
  const averageCompleteness = plans.length
    ? Math.round(
        plans.reduce((sum, plan) => sum + plan.completeness, 0) / plans.length
      )
    : 0;

  const columns: Column<LessonPlan>[] = [
    {
      key: "title",
      header: "الخطة",
      cell: (row) => (
        <div className="min-w-48">
          <p className="font-semibold text-sarh-navy dark:text-white">{row.title}</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {row.subject} — {row.gradeLevel}
          </p>
        </div>
      ),
    },
    {
      key: "teacher",
      header: "المعلم",
      cell: (row) => (
        <div>
          <p>{row.teacherName}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{row.center}</p>
        </div>
      ),
    },
    {
      key: "submittedAt",
      header: "تاريخ التقديم",
      cell: (row) => (
        <span className="font-mono text-xs tabular-nums" dir="ltr">
          {row.submittedAt}
        </span>
      ),
    },
    {
      key: "completeness",
      header: "اكتمال الخطة",
      cell: (row) => (
        <div className="min-w-32">
          <Meter
            value={row.completeness}
            accent={row.completeness < 70 ? "rose" : "teal"}
            valueLabel={`${row.completeness}%`}
          />
        </div>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      align: "end",
      cell: (row) => {
        const pill = planPill(row.status);
        return <StatusPill tone={pill.tone}>{pill.label}</StatusPill>;
      },
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["بوابة الإشراف", "مراجعة الخطط"]}
        title="مراجعة الخطط"
        lead="طابور خطط الدروس المقدَّمة من المعلمين داخل نطاق إشرافك، مع مؤشر اكتمال كل خطة."
        icon={ClipboardList}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="بانتظار المراجعة"
          value={String(pending.length)}
          hint="تحتاج قراراً اليوم"
          icon={Timer}
          accent="gold"
        />
        <StatCard
          label="معتمدة"
          value={String(approved.length)}
          hint="هذا الأسبوع"
          icon={CheckCircle2}
          accent="teal"
        />
        <StatCard
          label="بحاجة تعديل"
          value={String(revision.length)}
          hint="أُعيدت للمعلمين"
          icon={RefreshCcw}
          accent="rose"
        />
        <StatCard
          label="متوسط الاكتمال"
          value={`${averageCompleteness}%`}
          hint="محسوب من كل الخطط"
          icon={ClipboardList}
          accent="navy"
        />
      </div>

      <Panel
        title="كل الخطط"
        description={`${plans.length} خطة مقدَّمة`}
        icon={ClipboardList}
      >
        <DataTable
          columns={columns}
          rows={plans}
          rowKey={(row) => row.id}
        />
      </Panel>
    </div>
  );
}
