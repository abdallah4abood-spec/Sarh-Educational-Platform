import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { ArrowLeft, CircleDollarSign, Clock3, ShieldCheck, Wallet, XCircle } from "lucide-react";

import { PageHeader, Panel, StatCard } from "@/components/portal/primitives";
import { StatusPill, paymentPill } from "@/components/portal/status-pill";
import { DataTable, type Column } from "@/components/ui/data-table";
import { authOptions } from "@/lib/auth";
import type { CommissionRow } from "@/lib/data/institution";
import {
  loadInstitutionCommissions,
  resolveInstitutionId,
} from "@/lib/db/institution";

export const metadata: Metadata = {
  title: "التسجيلات والعمولات",
  description:
    "الطلاب الذين وصلوا إلى المركز عبر منصة صَرْح: قيمة عمولة التسجيل وحالة اعتمادها، مع ملخص مالي لنطاق المؤسسة فقط.",
};

const nf = new Intl.NumberFormat("en-US");

/**
 * Institution → Enrollments & commissions.
 *
 * Center-scoped money. The platform's own ledger lives in `/admin/finance`;
 * this screen only ever shows the referrals attributed to this tenant, which is
 * exactly the boundary Pillar 4 asks for.
 */
export default async function InstitutionEnrollmentsPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const institutionId = userId ? await resolveInstitutionId(userId) : null;
  const commissions = institutionId
    ? await loadInstitutionCommissions(institutionId, 100)
    : [];

  const verified = commissions.filter((row) => row.status === "VERIFIED");
  const pending = commissions.filter((row) => row.status === "PENDING");
  const rejected = commissions.filter((row) => row.status === "REJECTED");

  const sum = (rows: CommissionRow[]) =>
    rows.reduce((total, row) => total + row.referralFee, 0);

  const columns: Column<CommissionRow>[] = [
    {
      key: "student",
      header: "الطالب",
      cell: (row) => (
        <div>
          <p className="font-semibold text-sarh-navy dark:text-white">
            {row.studentName}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {row.gradeLevel}
          </p>
        </div>
      ),
    },
    { key: "center", header: "المركز", cell: (row) => row.centerName },
    {
      key: "date",
      header: "تاريخ التسجيل",
      cell: (row) => (
        <span className="font-mono text-xs tabular-nums" dir="ltr">
          {row.registeredAt}
        </span>
      ),
    },
    {
      key: "fee",
      header: "عمولة التسجيل",
      align: "center",
      cell: (row) => (
        <span className="font-mono font-bold tabular-nums" dir="ltr">
          ₪{nf.format(row.referralFee)}
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
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["بوابة المؤسسة", "التسجيلات والعمولات"]}
        title="التسجيلات والعمولات"
        lead="الطلاب الواصلون عبر صَرْح، وقيمة العمولة وحالة اعتمادها داخل حساب مركزك."
        icon={Wallet}
        actions={
          <Link
            href="/institution/ai-studio"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-sarh-teal hover:underline"
          >
            جدول العمولات في الاستوديو
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="عمولات معتمدة"
          value={`₪${nf.format(sum(verified))}`}
          hint={`${verified.length} تسجيلات مرصودة`}
          icon={ShieldCheck}
          accent="teal"
        />
        <StatCard
          label="بانتظار الاعتماد"
          value={`₪${nf.format(sum(pending))}`}
          hint={`${pending.length} تسجيلات قيد المراجعة`}
          icon={Clock3}
          accent="gold"
        />
        <StatCard
          label="عمولات مرفوضة"
          value={`₪${nf.format(sum(rejected))}`}
          hint={`${rejected.length} تسجيل مرفوض`}
          icon={XCircle}
          accent="rose"
        />
        <StatCard
          label="إجمالي التسجيلات"
          value={String(commissions.length)}
          hint="من بداية الفصل الدراسي"
          icon={CircleDollarSign}
          accent="navy"
        />
      </div>

      <Panel
        title="سجل التسجيلات"
        description={`${commissions.length} تسجيلاً عبر المنصة`}
        icon={Wallet}
      >
        <DataTable
          columns={columns}
          rows={commissions}
          rowKey={(row) => row.id}
        />
      </Panel>

      <p className="rounded-2xl bg-sarh-teal/8 px-4 py-3 text-xs leading-6 text-slate-600 dark:bg-white/5 dark:text-slate-300">
        يُعتمد أي تسجيل بعد مطابقة الإيصال في المركز المالي للمنصة، ثم يظهر هنا
        فوراً بحالة <strong>معتمد</strong> — ولا تُحتسب أي عمولة قبل هذه المطابقة.
      </p>
    </div>
  );
}
