import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { ArrowRight, ShieldCheck, UserCog } from "lucide-react";

import { PageHeader, Panel } from "@/components/portal/primitives";
import { StaffInvitationManager } from "@/components/institution/staff-invitation-manager";
import { requireAdminPage } from "@/lib/admin-page";
import { authOptions } from "@/lib/auth";
import {
  listStaffInvitations,
  superAdminInvitationActor,
} from "@/lib/db/staff-invitations";
import { prisma } from "@/lib/prisma";
import { STAFF_ROLE_LABEL } from "@/lib/staff-invitations";

export const metadata: Metadata = {
  title: "إدارة دعوات مدير المركز",
  description:
    "شاشة إدارة المنصة المحدودة: دعوة مدير مركز (CENTER_ADMIN) لمؤسسة واحدة، مع سحب الدعوات وإعادة إرسالها.",
};
export const dynamic = "force-dynamic";

/**
 * D6 — `/admin/institutions/[id]/staff`.
 *
 * The one deliberately narrow platform screen: it manages invitations for the
 * `CENTER_ADMIN` role of exactly one institution, and nothing else.
 *
 * Boundaries, all enforced server-side:
 *
 *   • `requireAdminPage()` re-reads `SUPER_ADMIN` from the database on every
 *     render (a stale 30-day JWT cannot open it);
 *   • every read and write is scoped to `params.id`; an invitation id from
 *     another centre is a 404, never an action;
 *   • the target role is the constant `CENTER_ADMIN` — the form has no role
 *     field and the API body schema rejects nothing else because it does not
 *     accept a role at all;
 *   • `Institution.ownerId` is displayed, never written, and no membership can
 *     be created, edited or removed from here.
 */
export default async function AdminInstitutionStaffPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminPage();
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) notFound();

  const institution = await prisma.institution.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      zone: true,
      trustStatus: true,
      owner: { select: { fullName: true } },
      _count: { select: { staff: true } },
    },
  });
  if (!institution) notFound();

  const invitations = await listStaffInvitations(
    superAdminInvitationActor(userId, institution.id)
  );

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["لوحة الإدارة", "المؤسسات", institution.name, "دعوات المدير"]}
        title="دعوات مدير المركز"
        lead={`دعوة مدير مركز (CENTER_ADMIN) لمؤسسة «${institution.name}» — الإنشاء وإعادة الإرسال والسحب فقط.`}
        icon={UserCog}
      />

      <Panel
        title="بيانات المؤسسة"
        description="للقراءة فقط — الملكية وإدارة الأعضاء ليست جزءاً من هذه الشاشة"
        icon={ShieldCheck}
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-[11px] text-sarh-inkMute">المؤسسة</dt>
            <dd className="font-semibold text-sarh-navy dark:text-white">
              {institution.name}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-sarh-inkMute">المنطقة</dt>
            <dd className="font-semibold text-sarh-navy dark:text-white">
              {institution.zone}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-sarh-inkMute">المالك</dt>
            <dd className="font-semibold text-sarh-navy dark:text-white">
              {institution.owner.fullName}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-sarh-inkMute">أعضاء الطاقم</dt>
            <dd className="font-mono font-semibold text-sarh-navy dark:text-white">
              {institution._count.staff}
            </dd>
          </div>
        </dl>
        <p className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-sarh-inkMute">
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
          <Link
            href="/admin/institutions"
            className="underline underline-offset-4"
          >
            العودة إلى قائمة المؤسسات
          </Link>
        </p>
      </Panel>

      <Panel
        title="دعوات مدير المركز"
        description="دور واحد فقط: مدير مركز — بقية الأدوار تُدار من بوابة المؤسسة نفسها"
        icon={UserCog}
      >
        <StaffInvitationManager
          institutionId={institution.id}
          createEndpoint={`/api/admin/institutions/${encodeURIComponent(institution.id)}/staff`}
          itemEndpoint={`/api/admin/institutions/${encodeURIComponent(institution.id)}/staff/{id}`}
          roles={[{ value: "CENTER_ADMIN", label: STAFF_ROLE_LABEL.CENTER_ADMIN }]}
          invitations={invitations}
          description="الدعوة تنشئ عضوية CENTER_ADMIN نشطة عند قبولها من الحساب نفسه بعد تأكيد بريده. لا تُعدّل هذه الشاشة الملكية ولا عضويات أخرى."
        />
      </Panel>
    </div>
  );
}
