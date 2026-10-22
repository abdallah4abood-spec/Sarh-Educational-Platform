"use client";

import { GraduationCap, Sparkles, Zap } from "lucide-react";

import { AttendanceTracker } from "@/components/ai/attendance-tracker";
import { QuizGeneratorStudio } from "@/components/ai/quiz-generator";
import type {
  CommissionRow,
  RosterStudent,
} from "@/lib/data/institution";
import { CommissionTable } from "./commission-table";

/**
 * AI Teacher Studio shell (Design.md Prompt 4) — composes the quick
 * attendance grid, the AI quiz generator and the commission tracking table.
 *
 * The attendance grid and the quiz generator are *shared* components
 * (`@/components/ai/*`) so the teacher portal renders the identical tools
 * instead of a copy. The commission table stays local: center billing belongs
 * to the institution tier and must not appear in the teacher workspace.
 */
export function AiStudioClient({
  institutionId,
  institutionName,
  roster,
  commissions,
  subjects,
  canViewCommissions,
}: {
  institutionId: string;
  institutionName: string;
  roster: RosterStudent[];
  commissions: CommissionRow[];
  subjects: string[];
  canViewCommissions: boolean;
}) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="flex items-center gap-1.5 text-xs font-bold text-sarh-teal">
          <span>صَرْح</span>
          <span className="text-slate-400">/</span>
          <span className="text-slate-500 dark:text-slate-400">بوابة المعلمين</span>
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-sarh-navy dark:text-white">
              <Sparkles className="h-6 w-6 text-sarh-gold" aria-hidden="true" />
              استوديو المعلم
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {canViewCommissions
                ? "حضور فوري بحفظ محلي، واختبارات مولّدة بالذكاء الاصطناعي، ومتابعة العمولات."
                : "حضور فوري بحفظ محلي، واختبارات مولّدة بالذكاء الاصطناعي."}
            </p>
          </div>
          <span className="flex items-center gap-2 rounded-full bg-sarh-teal/10 px-4 py-1.5 text-xs font-bold text-sarh-teal ring-1 ring-inset ring-sarh-teal/30">
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
            {institutionName}
          </span>
        </div>
      </header>

      <div className="space-y-6">
        <AttendanceTracker roster={roster} institutionId={institutionId} />
        <QuizGeneratorStudio subjects={subjects} />
        {canViewCommissions ? (
          <>
            <div className="flex items-center gap-2 text-xs font-bold text-sarh-inkMute">
              <Zap className="h-3.5 w-3.5 text-sarh-gold" aria-hidden="true" />
              العمولات تُحدَّث فور اعتماد الإدارة المالية
            </div>
            <CommissionTable rows={commissions} />
          </>
        ) : null}
      </div>
    </div>
  );
}
