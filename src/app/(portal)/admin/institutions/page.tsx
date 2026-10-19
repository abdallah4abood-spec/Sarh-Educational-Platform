import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Building2, CircleDollarSign, ShieldCheck, Star, Users } from "lucide-react";

import { PageHeader, Panel, StatCard } from "@/components/portal/primitives";
import { StatusPill, institutionPill } from "@/components/portal/status-pill";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { AdminInstitutionRow } from "@/lib/data/portal";
import { loadAdminInstitutions } from "@/lib/db/admin";

export const metadata: Metadata = {
  title: "إدارة المؤسسات",
  description:
    "دليل مؤسسات المنصة: النوع والمنطقة والمالك والتقييم وعدد الطلاب وحالة التوثيق وعمولة المنصة — لإدارة كل المراكز والروضات.",
};

const nf = new Intl.NumberFormat("en-US");

/**
 * Admin → Institutions.
 *
 * The platform-wide directory of tenants (Pillar 4, tier 4). Reviewing *new*
 * submissions stays in the trust queue (`/admin/trust`) so this screen remains
 * the register of what is already live.
 */
export default async function AdminInstitutionsPage() {
  const institutions = await loadAdminInstitutions();

  const verified = institutions.filter((row) => row.state === "VERIFIED");
  const pending = institutions.filter((row) => row.state === "PENDING");
  const students = institutions.reduce((sum, row) => sum + row.students, 0);
  const commissions = institutions.reduce(
    (sum, row) => sum + row.commission,
    0
  );

  const columns: Column<AdminInstitutionRow>[] = [
    {
      key: "name",
      header: "المؤسسة",
      cell: (row) => (
        <div className="min-w-44">
          <p className="font-semibold text-sarh-navy dark:text-white">{row.name}</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {row.type} — {row.zone}
          </p>
        </div>
      ),
    },
    { key: "owner", header: "المالك", cell: (row) => row.owner },
    {
      key: "rating",
      header: "التقييم",
      align: "center",
      cell: (row) => (
        <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums">
          <Star className="h-3 w-3 fill-sarh-gold text-sarh-gold" aria-hidden="true" />
          {row.rating}
        </span>
      ),
    },
    {
      key: "students",
      header: "الطلاب",
      align: "center",
      cell: (row) => (
        <span className="font-mono tabular-nums">{nf.format(row.students)}</span>
      ),
    },
    {
      key: "commission",
      header: "عمولة المنصة",
      align: "center",
      cell: (row) => (
        <span className="font-mono font-bold tabular-nums" dir="ltr">
          ₪{nf.format(row.commission)}
        </span>
      ),
    },
    {
      key: "state",
      header: "التوثيق",
      align: "end",
      cell: (row) => {
        const pill = institutionPill(row.state);
        return <StatusPill tone={pill.tone}>{pill.label}</StatusPill>;
      },
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["الإدارة", "المؤسسات"]}
        title="إدارة المؤسسات"
        lead="سجل كل المراكز والروضات العاملة على صَرْح، مع حالتها الموثّقة وعمولتها المحصّلة."
        icon={Building2}
        actions={
          <Link
            href="/admin/trust"
            className="inline-flex items-center gap-1.5 rounded-xl bg-sarh-teal px-4 py-2.5 text-xs font-bold text-white shadow-teal-glow"
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            طلبات التوثيق ({pending.length})
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="مؤسسات في السجل"
          value={String(institutions.length)}
          hint="مراكز وروضات معروضة هنا"
          icon={Building2}
          accent="navy"
        />
        <StatCard
          label="مؤسسات موثّقة"
          value={String(verified.length)}
          hint="ظهرت شارة التوثيق"
          icon={ShieldCheck}
          accent="teal"
        />
        <StatCard
          label="إجمالي الطلاب"
          value={nf.format(students)}
          hint="مسجّلون عبر هذه المؤسسات"
          icon={Users}
          accent="teal"
        />
        <StatCard
          label="عمولات محصّلة"
          value={`₪${nf.format(commissions)}`}
          hint="من التسجيلات المرجعية"
          icon={CircleDollarSign}
          accent="gold"
          href="/admin/finance"
          cta="المركز المالي"
        />
      </div>

      <Panel
        title="سجل المؤسسات"
        description={`${institutions.length} مؤسسة`}
        icon={Building2}
        moreHref="/admin/trust"
        moreLabel="طابور التوثيق"
      >
        <DataTable
          columns={columns}
          rows={institutions}
          rowKey={(row) => row.id}
        />
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel title="مؤسسات معلّقة" icon={ShieldCheck} description="تحتاج قراراً">
          {pending.length > 0 ? (
            <ul className="space-y-2">
              {pending.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-sarh-gold/40 bg-sarh-gold/8 px-3 py-2.5"
                >
                  <span className="text-xs font-bold text-sarh-navy dark:text-white">
                    {row.name}
                  </span>
                  <Link
                    href="/admin/trust"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-sarh-teal hover:underline"
                  >
                    مراجعة
                    <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">لا توجد مؤسسات معلّقة.</p>
          )}
        </Panel>

        <Panel title="ملاحظة على النطاق" icon={Building2}>
          <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
            هذه الشاشة للمشرف العام فقط. لا تستطيع إدارة أي مؤسسة الوصول إليها،
            ولا ترى إلا سجل مركزها وعمولاته في بوابة المؤسسة — وهو الفصل الصارم
            بين الطبقتين الرابعة والثالثة في مصفوفة الصلاحيات.
          </p>
        </Panel>
      </div>
    </div>
  );
}
