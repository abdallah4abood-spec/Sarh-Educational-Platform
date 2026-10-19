import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { CheckCircle2, Clock3, Sparkles, UserCheck, UserX } from "lucide-react";

import { PageHeader, Panel, StatCard } from "@/components/portal/primitives";
import { StatusPill, attendancePill } from "@/components/portal/status-pill";
import { authOptions } from "@/lib/auth";
import { loadTeacherAttendanceBoard } from "@/lib/db/teacher";

export const metadata: Metadata = {
  title: "الحضور والغياب",
  description:
    "سجل حضور الطلاب لكل فصل مع ملخص الحاضرين والمتأخرين والغائبين، وتسجيل الحضور الفوري — محفوظ محلياً ومتزامن عند عودة الاتصال.",
};

/**
 * Teacher → Attendance (drill-down of the attendance tile).
 *
 * The roster summary is read from the same rows the classroom tool writes, so
 * the numbers here and in `/teacher/ai-studio` cannot diverge. Marking itself
 * is the offline-first grid in the shared attendance tracker.
 */
export default async function TeacherAttendancePage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const board = userId ? await loadTeacherAttendanceBoard(userId) : [];

  const rows = board.flatMap((klass) =>
    klass.students.map((student) => ({
      ...student,
      className: klass.name,
      classId: klass.id,
    }))
  );

  const present = rows.filter((row) => row.attendance === "PRESENT").length;
  const late = rows.filter((row) => row.attendance === "LATE").length;
  const absent = rows.filter((row) => row.attendance === "ABSENT").length;

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["بوابة المعلم", "الحضور والغياب"]}
        title="الحضور والغياب"
        lead="ملخص حضور اليوم في كل فصولك، وقوائم الطلاب بحالتهم — مع تسجيل فوري يعمل دون إنترنت."
        icon={UserCheck}
        actions={
          <Link
            href="/teacher/ai-studio"
            className="inline-flex items-center gap-1.5 rounded-xl bg-sarh-teal px-4 py-2.5 text-xs font-bold text-white shadow-teal-glow"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            تسجيل الحضور الآن
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="حاضرون"
          value={String(present)}
          hint="من إجمالي الطلاب"
          icon={CheckCircle2}
          accent="teal"
        />
        <StatCard
          label="متأخرون"
          value={String(late)}
          hint="تأخّر صباحي مسجّل"
          icon={Clock3}
          accent="gold"
        />
        <StatCard
          label="غائبون"
          value={String(absent)}
          hint="بحاجة لمتابعة ولي الأمر"
          icon={UserX}
          accent="rose"
        />
      </div>

      {board.map((klass) => {
        const roster = klass.students;
        return (
          <Panel
            key={klass.id}
            title={klass.name}
            description={`${klass.subject} — ${roster.length} طالباً`}
            icon={UserCheck}
            moreHref="/teacher/ai-studio"
            moreLabel="فتح الحضور"
          >
            <ul className="divide-y divide-sarh-borderLight dark:divide-sarh-borderDark">
              {roster.map((student) => {
                const pill = attendancePill(student.attendance);
                return (
                  <li
                    key={student.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-sarh-navy dark:text-white">
                        {student.name}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {student.guardian}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className="font-mono text-xs font-bold tabular-nums text-slate-500 dark:text-slate-400"
                        dir="ltr"
                      >
                        {student.score}%
                      </span>
                      <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        );
      })}

      <p className="rounded-2xl bg-sarh-gold/10 px-4 py-3 text-xs leading-6 text-[#B4641A] dark:text-sarh-gold">
        يستخدم صَرْح حفظاً محلياً فورياً (Dexie / IndexedDB) أثناء انقطاع
        الإنترنت، ثم يُرسل سجل الحضور تلقائياً إلى الخادم عند عودة الاتصال — دون
        فقدان أي تعديل.
      </p>
    </div>
  );
}
