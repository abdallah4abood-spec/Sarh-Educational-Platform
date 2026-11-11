import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import {
  ArrowLeft,
  Clock,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";

import { PageHeader, Panel, StatCard } from "@/components/portal/primitives";
import { StatusPill } from "@/components/portal/status-pill";
import { DataTable, type Column } from "@/components/ui/data-table";
import { authOptions } from "@/lib/auth";
import type {
  ApprovedGuardianRow,
  GuardianApprovalRow,
} from "@/lib/data/institution";
import {
  loadApprovedGuardians,
  loadPendingGuardianApprovals,
} from "@/lib/db/guardian-approvals";
import {
  hasCapability,
  requestedInstitutionId,
  resolveInstitutionAccess,
} from "@/lib/institution-access";

import { ApprovalActions } from "./approval-actions";
import { RevokeGrantAction } from "./revoke-grant-action";

export const metadata: Metadata = {
  title: "أولياء الأمور",
  description:
    "طلبات ربط أولياء الأمور المعلّقة والأوصياء المعتمدون في نطاق مؤسستك وحدها.",
};

const dateFormat = new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" });

function dateLabel(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : dateFormat.format(date);
}

/**
 * Institution → Guardians.
 *
 * The phase 4.3 approval queue. A join code no longer grants anything: it
 * opens a PENDING request for **this centre**, and approving it writes an
 * APPROVED `StudentGuardianGrant` for this centre only. The same family link
 * may hold a separate grant at another centre; neither decision opens the
 * other centre's records, and revoking one leaves the other untouched.
 *
 * The queue never shows another centre's request: the loader filters on the
 * grant's institution and on an ACTIVE enrollment here.
 */
export default async function InstitutionGuardiansPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const requested = requestedInstitutionId(searchParams);
  const access = userId
    ? await resolveInstitutionAccess(userId, requested)
    : null;
  if (requested && !access) notFound();

  if (access && !hasCapability(access, "guardians.read")) {
    return (
      <div className="space-y-5">
        <PageHeader
          breadcrumb={["بوابة المؤسسة", "أولياء الأمور"]}
          title="أولياء الأمور"
          lead="طلبات الربط والأوصياء المعتمدون."
          icon={Users}
        />
        <Panel title="هذه الشاشة محمية" icon={LockKeyhole}>
          <p className="text-sm leading-7 text-sarh-inkMute dark:text-slate-400">
            إدارة روابط أولياء الأمور متاحة لمالك المركز ومديره فقط.
          </p>
          <Link
            href="/institution"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-sarh-tealInk dark:text-sarh-teal hover:underline"
          >
            العودة إلى لوحة المؤسسة
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Panel>
      </div>
    );
  }

  const [pending, approved] = access
    ? await Promise.all([
        loadPendingGuardianApprovals(access),
        loadApprovedGuardians(access),
      ])
    : [[], []];

  const canDecide = access ? hasCapability(access, "guardians.approve") : false;

  const pendingColumns: Column<GuardianApprovalRow>[] = [
    {
      key: "student",
      header: "الطالب",
      cell: (row) => (
        <span className="font-semibold text-sarh-navy dark:text-white">
          {row.studentName}
        </span>
      ),
    },
    {
      key: "guardian",
      header: "ولي الأمر",
      cell: (row) => (
        <div>
          <p className="font-semibold text-sarh-navy dark:text-white">
            {row.guardianName}
          </p>
          <p
            className="mt-0.5 text-[11px] text-sarh-inkMute dark:text-slate-400"
            dir="ltr"
          >
            {row.guardianEmail}
          </p>
        </div>
      ),
    },
    {
      key: "relation",
      header: "الصلة",
      cell: (row) => row.relation ?? "—",
    },
    {
      key: "requestedAt",
      header: "تاريخ الطلب",
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {dateLabel(row.requestedAt)}
        </span>
      ),
    },
    {
      key: "decision",
      header: "القرار",
      align: "center",
      cell: (row) =>
        canDecide && access ? (
          <ApprovalActions
            linkId={row.linkId}
            institutionId={access.institutionId}
            studentName={row.studentName}
          />
        ) : (
          <span className="text-[11px] text-sarh-inkMute dark:text-slate-400">للقراءة فقط</span>
        ),
    },
  ];

  const approvedColumns: Column<ApprovedGuardianRow>[] = [
    {
      key: "student",
      header: "الطالب",
      cell: (row) => (
        <span className="font-semibold text-sarh-navy dark:text-white">
          {row.studentName}
        </span>
      ),
    },
    {
      key: "guardian",
      header: "ولي الأمر",
      cell: (row) => (
        <div>
          <p className="font-semibold text-sarh-navy dark:text-white">
            {row.guardianName}
          </p>
          <p
            className="mt-0.5 text-[11px] text-sarh-inkMute dark:text-slate-400"
            dir="ltr"
          >
            {row.guardianEmail}
          </p>
        </div>
      ),
    },
    {
      key: "primary",
      header: "جهة الاتصال",
      align: "center",
      cell: (row) =>
        row.isPrimary ? (
          <StatusPill tone="teal">أساسي</StatusPill>
        ) : (
          <span className="text-xs text-sarh-inkMute dark:text-slate-400">إضافي</span>
        ),
    },
    {
      key: "approvedAt",
      header: "تاريخ الاعتماد",
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {dateLabel(row.approvedAt)}
        </span>
      ),
    },
    {
      key: "revoke",
      header: "الإجراء",
      align: "center",
      cell: (row) =>
        canDecide && access ? (
          <RevokeGrantAction
            grantId={row.grantId}
            institutionId={access.institutionId}
            studentName={row.studentName}
          />
        ) : (
          <span className="text-[11px] text-sarh-inkMute dark:text-slate-400">للقراءة فقط</span>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["بوابة المؤسسة", "أولياء الأمور"]}
        title="أولياء الأمور"
        lead="راجع طلبات الربط التي فتحها رمز الدعوة، واعتمد من يرى سجلات الطفل في مركزك فقط — لا يُمنح أي وصول قبل قرارك."
        icon={UserCheck}
        actions={
          <Link
            href="/institution/students"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-sarh-tealInk dark:text-sarh-teal hover:underline"
          >
            الطلاب والتسجيلات
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="طلبات معلّقة"
          value={String(pending.length)}
          hint="بانتظار قرارك"
          icon={Clock}
          accent="gold"
        />
        <StatCard
          label="أوصياء معتمدون"
          value={String(approved.length)}
          hint="منح سارية لهذا المركز"
          icon={ShieldCheck}
          accent="teal"
        />
        <StatCard
          label="جهات اتصال أساسية"
          value={String(approved.filter((row) => row.isPrimary).length)}
          hint="تظهر في كشوف المعلمين"
          icon={Users}
          accent="navy"
        />
      </div>

      <Panel
        title="طلبات الربط المعلّقة"
        description={`${pending.length} طلباً في نطاق مؤسستك`}
        icon={KeyRound}
      >
        <DataTable
          columns={pendingColumns}
          rows={pending}
          rowKey={(row) => row.linkId}
          emptyMessage="لا توجد طلبات معلّقة — كل رمز دعوة أصدرته إما لم يُستهلك أو تم البتّ فيه"
        />
      </Panel>

      <Panel
        title="الأوصياء المعتمدون"
        description={`${approved.length} رابطاً معتمداً لطلاب هذا المركز`}
        icon={ShieldCheck}
      >
        <DataTable
          columns={approvedColumns}
          rows={approved}
          rowKey={(row) => row.linkId}
          emptyMessage="لا يوجد ولي أمر معتمد بعد"
        />
      </Panel>

      <div className="space-y-3 rounded-2xl bg-sarh-gold/10 px-4 py-4 text-xs leading-6 text-slate-700 dark:bg-white/5 dark:text-slate-300">
        <p>
          <strong>نطاق الاعتماد:</strong> الموافقة تمنح ولي الأمر رؤية سجلات
          الطفل <strong>في هذا المركز فقط</strong>. المركز الآخر يحتاج قراراً
          مستقلاً منه، وسحب هذا المنح لا يمسّ منح المراكز الأخرى.
        </p>
        <p>
          <strong>المسؤولية:</strong> كل مركز مسؤول عن قراره هو. اعتماد مركز آخر
          لا يلزمك ولا يمنحك صلاحية اتخاذ قرار نيابة عنه، ورفضك لا يغيّر قراره.
        </p>
        <p>
          الطالب الذي لا يملك منحة معتمدة هنا يظهر في الكشوف باسم «—»، ولا يمنح
          الرمز وحده أي وصول قبل هذا القرار.
        </p>
      </div>
    </div>
  );
}
