import type { Metadata } from "next";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { loadChildLogs, loadFeedChildren } from "@/lib/db/parent";

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
 * PostgreSQL (scoped by the session's parent id) and hands the feed plain
 * serializable data; the client component owns clock-dependent rendering and
 * the Dexie cache, so hydration stays clean.
 */
export default async function ParentFeedPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const children = userId ? await loadFeedChildren(userId) : [];

  const logsByChild = userId
    ? await Promise.all(
        children.map((child) => loadChildLogs(userId, child.id))
      )
    : [];
  const logs = logsByChild.flatMap((map) => [...map.values()]);

  if (children.length === 0) {
    return (
      <div className="sarh-card p-10 text-center">
        <p className="font-bold text-sarh-navy dark:text-white">
          لا يوجد أبناء مسجّلون على حسابك بعد.
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          أضف طفلك من صفحة «أبنائي» لتظهر هنا يوميته وإعلانات مركزه.
        </p>
      </div>
    );
  }

  return <ChildFeed kids={children} logs={logs} />;
}
