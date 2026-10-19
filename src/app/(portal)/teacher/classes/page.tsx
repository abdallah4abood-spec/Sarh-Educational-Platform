import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { ArrowLeft, BookOpen, ClipboardList, Users } from "lucide-react";

import { Meter, PageHeader, Panel, StatCard } from "@/components/portal/primitives";
import { StatusPill, attendancePill } from "@/components/portal/status-pill";
import { authOptions } from "@/lib/auth";
import {
  loadClassRoster,
  loadTeacherOverview,
  loadTeacherWorkload,
} from "@/lib/db/teacher";

export const metadata: Metadata = {
  title: "الفصول الدراسية",
  description:
    "فصول المعلم مع نسب تقدّم الخطة والحضور وقوائم الطلاب — مساحة العمل التنفيذية التي ينطلق منها التحضير وتسجيل الحضور.",
};

/**
 * Teacher → My classes (drill-down of the “فصولي” panel).
 *
 * Execution view: each class with its progress, and the roster of the first
 * class rendered inline so a teacher can act without another hop. Attendance
 * marking itself lives in `/teacher/attendance`.
 */
export default async function TeacherClassesPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  const [overview, workload] = userId
    ? await Promise.all([
        loadTeacherOverview(userId),
        loadTeacherWorkload(userId),
      ])
    : [null, { total: 0, graded: 0, pending: 0 }];
  const classes = overview?.classes ?? [];
  const totalStudents = classes.reduce((sum, klass) => sum + klass.students, 0);

  // The first class's roster is rendered inline so the teacher can act
  // without another hop — scoped by the loader to this teacher's own class.
  const focusClass = classes[0];
  const focusRoster =
    userId && focusClass
      ? ((await loadClassRoster(userId, focusClass.id))?.students ?? [])
      : [];

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["بوابة المعلم", "الفصول الدراسية"]}
        title="الفصول الدراسية"
        lead="تقدّم الخطة ومؤشر الحضور لكل فصل من فصولك، مع قوائم الطلاب المسندة إليك."
        icon={BookOpen}
        actions={
          <Link
            href="/teacher/attendance"
            className="inline-flex items-center gap-1.5 rounded-xl bg-sarh-teal px-4 py-2.5 text-xs font-bold text-white shadow-teal-glow"
          >
            تسجيل الحضور
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="الفصول النشطة"
          value={String(classes.length)}
          hint="خلال الفصل الدراسي الحالي"
          icon={BookOpen}
          accent="teal"
        />
        <StatCard
          label="إجمالي الطلاب"
          value={String(totalStudents)}
          hint="في جميع فصولك"
          icon={Users}
          accent="navy"
        />
        <StatCard
          label="واجبات بانتظار التصحيح"
          value={String(workload.pending)}
          hint={`من إجمالي ${workload.total} واجباً`}
          icon={ClipboardList}
          accent="gold"
        />
      </div>

      <Panel
        title="فصولي"
        description="تقدّم الخطة ونسبة الحضور"
        icon={BookOpen}
      >
        <ul className="grid gap-4 lg:grid-cols-3">
          {classes.map((klass) => (
            <li
              key={klass.id}
              className="rounded-2xl border border-sarh-borderLight p-4 dark:border-sarh-borderDark"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-sarh-navy dark:text-white">
                    {klass.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {klass.subject} — {klass.room}
                  </p>
                </div>
                <StatusPill tone="slate">{klass.students} طالباً</StatusPill>
              </div>

              <div className="mt-4 space-y-3">
                <Meter
                  label="تقدّم الخطة"
                  value={klass.planProgress * 100}
                  accent="teal"
                />
                <Meter
                  label="نسبة الحضور"
                  value={klass.attendanceRate * 100}
                  accent="gold"
                />
              </div>

              <p className="mt-3 text-[11px] text-slate-400">
                الحصة القادمة: {klass.nextLesson} · {klass.weeklyLessons} حصص
                أسبوعياً
              </p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title={`قائمة ${focusClass?.name ?? "فصل"}`}
        description={
          focusClass
            ? `${focusRoster.length} من ${focusClass.students} طالباً معروضون`
            : "لا فصول مسندة إليك بعد"
        }
        icon={Users}
        moreHref="/teacher/attendance"
        moreLabel="سجل الحضور الكامل"
      >
        <ul className="divide-y divide-sarh-borderLight dark:divide-sarh-borderDark">
          {focusRoster.map((student) => {
            const pill = attendancePill(student.attendance);
            return (
              <li
                key={student.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-sarh-navy dark:text-white">
                    {student.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {student.notes === "—" ? "لا ملاحظات" : student.notes}
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
    </div>
  );
}
