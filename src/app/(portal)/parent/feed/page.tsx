import type { Metadata } from "next";
import { getServerSession } from "next-auth";

import { GuardianAccessNotice } from "@/components/parent/guardian-access-notice";
import { authOptions } from "@/lib/auth";
import { loadChildLogs, loadFeedChildren } from "@/lib/db/parent";
import { resolveGuardianAccess } from "@/lib/guardian-access";

import { ChildFeed } from "./child-feed";

export const metadata: Metadata = {
  title: "يوميتي — متابعة الطفل",
  description:
    "تغذية يومية لطفلك: الحضور وبرنامج اليوم والأنشطة وصور اليوم ومسؤول الاستلام، مع ملخص المعلم بالذكاء الاصطناعي وقائمة الواجبات — تعمل بالكامل دون إنترنت عبر Dexie (IndexedDB).",
};

/**
 * Child Daily Feed (Design.md Prompt 3) — Mobile-first PWA screen inside the
 * Parent Portal. Guarded by `middleware.ts` (RBAC: PARENT only).
 *
 * The server page reads the family's children and their daily logs from
 * PostgreSQL for the accounts holding an APPROVED guardian link, and hands the
 * feed plain serializable data; the client component owns clock-dependent
 * rendering and the Dexie cache, so hydration stays clean.
 */
export default async function ParentFeedPage() {
  const session = await getServerSession(authOptions);
  const access = await resolveGuardianAccess(session?.user?.id);

  if (!access.ok) return <GuardianAccessNotice reason={access.reason} />;

  // The feed is institutional data, so it only ever offers children with an
  // APPROVED grant. A linked child without one stays an identity card on
  // `/parent/children` and contributes no logs, grades or announcements here.
  const children = (await loadFeedChildren(access.access)).filter(
    (child) => child.institutionId
  );
  const logsByChild = await Promise.all(
    children.map((child) => loadChildLogs(access.access, child.id))
  );
  const logs = logsByChild.flatMap((map) => [...map.values()]);

  if (children.length === 0) {
    return (
      <div className="sarh-card p-10 text-center">
        <p className="font-bold text-sarh-navy dark:text-white">
          لا يوجد وصول مؤسسي بعد.
        </p>
        <p className="mt-2 text-sm text-sarh-inkMute dark:text-slate-400">
          أضف طفلك من صفحة «أبنائي» ثم استخدم رمز الدعوة من مركزه؛ تظهر اليومية
          فقط بعد اعتماد المركز.
        </p>
      </div>
    );
  }

  return <ChildFeed kids={children} logs={logs} />;
}
