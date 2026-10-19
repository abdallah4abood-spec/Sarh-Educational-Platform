import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { GraduationCap, Sparkles } from "lucide-react";

import { AttendanceTracker } from "@/components/ai/attendance-tracker";
import { QuizGeneratorStudio } from "@/components/ai/quiz-generator";
import { authOptions } from "@/lib/auth";
import { loadTeacherStudio } from "@/lib/db/teacher";

export const metadata: Metadata = {
  title: "مساعد الذكاء الاصطناعي للمعلم",
  description:
    "أدوات المعلم الذكية: تسجيل حضور فوري بحفظ محلي ومزامنة في الخلفية، وتوليد اختبارات تفاعلية عبر خدمة الذكاء الاصطناعي في صَرْح.",
};

/**
 * Teacher → AI assistant (drill-down of the overview's AI panel).
 *
 * Composes the *shared* teaching tools (`@/components/ai/*`) that the
 * institution studio also renders — one implementation, two portals (Pillar
 * 2). The commission table is deliberately absent: center billing is
 * institution-scoped and a teacher account must never see it.
 */
export default async function TeacherAiStudioPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const studio = userId
    ? await loadTeacherStudio(userId)
    : { roster: [], institutionId: "", subjects: [] };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold text-sarh-teal">
            <span>صَرْح</span>
            <span className="text-slate-400">/</span>
            <span className="text-slate-500 dark:text-slate-400">
              بوابة المعلم
            </span>
            <span className="text-slate-400">/</span>
            <span className="text-slate-500 dark:text-slate-400">
              مساعد الذكاء الاصطناعي
            </span>
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-sarh-navy dark:text-white">
            <Sparkles className="h-6 w-6 text-sarh-gold" aria-hidden="true" />
            مساعد الذكاء الاصطناعي
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-7 text-slate-500 dark:text-slate-400">
            سجّل الحضور بضغطة واحدة، وولّد اختبارات وأسئلة تفاعلية من درس اليوم —
            الأدوات نفسها التي يستخدمها معلمو المراكز على منصة صَرْح.
          </p>
        </div>

        <span className="flex items-center gap-2 rounded-full bg-sarh-teal/10 px-4 py-1.5 text-xs font-bold text-sarh-teal ring-1 ring-inset ring-sarh-teal/30">
          <GraduationCap className="h-4 w-4" aria-hidden="true" />
          نطاقك التعليمي فقط
        </span>
      </header>

      <AttendanceTracker
        roster={studio.roster}
        institutionId={studio.institutionId}
      />
      <QuizGeneratorStudio subjects={studio.subjects} />
    </div>
  );
}
