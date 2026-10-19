import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { BarChart3, Eye, Gauge, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Meter, PageHeader, Panel, StatCard } from "@/components/portal/primitives";
import { StatusPill } from "@/components/portal/status-pill";
import { DataTable, type Column } from "@/components/ui/data-table";
import { authOptions } from "@/lib/auth";
import type { TeacherEvaluation } from "@/lib/data/portal";
import {
  loadQualitySignals,
  loadSupervisorEvaluations,
} from "@/lib/db/supervisor";

export const metadata: Metadata = {
  title: "تقييم الأداء",
  description:
    "مؤشرات أداء المعلمين داخل نطاق الإشراف: الدرجة الكلية، عدد الزيارات الصفية، واتجاه الأداء، مع إشارات الجودة المرصودة.",
};

const TREND = {
  up: { label: "تحسّن", tone: "teal" as const, Icon: TrendingUp },
  flat: { label: "ثابت", tone: "slate" as const, Icon: Minus },
  down: { label: "تراجع", tone: "rose" as const, Icon: TrendingDown },
};

const SIGNAL_TONE = {
  alert: "rose" as const,
  achievement: "teal" as const,
  info: "navy" as const,
};

const SIGNAL_LABEL = {
  alert: "تنبيه",
  achievement: "إنجاز",
  info: "معلومة",
};

/**
 * Supervisor → Performance evaluation (drill-down of the evaluations tiles).
 *
 * Combines the score table with the quality signals that triggered it, so a
 * supervisor can see *why* a score moved, not just the number.
 */
export default async function SupervisorEvaluationsPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const [evaluations, signals] = userId
    ? await Promise.all([
        loadSupervisorEvaluations(userId),
        loadQualitySignals(userId, 12),
      ])
    : [[], []];

  const visits = evaluations.reduce((sum, row) => sum + row.visits, 0);
  const average = evaluations.length
    ? Math.round(
        evaluations.reduce((sum, row) => sum + row.score, 0) / evaluations.length
      )
    : 0;
  const improvement = evaluations.filter((row) => row.trend === "up").length;
  const decline = evaluations.filter((row) => row.trend === "down").length;

  const columns: Column<TeacherEvaluation>[] = [
    {
      key: "teacher",
      header: "المعلم",
      cell: (row) => (
        <div className="min-w-48">
          <p className="font-semibold text-sarh-navy dark:text-white">
            {row.teacherName}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {row.subject} — {row.center}
          </p>
        </div>
      ),
    },
    {
      key: "visits",
      header: "الزيارات",
      align: "center",
      cell: (row) => <span className="font-mono tabular-nums">{row.visits}</span>,
    },
    {
      key: "lastVisit",
      header: "آخر زيارة",
      cell: (row) => (
        <span className="font-mono text-xs tabular-nums" dir="ltr">
          {row.lastVisit}
        </span>
      ),
    },
    {
      key: "trend",
      header: "الاتجاه",
      cell: (row) => {
        const trend = TREND[row.trend];
        return (
          <StatusPill tone={trend.tone} icon={trend.Icon}>
            {trend.label}
          </StatusPill>
        );
      },
    },
    {
      key: "score",
      header: "الأداء",
      align: "end",
      cell: (row) => (
        <div className="min-w-28">
          <Meter
            value={row.score}
            accent={row.score < 75 ? "rose" : row.score < 88 ? "gold" : "teal"}
            valueLabel={`${row.score}%`}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["بوابة الإشراف", "تقييم الأداء"]}
        title="تقييم الأداء"
        lead="درجات الأداء والزيارات الصفية وإشارات الجودة لمعلمي نطاقك، في مساحة عمل واحدة."
        icon={BarChart3}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="متوسط الأداء"
          value={`${average}%`}
          hint="من آخر تقييم معتمد"
          icon={BarChart3}
          accent="navy"
        />
        <StatCard
          label="الزيارات الصفية"
          value={String(visits)}
          hint="زيارة مكتملة هذا الفصل"
          icon={Eye}
          accent="teal"
        />
        <StatCard
          label="أداء متحسّن"
          value={String(improvement)}
          hint="معلمون في اتجاه صاعد"
          icon={TrendingUp}
          accent="teal"
        />
        <StatCard
          label="بحاجة متابعة"
          value={String(decline)}
          hint="اتجاه هابط يستوجب زيارة"
          icon={Gauge}
          accent="rose"
        />
      </div>

      <Panel
        title="سجل تقييم المعلمين"
        description={`${evaluations.length} معلمين في نطاقك`}
        icon={Eye}
      >
        <DataTable
          columns={columns}
          rows={evaluations}
          rowKey={(row) => row.id}
        />
      </Panel>

      <Panel
        title="إشارات الجودة"
        description="مرتبطة بالزيارات والدرجات أعلاه"
        icon={Gauge}
      >
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {signals.map((signal) => (
            <li
              key={signal.id}
              className="rounded-xl border border-sarh-borderLight p-4 dark:border-sarh-borderDark"
            >
              <div className="flex items-center justify-between gap-2">
                <StatusPill tone={SIGNAL_TONE[signal.kind]}>
                  {SIGNAL_LABEL[signal.kind]}
                </StatusPill>
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
              <p className="mt-2 text-[10px] font-bold text-sarh-teal">
                {signal.center}
              </p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
