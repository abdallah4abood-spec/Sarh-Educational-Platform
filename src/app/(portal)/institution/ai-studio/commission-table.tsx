"use client";

import { useMemo } from "react";
import { Landmark, TrendingUp, Wallet } from "lucide-react";

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import type {
  CommissionRow,
  CommissionStatus,
} from "@/lib/data/institution";
import { cn, formatSarh } from "@/lib/utils";

const STATUS_META: Record<
  CommissionStatus,
  { label: string; variant: BadgeVariant }
> = {
  VERIFIED: { label: "✓ معتمدة", variant: "success" },
  PENDING: { label: "◷ قيد المراجعة", variant: "gold" },
  REJECTED: { label: "× مرفوضة", variant: "danger" },
};

const COLUMNS: Column<CommissionRow>[] = [
  {
    key: "student",
    header: "الطالب",
    cell: (row) => (
      <span className="font-semibold text-sarh-navy dark:text-slate-100">
        {row.studentName}
      </span>
    ),
  },
  { key: "center", header: "المؤسسة", cell: (row) => row.centerName },
  { key: "grade", header: "الصف", cell: (row) => row.gradeLevel },
  {
    key: "fee",
    header: "رسوم الإحالة",
    align: "end",
    cell: (row) => (
      <span
        className="font-mono font-bold tabular-nums text-sarh-teal"
        dir="ltr"
      >
        {formatSarh(row.referralFee, "en-US")}
      </span>
    ),
  },
  {
    key: "status",
    header: "الحالة",
    align: "center",
    cell: (row) => {
      const meta = STATUS_META[row.status];
      return <Badge variant={meta.variant}>{meta.label}</Badge>;
    },
  },
  {
    key: "date",
    header: "تاريخ التسجيل",
    align: "center",
    cell: (row) => (
      <time
        dateTime={row.registeredAt}
        className="font-mono text-sm tabular-nums"
        dir="ltr"
      >
        {row.registeredAt}
      </time>
    ),
  },
];

/**
 * Commission table (Design.md Prompt 4 / §24) — every money, count and
 * date cell uses `font-mono tabular-nums` so columns stay visually
 * stable while amounts change.
 */
export function CommissionTable({ rows }: { rows: CommissionRow[] }) {
  const totals = useMemo(() => {
    let all = 0;
    let verified = 0;
    let pending = 0;
    for (const row of rows) {
      all += row.referralFee;
      if (row.status === "VERIFIED") verified += row.referralFee;
      if (row.status === "PENDING") pending += row.referralFee;
    }
    return { all, verified, pending };
  }, [rows]);

  const stats = [
    {
      label: "إجمالي العمولات",
      value: totals.all,
      icon: Wallet,
      tone: "text-sarh-navy dark:text-white",
    },
    {
      label: "المحصلة",
      value: totals.verified,
      icon: TrendingUp,
      tone: "text-sarh-teal",
    },
    {
      label: "قيد التحصيل",
      value: totals.pending,
      icon: Landmark,
      tone: "text-sarh-gold",
    },
  ];

  return (
    <section aria-labelledby="commissions-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="commissions-heading"
            className="flex items-center gap-2 text-lg font-bold text-sarh-navy dark:text-white"
          >
            <Wallet className="h-5 w-5 text-sarh-teal" aria-hidden="true" />
            عمولات التسجيل
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            مبالغ إحالة الطلاب الجدد المعتمدة من الإدارة المالية.
          </p>
        </div>
        <Badge variant="teal">
          <span className="font-mono tabular-nums" dir="ltr">
            {rows.length}
          </span>
          سجلات
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="sarh-card flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sarh-teal/10 ring-1 ring-inset ring-sarh-teal/25">
              <stat.icon className="h-5 w-5 text-sarh-teal" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                {stat.label}
              </p>
              <p
                className={cn(
                  "font-mono text-lg font-bold tabular-nums",
                  stat.tone
                )}
                dir="ltr"
              >
                {formatSarh(stat.value, "en-US")}
              </p>
            </div>
          </div>
        ))}
      </div>

      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.id}
        emptyMessage="لا توجد عمولات مسجلة حالياً"
      />
    </section>
  );
}
