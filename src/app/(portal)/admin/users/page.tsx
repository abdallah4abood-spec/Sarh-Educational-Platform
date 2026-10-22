import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, UserCheck, UserX, Users } from "lucide-react";

import { PageHeader, Panel, StatCard } from "@/components/portal/primitives";
import { StatusPill, accountPill, sourcePill } from "@/components/portal/status-pill";
import { DataTable, type Column } from "@/components/ui/data-table";
import { requireAdminPage } from "@/lib/admin-page";
import type { AdminUserRow } from "@/lib/data/portal";
import { loadAdminLiveCounts, loadAdminUsers } from "@/lib/db/admin";
import { ROLE_LABEL } from "@/lib/roles";

export const metadata: Metadata = {
  title: "إدارة المستخدمين",
  description:
    "إدارة مستخدمي المنصة: الفئات والصلاحيات الإضافية وحالة تفعيل البريد — مع أرقام مباشرة من قاعدة البيانات عند توفرها.",
};

const nf = new Intl.NumberFormat("en-US");

/**
 * Admin → Users.
 *
 * The one admin screen that prefers the database over the bundled rows: user
 * totals are exactly what an operator must not see stale, so counts come from
 * `loadAdminLiveCounts()` and the header states which source produced them
 * instead of pretending the bundled snapshot is live.
 */
export default async function AdminUsersPage() {
  await requireAdminPage();

  const [live, users] = await Promise.all([
    loadAdminLiveCounts(),
    loadAdminUsers(),
  ]);
  const source = sourcePill(live.source);
  const multiTier = users.filter((row) => row.extraTiers.length > 0);

  const columns: Column<AdminUserRow>[] = [
    {
      key: "name",
      header: "المستخدم",
      cell: (row) => (
        <div className="min-w-44">
          <p className="font-semibold text-sarh-navy dark:text-white">{row.name}</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400" dir="ltr">
            {row.email}
          </p>
        </div>
      ),
    },
    {
      key: "tier",
      header: "الفئة",
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill tone="navy">
            {ROLE_LABEL[row.tier as keyof typeof ROLE_LABEL] ?? row.tier}
          </StatusPill>
          {row.extraTiers.map((tier) => (
            <StatusPill key={tier} tone="violet">
              +{ROLE_LABEL[tier as keyof typeof ROLE_LABEL] ?? tier}
            </StatusPill>
          ))}
        </div>
      ),
    },
    {
      key: "phone",
      header: "الهاتف",
      cell: (row) =>
        row.phone ? (
          <span className="font-mono text-xs tabular-nums" dir="ltr">
            {row.phone}
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    {
      key: "joinedAt",
      header: "تاريخ الانضمام",
      cell: (row) => (
        <span className="font-mono text-xs tabular-nums" dir="ltr">
          {row.joinedAt}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      align: "end",
      cell: (row) => {
        const pill = accountPill(row.status);
        return <StatusPill tone={pill.tone}>{pill.label}</StatusPill>;
      },
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["الإدارة", "المستخدمون"]}
        title="إدارة المستخدمين"
        lead="كل حسابات المنصة وفئاتها وحالة تفعيلها — أوقف حساباً أو تابع من لم يؤكّد بريده بعد."
        icon={Users}
        actions={
          <StatusPill tone={source.tone}>{source.label}</StatusPill>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="إجمالي المستخدمين"
          value={nf.format(live.users)}
          hint="حسابات مسجّلة على المنصة"
          icon={Users}
          accent="navy"
        />
        <StatCard
          label="حسابات مفعّلة"
          value={nf.format(live.verifiedUsers)}
          hint="أكّدت بريدها الإلكتروني"
          icon={UserCheck}
          accent="teal"
        />
        <StatCard
          label="بانتظار التفعيل"
          value={nf.format(live.unverifiedUsers)}
          hint="لم تفتح رابط التأكيد بعد"
          icon={UserX}
          accent="gold"
        />
        <StatCard
          label="حسابات متعددة الفئات"
          value={nf.format(multiTier.length)}
          hint="تظهر لها قائمة تبديل البوابات"
          icon={ShieldCheck}
          accent="teal"
        />
      </div>

      <Panel
        title="المستخدمون بحسب الفئة"
        description="مقروءة مباشرة من قاعدة البيانات"
        icon={Users}
      >
        <ul className="flex flex-wrap gap-2">
          {live.byTier.map((row) => (
            <li
              key={`${row.tier}-${row.extra.join("-")}`}
              className="flex items-center gap-2 rounded-xl border border-sarh-borderLight px-3 py-2 dark:border-sarh-borderDark"
            >
              <span className="text-xs font-bold text-sarh-navy dark:text-slate-200">
                {ROLE_LABEL[row.tier as keyof typeof ROLE_LABEL] ?? row.tier}
              </span>
              <span
                className="font-mono text-xs font-bold tabular-nums text-sarh-teal"
                dir="ltr"
              >
                {nf.format(row.count)}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="سجل المستخدمين"
        description={`${users.length} حساباً معروضاً`}
        icon={Users}
      >
        <DataTable columns={columns} rows={users} rowKey={(row) => row.id} />
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel title="صلاحيات متعددة" icon={ShieldCheck}>
          <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
            الحسابات التي تملك أكثر من فئة واحدة تستطيع التبديل بين بواباتها من
            الشريط العلوي دون تسجيل خروج — ولا يُسمح بالتبديل إلى فئة لا يملكها
            الحساب فعلاً، فالمفتاح يُقرأ من قاعدة البيانات لا من المتصفح.
          </p>
        </Panel>

        <Panel title="تفعيل الحسابات" icon={UserX}>
          <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
            الحساب غير المفعّل لا يستطيع دخول أي بوابة: الوسيط (middleware) يعيده
            إلى صفحة الدخول مع إشعار إعادة إرسال رابط التأكيد.
          </p>
          <Link
            href="/admin/institutions"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-sarh-teal hover:underline"
          >
            مراجعة المؤسسات
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Panel>
      </div>
    </div>
  );
}
