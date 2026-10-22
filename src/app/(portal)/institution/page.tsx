import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  Check,
  Gauge,
  GraduationCap,
  Sparkles,
  Star,
  Store,
  Users,
  Wallet,
  X,
} from "lucide-react";

import { Meter, PageHeader, Panel, StatCard } from "@/components/portal/primitives";
import { StatusPill, paymentPill, staffPill } from "@/components/portal/status-pill";
import { DataTable, type Column } from "@/components/ui/data-table";
import { authOptions } from "@/lib/auth";
import type { StaffRow } from "@/lib/data/portal";
import {
  loadDirectoryChecklist,
  loadInstitutionCommissions,
  loadInstitutionHeader,
  loadInstitutionStaff,
} from "@/lib/db/institution";
import {
  hasCapability,
  requestedInstitutionId,
  resolveInstitutionAccess,
} from "@/lib/institution-access";

export const metadata: Metadata = {
  title: "لوحة المؤسسة",
  description:
    "إدارة المركز: الطاقم التعليمي والفصول، تسجيلات المنصة وعمولاتها، واكتمال ملف المركز في الدليل العام — كل ذلك في نطاق مؤسستك وحدها.",
};

const nf = new Intl.NumberFormat("en-US");

/**
 * Institution overview (Pillar 4 — multi-tenant center administration).
 *
 * Scoped to one center: its staff, its classes, its referrals, its public
 * directory profile. Nothing here can see another center's rows or the
 * platform ledger — that is `/admin`'s job — which is what keeps the tenant
 * boundary honest rather than decorative.
 */
export default async function InstitutionOverviewPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  /*
   * The tenant comes from a server-verified grant, never from the URL alone:
   * `?institution=` selects among centres the account actually owns or
   * manages, and any other id is refused below. Every read is keyed on the
   * resulting access token, so one centre can never render another's rows.
   */
  const requested = requestedInstitutionId(searchParams);
  const access = userId
    ? await resolveInstitutionAccess(userId, requested)
    : null;
  if (requested && !access) notFound();

  const canViewCommissions = access
    ? hasCapability(access, "commissions.read")
    : false;
  const [header, staff, commissions, checklist] = access
    ? await Promise.all([
        loadInstitutionHeader(access),
        loadInstitutionStaff(access),
        // Financial rows are not even queried for a non-owner CENTER_ADMIN.
        canViewCommissions
          ? loadInstitutionCommissions(access)
          : Promise.resolve([]),
        loadDirectoryChecklist(access),
      ])
    : [null, [], [], []];

  const activeStaff = staff.filter((row) => row.status === "ACTIVE").length;
  const totalClasses = staff.reduce((sum, row) => sum + row.classes, 0);
  const pendingCommissions = commissions.filter(
    (row) => row.status === "PENDING"
  );
  const pendingValue = pendingCommissions.reduce(
    (sum, row) => sum + row.referralFee,
    0
  );
  const verifiedSeats = commissions.filter(
    (row) => row.status === "VERIFIED"
  ).length;
  const occupancy = commissions.length ? verifiedSeats / commissions.length : 0;
  const doneChecklist = checklist.filter((item) => item.done).length;
  const profileCompletion = checklist.length
    ? Math.round((doneChecklist / checklist.length) * 100)
    : 0;

  const columns: Column<StaffRow>[] = [
    {
      key: "name",
      header: "الاسم",
      cell: (row) => (
        <span className="font-semibold text-sarh-navy dark:text-white">
          {row.name}
        </span>
      ),
    },
    { key: "role", header: "المنصب", cell: (row) => row.role },
    { key: "subjects", header: "التخصص", cell: (row) => row.subjects },
    {
      key: "classes",
      header: "الفصول",
      align: "center",
      cell: (row) => <span className="font-mono tabular-nums">{row.classes}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      align: "end",
      cell: (row) => {
        const pill = staffPill(row.status);
        return <StatusPill tone={pill.tone}>{pill.label}</StatusPill>;
      },
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["بوابة المؤسسة"]}
        title={header?.name ?? "لوحة المؤسسة"}
        lead={`إدارة الطاقم والفصول وملف المركز في الدليل — ${header?.zone ?? "—"}`}
        icon={Building2}
        actions={
          header?.verified ? (
            <StatusPill tone="teal" icon={BadgeCheck}>
              مؤسسة موثّقة
            </StatusPill>
          ) : (
            <StatusPill tone="gold">بانتظار التوثيق</StatusPill>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="الطاقم التعليمي"
          value={String(staff.length)}
          hint={`${activeStaff} عضو نشط حالياً`}
          icon={Users}
          accent="teal"
          href="/institution/staff"
          cta="إدارة الطاقم"
        />
        <StatCard
          label="الفصول النشطة"
          value={String(totalClasses)}
          hint="موزعة على أعضاء الطاقم"
          icon={GraduationCap}
          accent="navy"
          href="/institution/staff"
        />
        {canViewCommissions ? (
          <StatCard
            label="عمولات بانتظار الاعتماد"
            value={`₪${nf.format(pendingValue)}`}
            hint={`${pendingCommissions.length} تسجيلات من المنصة`}
            icon={Wallet}
            accent="gold"
            href="/institution/enrollments"
            cta="التسجيلات"
          />
        ) : null}
        <StatCard
          label="اكتمال ملف الدليل"
          value={`${profileCompletion}%`}
          hint={`${doneChecklist} من ${checklist.length} بنود مكتملة`}
          icon={Store}
          accent="teal"
          href="/institution/profile"
          cta="تطوير الملف"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <Panel
            title="الطاقم التعليمي"
            description="أعضاء المركز وفصولهم وحالتهم"
            icon={Users}
            moreHref="/institution/staff"
          >
            <DataTable
              columns={columns}
              rows={staff}
              rowKey={(row) => row.id}
            />
          </Panel>

          {canViewCommissions ? (
          <Panel
            title="التسجيلات والعمولات"
            description="طلاب وصلوا إلى المركز عبر منصة صَرْح"
            icon={Wallet}
            moreHref="/institution/enrollments"
          >
            <ul className="divide-y divide-sarh-borderLight dark:divide-sarh-borderDark">
              {commissions.slice(0, 5).map((row) => {
                const pill = paymentPill(row.status);
                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-sarh-navy dark:text-white">
                        {row.studentName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {row.gradeLevel} — {row.centerName}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className="font-mono text-xs font-bold tabular-nums text-sarh-navy dark:text-slate-200"
                        dir="ltr"
                      >
                        ₪{nf.format(row.referralFee)}
                      </span>
                      <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
          ) : null}
        </div>

        <div className="space-y-5">
          <Panel
            title="ملف المركز في الدليل"
            description={
              canViewCommissions
                ? `تقييم ${header?.rating ?? 0} من ${verifiedSeats} تسجيلاً موثّقاً`
                : "تقييم المركز واكتمال ملف الدليل"
            }
            icon={Store}
            moreHref="/institution/profile"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-sarh-gold">
                <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                <span dir="ltr">
                  {header?.rating ?? 0}
                  {canViewCommissions ? ` (${verifiedSeats})` : ""}
                </span>
              </span>
              <Meter
                value={profileCompletion}
                accent="teal"
                valueLabel={`${profileCompletion}%`}
              />
            </div>

            <ul className="space-y-2.5">
              {checklist.map((item) => (
                <li key={item.id} className="flex items-start gap-2">
                  <span
                    className={
                      item.done
                        ? "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-sarh-teal text-white"
                        : "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-sarh-gold text-white"
                    }
                  >
                    {item.done ? (
                      <Check className="h-2.5 w-2.5" aria-hidden="true" />
                    ) : (
                      <X className="h-2.5 w-2.5" aria-hidden="true" />
                    )}
                  </span>
                  <span>
                    <span className="block text-xs font-bold text-sarh-navy dark:text-slate-200">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                      {item.hint}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="أداء المركز"
            icon={Gauge}
          >
            <div className="space-y-4">
              {canViewCommissions ? (
                <Meter
                  label="نسبة الإشغال هذا الفصل"
                  value={occupancy * 100}
                  accent="teal"
                />
              ) : (
                <p className="rounded-xl bg-sarh-gold/10 px-3 py-2.5 text-xs leading-6 text-[#C9741F] dark:text-sarh-gold">
                  بيانات الإشغال والعمولات متاحة لمالك المركز فقط.
                </p>
              )}
              <Meter
                label="رضا الأهالي (من المراجعات)"
                value={((header?.rating ?? 0) / 5) * 100}
                accent="gold"
              />
            </div>
            <p className="mt-4 text-xs leading-6 text-slate-500 dark:text-slate-400">
              نسبة الإشغال تُحسب من المقاعد المحجوزة عبر المنصة مقابل الطاقة
              الاستيعابية المُعلنة في ملف الدليل.
            </p>
          </Panel>

          <Panel
            title="استوديو المعلم والذكاء الاصطناعي"
            description={
              canViewCommissions
                ? "الحضور السريع، توليد الاختبارات، وجدول العمولات"
                : "الحضور السريع وتوليد الاختبارات"
            }
            icon={Sparkles}
            moreHref="/institution/ai-studio"
            moreLabel="فتح الاستوديو"
          >
            <p className="text-sm leading-7 text-slate-500 dark:text-slate-400">
              {canViewCommissions
                ? "استخدم أدوات صَرْح الذكية لتحضير الحصص، تسجيل الحضور بضغطة واحدة، ومراجعة عمولات التسجيلات قبل اعتمادها."
                : "استخدم أدوات صَرْح الذكية لتحضير الحصص وتسجيل الحضور بضغطة واحدة."}
            </p>
            <Link
              href="/institution/ai-studio"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-sarh-teal hover:underline"
            >
              ابدأ الآن
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}
