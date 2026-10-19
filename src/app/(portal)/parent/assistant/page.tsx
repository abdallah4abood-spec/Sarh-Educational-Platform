import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { ArrowLeft, BookOpen, Lightbulb, Sparkles } from "lucide-react";

import { PageHeader, Panel } from "@/components/portal/primitives";
import { authOptions } from "@/lib/auth";
import { loadParentDashboard } from "@/lib/db/parent";

import { AssistantChat } from "./assistant-chat";

export const metadata: Metadata = {
  title: "المساعد الذكي للأهالي",
  description:
    "مساعد تعليمي لأولياء الأمور: اسأل عن أي درس أو مفهوم ليشرحه المساعد الذكي بأسلوب مبسّط يناسب مستوى طفلك — عبر خدمة الذكاء الاصطناعي في منصة صَرْح.",
};

/**
 * Parent → AI assistant (drill-down of the overview's AI panel).
 *
 * Reads the child's weakest subjects from the same performance rows the
 * overview renders, so the study hints next to the chat point at something
 * real instead of generic advice.
 */
export default async function ParentAssistantPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const data = userId
    ? await loadParentDashboard(userId)
    : {
        children: [],
        todayDayPlan: [],
        pendingHomework: 0,
        institutionCount: 0,
        announcements: [],
        messages: [],
        unreadCount: 0,
        performance: [],
        overall: 0,
      };

  const weakest = [...data.performance].sort((a, b) => a.percent - b.percent)[0];
  const childName = data.children[0]?.name;

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["بوابة الأهالي", "المساعد الذكي"]}
        title="المساعد الذكي"
        lead="اسأل أي سؤال تعليمي، ودع المساعد يشرحه لك ولطفلك بأسلوب مبسّط ومتدرّج."
        icon={Sparkles}
        actions={
          <Link
            href="/parent/feed"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-sarh-teal hover:underline"
          >
            يومية الطفل
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <AssistantChat childName={childName} />

        <div className="space-y-5">
          <Panel
            title="نقطة تحتاج دعماً"
            description={`معدل ${childName ?? "الطفل"} العام ${data.overall}%`}
            icon={BookOpen}
          >
            {weakest ? (
              <>
                <p className="text-sm font-bold text-sarh-navy dark:text-white">
                  {weakest.subject}
                </p>
                <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                  أدنى نسبة إنجاز بين المواد ({weakest.percent}%). اطلب من المساعد
                  خطة مراجعة قصيرة لهذه المادة، ثم تابع التقدّم في يومية الطفل.
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">لا بيانات أداء بعد.</p>
            )}

            <ul className="mt-4 space-y-2">
              {data.performance.map((row) => (
                <li
                  key={row.subject}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="text-slate-500 dark:text-slate-400">
                    {row.subject}
                  </span>
                  <span
                    className="font-mono font-bold tabular-nums text-sarh-navy dark:text-slate-200"
                    dir="ltr"
                  >
                    {row.percent}%
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="كيف تستفيد أكثر؟" icon={Lightbulb}>
            <ul className="space-y-3 text-xs leading-6 text-slate-500 dark:text-slate-400">
              <li>
                اسأل عن <strong>مفهوم واحد</strong> في كل مرة لتحصل على شرح أعمق.
              </li>
              <li>
                اطلب <strong>أمثلة من المنهج</strong> أو تمريناً قصيراً للتطبيق بعد
                الشرح.
              </li>
              <li>
                المساعد لا يعدّل أي بيانات أو رسوم — كل ما يفعله هو الشرح
                والتوضيح.
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
