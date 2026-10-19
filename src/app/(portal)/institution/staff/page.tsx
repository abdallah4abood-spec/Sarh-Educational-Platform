import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { GraduationCap, MailPlus, UserCheck, UserCog, Users } from "lucide-react";

import { PageHeader, Panel, StatCard } from "@/components/portal/primitives";
import { StatusPill, staffPill } from "@/components/portal/status-pill";
import { DataTable, type Column } from "@/components/ui/data-table";
import { authOptions } from "@/lib/auth";
import type { StaffRow } from "@/lib/data/portal";
import {
  loadInstitutionStaff,
  resolveInstitutionId,
} from "@/lib/db/institution";

export const metadata: Metadata = {
  title: "الطاقم التعليمي",
  description:
    "إدارة طاقم المركز: المناصب والتخصصات والفصول المسندة وحالة كل عضو، مع الدعوات المعلّقة — في نطاق مؤسستك فقط.",
};

/**
 * Institution → Staff.
 *
 * Multi-tenant scoping is the point of this screen: it lists the staff of
 * *this* center. Adding members happens by invitation, which is why the pending
 * invite is surfaced here instead of hiding inside a form.
 */
export default async function InstitutionStaffPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const institutionId = userId ? await resolveInstitutionId(userId) : null;
  const staff = institutionId ? await loadInstitutionStaff(institutionId) : [];

  const active = staff.filter((row) => row.status === "ACTIVE");
  const onLeave = staff.filter((row) => row.status === "ON_LEAVE");
  const pendingInvites = staff.filter(
    (row) => row.status === "PENDING_INVITE"
  );
  const totalClasses = staff.reduce((sum, row) => sum + row.classes, 0);

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
      header: "الفصول المسندة",
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
        breadcrumb={["بوابة المؤسسة", "الطاقم التعليمي"]}
        title="الطاقم التعليمي"
        lead="أعضاء مركزك ومناصبهم وفصولهم، ودعوات الانتظار التي لم تُقبل بعد."
        icon={Users}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="إجمالي الطاقم"
          value={String(staff.length)}
          hint="أعضاء مسجّلون في المركز"
          icon={Users}
          accent="navy"
        />
        <StatCard
          label="أعضاء نشطون"
          value={String(active.length)}
          hint="على رأس العمل الآن"
          icon={UserCheck}
          accent="teal"
        />
        <StatCard
          label="في إجازة"
          value={String(onLeave.length)}
          hint="يحتاجون ترتيب بديل مؤقت"
          icon={UserCog}
          accent="gold"
        />
        <StatCard
          label="الفصول المسندة"
          value={String(totalClasses)}
          hint="مجموع فصول الطاقم"
          icon={GraduationCap}
          accent="teal"
        />
      </div>

      <Panel
        title="أعضاء المركز"
        description="المنصب والتخصص والفصول المسندة"
        icon={Users}
      >
        <DataTable columns={columns} rows={staff} rowKey={(row) => row.id} />
      </Panel>

      {pendingInvites.length > 0 ? (
        <Panel
          title="دعوات بانتظار القبول"
          description="أُرسلت الدعوة ولم تُفعّل بعد"
          icon={MailPlus}
        >
          <ul className="space-y-3">
            {pendingInvites.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sarh-gold/40 bg-sarh-gold/8 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-bold text-sarh-navy dark:text-white">
                    {member.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {member.role} — {member.subjects}
                  </p>
                </div>
                <StatusPill tone="slate">
                  سيتم تجديد الدعوة تلقائياً بعد ٤٨ ساعة
                </StatusPill>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
