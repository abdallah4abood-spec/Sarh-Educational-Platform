import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CircleDollarSign,
  LayoutDashboard,
  Receipt,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

import { ActivityChart } from "@/components/portal/activity-chart";
import { PageHeader, Panel, StatCard } from "@/components/portal/primitives";
import {
  StatusPill,
  institutionPill,
  paymentPill,
  sourcePill,
} from "@/components/portal/status-pill";
import { DataTable, type Column } from "@/components/ui/data-table";
import { requireAdminPage } from "@/lib/admin-page";
import type { AdminInstitutionRow } from "@/lib/data/portal";
import {
  loadActivitySeries,
  loadAdminInstitutions,
  loadAdminLiveCounts,
  loadAdminTotals,
} from "@/lib/db/admin";
import { loadFinanceStats, loadPaymentReceipts } from "@/lib/db/finance";
import { ROLE_LABEL } from "@/lib/roles";

export const metadata: Metadata = {
  title: "لوحة تحكم الإدارة",
  description:
    "نظرة عالية المستوى على منصة صَرْح: المؤسسات الموثّقة، طلبات التوثيق، الإيرادات المسجلة، وطابور مراجعة الإيصالات — مع روابط مباشرة إلى مساحات العمل التشغيلية.",
};

const nf = new Intl.NumberFormat("en-US");

/**
 * Admin overview (Pillar 3 — overview → drill-down).
 *
 * This screen deliberately shows *only* platform-wide signals: totals, the
 * activity trend, a compact receipt queue and the institution approval queue.
 * The heavy work — OCR reconciliation, the full ledger, user administration —
 * lives in its own workspace, and every tile here links straight to it, so the
 * dashboard stays readable while remaining a real control room.
 */
export default async function AdminOverviewPage() {
  await requireAdminPage();

  /*
   * Every figure on this screen is read from PostgreSQL in one parallel
   * round: counts, receipts, institutions, the 7-day activity series and the
   * verification totals. There is no bundled snapshot to fall back on.
   */
  const [live, receipts, institutions, activity, totals, finance] =
    await Promise.all([
      loadAdminLiveCounts(),
      loadPaymentReceipts(),
      loadAdminInstitutions(),
      loadActivitySeries(),
      loadAdminTotals(),
      loadFinanceStats(),
    ]);
  const source = sourcePill(live.source);

  const pendingReceipts = receipts.filter(
    (receipt) => receipt.status === "PENDING"
  );
  const pendingInstitutions = institutions.filter(
    (row) => row.state === "PENDING"
  );

  const columns: Column<AdminInstitutionRow>[] = [
    {
      key: "name",
      header: "المؤسسة",
      cell: (row) => (
        <span className="font-semibold text-sarh-navy dark:text-white">
          {row.name}
        </span>
      ),
    },
    { key: "type", header: "النوع", cell: (row) => row.type },
    { key: "zone", header: "المنطقة", cell: (row) => row.zone },
    { key: "owner", header: "المالك", cell: (row) => row.owner },
    {
      key: "state",
      header: "الحالة",
      cell: (row) => {
        const pill = institutionPill(row.state);
        return <StatusPill tone={pill.tone}>{pill.label}</StatusPill>;
      },
    },
    {
      key: "actions",
      header: "إجراء",
      align: "end",
      cell: () => (
        <Link
          href="/admin/trust"
          className="text-xs font-bold text-sarh-teal hover:underline"
        >
          مراجعة
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["الإدارة"]}
        title="لوحة تحكم الإدارة"
        lead="إدارة ومتابعة جميع نشاطات المنصة: التوثيق، المالية، والمستخدمون — في مكان واحد."
        icon={LayoutDashboard}
        actions={
          <StatusPill tone={source.tone}>
            {source.label}
          </StatusPill>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="إجمالي المؤسسات"
          value={nf.format(live.institutions)}
          hint="مؤسسة عاملة على المنصة"
          icon={Building2}
          accent="teal"
          href="/admin/institutions"
          cta="إدارة المؤسسات"
        />
        <StatCard
          label="طلبات التوثيق"
          value={nf.format(totals.trustRequests)}
          hint="في انتظار المراجعة والاعتماد"
          icon={ShieldCheck}
          accent="navy"
          href="/admin/trust"
          cta="فتح الطابور"
        />
        <StatCard
          label="الإيرادات المسجلة"
          value={`₪${nf.format(finance.totalRevenue)}`}
          hint={`عمولة محصلة ₪${nf.format(finance.collectedCommissions)}`}
          icon={CircleDollarSign}
          accent="teal"
          href="/admin/finance"
          cta="المركز المالي"
        />
        <StatCard
          label="الإيصالات قيد المراجعة"
          value={String(pendingReceipts.length)}
          hint="بانتظار المطابقة والاعتماد"
          icon={Receipt}
          accent="gold"
          href="/admin/finance"
          cta="مطابقة OCR"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-5">
          <Panel
            title="مراجعة الإيصالات"
            description="تحقّق من الإيصالات المرسلة من المؤسسات واعتمدها بعد المراجعة."
            icon={Receipt}
            moreHref="/admin/finance"
          >
            {pendingReceipts.length > 0 ? (
              <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                {pendingReceipts.map((receipt) => {
                  const pill = paymentPill(receipt.status);
                  return (
                    <li key={receipt.id}>
                      <Link
                        href="/admin/finance"
                        className="block rounded-xl border border-sarh-borderLight p-3 transition-colors hover:border-sarh-teal/50 hover:bg-sarh-teal/5 dark:border-sarh-borderDark"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            #{receipt.id.replace("pay-", "")} إيصال
                          </span>
                          <Receipt
                            className="h-4 w-4 text-sarh-teal"
                            aria-hidden="true"
                          />
                        </span>
                        <span className="mt-2 block">
                          <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                        </span>
                        <span className="mt-1.5 block text-[11px] text-slate-400" dir="ltr">
                          {receipt.date}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">
                لا توجد إيصالات بانتظار المراجعة — الطابور نظيف.
              </p>
            )}
          </Panel>

          <Panel
            title="طلبات اعتماد المؤسسات"
            description="مراجعة طلبات المؤسسات الجديدة وإضافتها إلى الدليل."
            icon={Building2}
            moreHref="/admin/trust"
          >
            <DataTable
              columns={columns}
              rows={
                pendingInstitutions.length > 0
                  ? pendingInstitutions
                  : institutions.slice(0, 4)
              }
              rowKey={(row) => row.id}
            />
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel
            title="نشاط المنصة"
            description="آخر ٧ أيام"
            icon={TrendingUp}
          >
            <ActivityChart points={activity} />
          </Panel>

          <Panel
            title="إجمالي التوثيقات هذا الشهر"
            icon={BadgeCheck}
            moreHref="/admin/trust"
          >
            <div className="flex items-end justify-between gap-3">
              <p
                className="font-mono text-3xl font-bold tabular-nums text-sarh-navy dark:text-white"
                dir="ltr"
              >
                {nf.format(totals.monthlyVerifications)}
              </p>
              <StatusPill tone="teal">
                ↑ {Math.round(totals.verificationTrend * 100)}%
              </StatusPill>
            </div>
            <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
              مؤسسة تم توثيقها واعتمادها خلال آخر ٣٠ يوماً — بزيادة{" "}
              {Math.round(totals.verificationTrend * 100)}% عن الفترة السابقة.
            </p>
          </Panel>

          <Panel
            title="أحدث الإيصالات"
            icon={Receipt}
            moreHref="/admin/finance"
          >
            <ul className="divide-y divide-sarh-borderLight dark:divide-sarh-borderDark">
              {receipts.slice(0, 4).map((receipt) => {
                const pill = paymentPill(receipt.status);
                return (
                  <li key={receipt.id}>
                    <Link
                      href="/admin/finance"
                      className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-sarh-teal"
                    >
                      <span>
                        <span className="block text-xs font-bold text-sarh-navy dark:text-slate-200">
                          الإيصال #{receipt.id.replace("pay-", "")}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-slate-400" dir="ltr">
                          {receipt.date}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                        <ArrowLeft
                          className="h-3.5 w-3.5 text-slate-300"
                          aria-hidden="true"
                        />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel
            title="المستخدمون بحسب الفئة"
            description={`${nf.format(live.users)} حساب مسجّل، ${nf.format(live.verifiedUsers)} مفعّل`}
            icon={Users}
            moreHref="/admin/users"
          >
            <ul className="space-y-2.5">
              {live.byTier.map((row) => (
                <li
                  key={`${row.tier}-${row.extra.join("-")}`}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    {ROLE_LABEL[row.tier as keyof typeof ROLE_LABEL] ?? row.tier}
                    {row.extra.length > 0 ? (
                      <span className="ms-1 text-[11px] font-bold text-sarh-gold">
                        +{row.extra.length} صلاحية إضافية
                      </span>
                    ) : null}
                  </span>
                  <span
                    className="font-mono font-bold tabular-nums text-sarh-navy dark:text-white"
                    dir="ltr"
                  >
                    {nf.format(row.count)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="اختصارات إدارية" icon={Sparkles}>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {[
                { href: "/admin/trust", label: "طابور التوثيق" },
                { href: "/admin/institutions", label: "دليل المؤسسات" },
                { href: "/admin/users", label: "إدارة المستخدمين" },
                { href: "/admin/settings", label: "إعدادات المنصة" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="flex items-center justify-between gap-2 rounded-xl border border-sarh-borderLight px-3 py-2.5 text-xs font-bold text-sarh-navy transition-colors hover:border-sarh-teal/50 hover:bg-sarh-teal/5 dark:border-sarh-borderDark dark:text-slate-200"
                  >
                    {link.label}
                    <ArrowLeft className="h-3.5 w-3.5 text-sarh-teal" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
