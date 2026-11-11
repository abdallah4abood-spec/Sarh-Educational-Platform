import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import {
  ArrowLeft,
  BadgeCheck,
  Clock,
  GraduationCap,
  LockKeyhole,
  ShieldAlert,
  UserPlus,
  Users,
} from "lucide-react";

import { PageHeader, Panel, StatCard } from "@/components/portal/primitives";
import { StatusPill } from "@/components/portal/status-pill";
import { DataTable, type Column } from "@/components/ui/data-table";
import { authOptions } from "@/lib/auth";
import type { InstitutionStudentRow } from "@/lib/data/institution";
import {
  loadInstitutionClassOptions,
  loadInstitutionStudents,
} from "@/lib/db/institution-students";
import { loadPendingGuardianApprovals } from "@/lib/db/guardian-approvals";
import {
  hasCapability,
  requestedInstitutionId,
  resolveInstitutionAccess,
} from "@/lib/institution-access";

import { AddStudentForm } from "./add-student-form";
import { InviteGuardianButton } from "./invite-guardian-button";

export const metadata: Metadata = {
  title: "الطلاب والتسجيلات",
  description:
    "قائمة طلاب المركز وتسجيلاتهم التشغيلية، مع نموذج إضافة طالب جديد وتسجيله داخل المؤسسة — في نطاق مؤسستك وحدها.",
};

const STATE_PILL = {
  ACTIVE: { label: "منتظم", tone: "teal" },
  WITHDRAWN: { label: "منسحب", tone: "slate" },
} as const;

const SOURCE_PILL = {
  INSTITUTION: { label: "تسجيل مؤسسة", tone: "violet" },
  PLATFORM_REFERRAL: { label: "من المنصة", tone: "navy" },
} as const;

/**
 * Institution → Students.
 *
 * The operational counterpart of `/institution/enrollments` (which is money):
 * who is enrolled here, in which class, whether the seat is active, and who —
 * if anyone — is the approved guardian. Intake writes a `Student` and an
 * `Enrollment` in one transaction; the guardian stays empty until a real
 * linking flow exists, which is why the column can legitimately read "—".
 */
export default async function InstitutionStudentsPage({
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

  if (access && !hasCapability(access, "students.read")) {
    return (
      <div className="space-y-5">
        <PageHeader
          breadcrumb={["بوابة المؤسسة", "الطلاب والتسجيلات"]}
          title="الطلاب والتسجيلات"
          lead="سجل الطلاب التشغيلي داخل المركز."
          icon={Users}
        />
        <Panel title="بيانات الطلاب محمية" icon={LockKeyhole}>
          <p className="text-sm leading-7 text-sarh-inkMute dark:text-slate-400">
            إدارة الطلاب متاحة لمالك المركز ومديره فقط. لا يمنح هذا السجل أي
            صلاحية مالية إضافية.
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

  const [students, classes, pendingApprovals] = access
    ? await Promise.all([
        loadInstitutionStudents(access),
        loadInstitutionClassOptions(access),
        hasCapability(access, "guardians.read")
          ? loadPendingGuardianApprovals(access)
          : Promise.resolve([]),
      ])
    : [[], [], []];

  const active = students.filter((row) => row.status === "ACTIVE").length;
  const intake = students.filter((row) => row.source === "INSTITUTION").length;
  const awaitingGuardian = students.filter((row) => row.guardian === "—").length;
  // Inviting a guardian is an operational act: owner and centre director hold
  // `guardians.manage`; every other tier never sees the control.
  const canInvite = access ? hasCapability(access, "guardians.manage") : false;

  const columns: Column<InstitutionStudentRow>[] = [
    {
      key: "student",
      header: "الطالب",
      cell: (row) => (
        <div>
          <p className="font-semibold text-sarh-navy dark:text-white">
            {row.name}
          </p>
          <p className="mt-0.5 text-[11px] text-sarh-inkMute dark:text-slate-400">
            {row.gradeLevel}
          </p>
        </div>
      ),
    },
    {
      key: "class",
      header: "الفصل",
      cell: (row) =>
        row.className ?? (
          <span className="text-xs text-sarh-inkMute dark:text-slate-400">بدون فصل بعد</span>
        ),
    },
    {
      key: "guardian",
      header: "ولي الأمر",
      cell: (row) =>
        row.guardian === "—" ? (
          <span className="text-xs text-sarh-inkMute dark:text-slate-400">—</span>
        ) : (
          row.guardian
        ),
    },
    {
      key: "status",
      header: "حالة التسجيل",
      align: "center",
      cell: (row) => {
        const pill = STATE_PILL[row.status];
        return <StatusPill tone={pill.tone}>{pill.label}</StatusPill>;
      },
    },
    {
      key: "source",
      header: "المصدر",
      align: "center",
      cell: (row) => {
        const pill = SOURCE_PILL[row.source];
        return <StatusPill tone={pill.tone}>{pill.label}</StatusPill>;
      },
    },
    {
      key: "registeredAt",
      header: "تاريخ التسجيل",
      cell: (row) => (
        <span className="font-mono text-xs tabular-nums" dir="ltr">
          {row.registeredAt}
        </span>
      ),
    },
  ];

  if (canInvite && access) {
    columns.push({
      key: "invite",
      header: "دعوة ولي أمر",
      align: "center",
      cell: (row) => (
        <InviteGuardianButton
          studentId={row.studentId}
          studentName={row.name}
          institutionId={access.institutionId}
        />
      ),
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["بوابة المؤسسة", "الطلاب والتسجيلات"]}
        title="الطلاب والتسجيلات"
        lead="أضف طالباً وسجّله في مركزك، وتابع حالة كل مقعد: الفصل، والحالة التشغيلية، وولي الأمر المرتبط."
        icon={Users}
        actions={
          <Link
            href="/institution/enrollments"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-sarh-tealInk dark:text-sarh-teal hover:underline"
          >
            التسجيلات والعمولات
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="إجمالي الطلاب"
          value={String(students.length)}
          hint="تسجيلات هذا المركز"
          icon={Users}
          accent="navy"
        />
        <StatCard
          label="مقاعد منتظمة"
          value={String(active)}
          hint="حالة التسجيل: منتظم"
          icon={BadgeCheck}
          accent="teal"
        />
        <StatCard
          label="تسجيل من المؤسسة"
          value={String(intake)}
          hint="أُنشئ من داخل المركز"
          icon={UserPlus}
          accent="gold"
        />
        <StatCard
          label="بانتظار ربط ولي أمر"
          value={String(awaitingGuardian)}
          hint="لا توجد علاقة معتمدة بعد"
          icon={ShieldAlert}
          accent="rose"
        />
      </div>

      {access ? (
        <Panel
          title="إضافة طالب"
          description="يُحفظ الطالب وتسجيله في معاملة واحدة — لا سجل جزئي"
          icon={GraduationCap}
        >
          <AddStudentForm institutionId={access.institutionId} classes={classes} />
        </Panel>
      ) : (
        <Panel title="لا مؤسسة متاحة" icon={LockKeyhole}>
          <p className="text-sm text-sarh-inkMute dark:text-slate-400">
            لا يملك حسابك ملكية أو عضوية إدارة نشطة في أي مركز.
          </p>
        </Panel>
      )}

      {pendingApprovals.length > 0 ? (
        <Link
          href="/institution/guardians"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sarh-gold/15 px-4 py-3 text-xs font-bold text-[#8A4B12] ring-1 ring-inset ring-sarh-gold/40 transition hover:bg-sarh-gold/20 dark:text-sarh-gold"
        >
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4" aria-hidden="true" />
            {pendingApprovals.length} طلب ربط ولي أمر بانتظار قرارك
          </span>
          <span className="inline-flex items-center gap-1">
            مراجعة الطلبات
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </Link>
      ) : null}

      <Panel
        title="سجل الطلاب"
        description={`${students.length} تسجيلاً في هذا المركز`}
        icon={Users}
      >
        <DataTable
          columns={columns}
          rows={students}
          rowKey={(row) => row.enrollmentId}
          emptyMessage="لا يوجد طلاب مسجّلون في هذا المركز بعد"
        />
      </Panel>

      <p className="rounded-2xl bg-sarh-teal/8 px-4 py-3 text-xs leading-6 text-slate-600 dark:bg-white/5 dark:text-slate-300">
        الطالب الذي تضيفه المؤسسة لا يحصل تلقائياً على وصول ولي الأمر: الرمز
        يُنشئ <strong>طلب ربط</strong> فقط، ولا يُمنح الوصول إلا بعد اعتماد المركز
        من صفحة «أولياء الأمور». يظهر هنا باسم «—» إلى أن يكتمل ذلك.
      </p>
    </div>
  );
}
