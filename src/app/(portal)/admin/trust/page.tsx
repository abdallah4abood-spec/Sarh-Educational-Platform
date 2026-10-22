import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  ShieldCheck,
  Timer,
  TrendingUp,
} from "lucide-react";

import { ActivityChart } from "@/components/portal/activity-chart";
import { PageHeader, Panel, StatCard } from "@/components/portal/primitives";
import { StatusPill, institutionPill, paymentPill } from "@/components/portal/status-pill";
import { DataTable, type Column } from "@/components/ui/data-table";
import { requireAdminPage } from "@/lib/admin-page";
import type { ApprovalRow } from "@/lib/data/finance";
import {
  loadActivitySeries,
  loadAdminInstitutions,
  loadAdminTotals,
  loadTrustQueue,
} from "@/lib/db/admin";

import { TrustDecisionButtons } from "./decision-buttons";

export const metadata: Metadata = {
  title: "طلبات التوثيق",
  description:
    "طابور توثيق المؤسسات الجديدة: مراجعة الطلبات واعتمادها أو رفضها قبل ظهورها في دليل صَرْح العام، مع مؤشر سرعة المعالجة.",
};

const nf = new Intl.NumberFormat("en-US");

/**
 * Admin → Trust & verification queue (Pillar 3 drill-down).
 *
 * The queue an onboarding request waits in. Approval here is what turns a row
 * into a public directory listing, so this screen holds the decision, not the
 * dashboard.
 */
export default async function AdminTrustPage() {
  await requireAdminPage();

  const [approvals, institutions, activity, totals] = await Promise.all([
    loadTrustQueue(),
    loadAdminInstitutions(),
    loadActivitySeries(),
    loadAdminTotals(),
  ]);

  const pending = approvals.filter((row) => row.status === "PENDING");
  const approved = approvals.filter((row) => row.status === "VERIFIED");
  const rejected = approvals.filter((row) => row.status === "REJECTED");
  const pendingInstitutions = institutions.filter(
    (row) => row.state === "PENDING"
  );

  const columns: Column<ApprovalRow>[] = [
    {
      key: "institution",
      header: "المؤسسة",
      cell: (row) => (
        <div className="min-w-44">
          <p className="font-semibold text-sarh-navy dark:text-white">
            {row.institutionName}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {row.type} — {row.zone}
          </p>
        </div>
      ),
    },
    { key: "owner", header: "المالك", cell: (row) => row.ownerName },
    {
      key: "submitted",
      header: "تاريخ التقديم",
      cell: (row) => (
        <span className="font-mono text-xs tabular-nums" dir="ltr">
          {row.submittedAt}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      align: "end",
      cell: (row) => {
        const pill = paymentPill(row.status);
        return <StatusPill tone={pill.tone}>{pill.label}</StatusPill>;
      },
    },
    {
      key: "actions",
      header: "الإجراءات",
      align: "end",
      cell: (row) =>
        row.status === "PENDING" ? (
          <TrustDecisionButtons id={row.id} name={row.institutionName} />
        ) : (
          <span className="text-xs font-semibold text-slate-400">
            لا إجراء مطلوب
          </span>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["الإدارة", "طلبات التوثيق"]}
        title="طلبات التوثيق"
        lead="مراجعة طلبات المؤسسات الجديدة واعتمادها أو رفضها قبل إضافتها إلى الدليل العام."
        icon={ShieldCheck}
        actions={
          <Link
            href="/admin/institutions"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-sarh-teal hover:underline"
          >
            سجل المؤسسات
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="طلبات قيد المراجعة"
          value={String(pending.length)}
          hint="بحاجة قراراً"
          icon={Timer}
          accent="gold"
        />
        <StatCard
          label="طلبات معتمدة"
          value={String(approved.length)}
          hint="أُضيفت إلى الدليل"
          icon={BadgeCheck}
          accent="teal"
        />
        <StatCard
          label="طلبات مرفوضة"
          value={String(rejected.length)}
          hint="أُبلغ المالك بالسبب"
          icon={Building2}
          accent="rose"
        />
        <StatCard
          label="توثيقات هذا الشهر"
          value={nf.format(totals.monthlyVerifications)}
          hint={`+${Math.round(totals.verificationTrend * 100)}% عن الفترة السابقة`}
          icon={TrendingUp}
          accent="navy"
        />
      </div>

      <Panel
        title="طابور المراجعة"
        description={`${approvals.length} طلباً في الطابور`}
        icon={ShieldCheck}
      >
        <DataTable
          columns={columns}
          rows={approvals}
          rowKey={(row) => row.id}
        />
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Panel
          title="إشارات المؤسسات"
          description="حالة المؤسسات المسجّلة في الدليل"
          icon={Building2}
          moreHref="/admin/institutions"
        >
          <ul className="divide-y divide-sarh-borderLight dark:divide-sarh-borderDark">
            {institutions.map((row) => {
              const pill = institutionPill(row.state);
              return (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold text-sarh-navy dark:text-slate-200">
                      {row.name}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {row.owner} — {row.zone}
                    </span>
                  </span>
                  <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="space-y-5">
          <Panel title="نشاط المنصة" description="آخر ٧ أيام" icon={TrendingUp}>
            <ActivityChart points={activity} />
          </Panel>

          <Panel title="مؤسسات معلّقة" icon={Timer}>
            {pendingInstitutions.length > 0 ? (
              <ul className="space-y-2">
                {pendingInstitutions.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-sarh-gold/40 bg-sarh-gold/8 px-3 py-2.5 text-xs font-bold text-sarh-navy dark:text-white"
                  >
                    {row.name}
                    <span className="text-[11px] font-medium text-slate-500">
                      {row.type}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">لا مؤسسات معلّقة.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
