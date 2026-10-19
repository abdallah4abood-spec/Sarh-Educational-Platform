import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  LifeBuoy,
  Sparkles,
  Sun,
  UserCheck,
  Users,
} from "lucide-react";

import { PageHeader, Panel, StatCard, Meter } from "@/components/portal/primitives";
import { StatusPill } from "@/components/portal/status-pill";
import { authOptions } from "@/lib/auth";
import { loadTeacherOverview, loadTeacherWorkload } from "@/lib/db/teacher";

export const metadata: Metadata = {
  title: "لوحة المعلم",
  description:
    "ملخّص يوم المعلم: جدول اليوم بحالات الحصص، فصولك ونسب تقدّم الخطة والحضور، والواجبات المصححة والمعلّقة، واختصارات أدوات الذكاء الاصطناعي.",
};

const SLOT_STATUS: Record<string, { label: string; tone: "teal" | "gold" | "slate" }> = {
  DONE: { label: "انتهت", tone: "slate" },
  NOW: { label: "الآن", tone: "teal" },
  UPCOMING: { label: "قادمة", tone: "gold" },
};

/**
 * Teacher overview (Pillar 2 — execution tier).
 *
 * Execution work only: what is happening today, how far into the plan each
 * class is, and what is waiting to be graded. Everything here drills into a
 * teacher-owned workspace; nothing on this screen reads another tier's data,
 * which is the functional boundary the supervisor portal exists to hold.
 */
export default async function TeacherOverviewPage() {
  const session = await getServerSession(authOptions);
  const firstName = (session?.user?.name ?? "أستاذنا").split(" ")[0];
  const userId = session?.user?.id;

  /*
   * Everything below is read from PostgreSQL for the signed-in teacher:
   * their own classes, their own timetable, and the grading load derived
   * from the homework recorded in their classes' daily logs.
   */
  const [overview, workload] = userId
    ? await Promise.all([
        loadTeacherOverview(userId),
        loadTeacherWorkload(userId),
      ])
    : [null, { total: 0, graded: 0, pending: 0 }];
  const classes = overview?.classes ?? [];
  const today = overview?.today ?? [];

  const totalStudents = classes.reduce((sum, klass) => sum + klass.students, 0);
  const deliveredToday = today.filter((slot) => slot.status !== "UPCOMING").length;

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["بوابة المعلم"]}
        title="لوحة المعلم"
        lead="كل ما تحتاجه ليومك الدراسي: جدولك، فصولك، الحضور، وأدوات التحضير الذكية."
        icon={BookOpen}
      />

      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-sarh-teal/12 via-sarh-gold/10 to-sarh-bgLight p-6 ring-1 ring-inset ring-sarh-teal/20 dark:bg-none dark:bg-sarh-cardDark dark:ring-white/10">
        <p className="flex items-center gap-2 text-xl font-bold text-sarh-navy dark:text-white">
          مرحباً، {firstName} <span aria-hidden="true">👋</span>
        </p>
        <p className="mt-1.5 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
          معلمنا الكريم تصفح فصلك اليوم، وسنُطلعك بالواجبات التي بحاجة إلى تصحيح
          ومساعدات الذكاء الاصطناعي التي تُوفّر وقتك.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-bold text-sarh-tealDeep ring-1 ring-inset ring-sarh-teal/25 dark:bg-white/10 dark:text-sarh-teal">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            {today.length} حصص اليوم
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-bold text-[#B4641A] ring-1 ring-inset ring-sarh-gold/40 dark:bg-white/10 dark:text-sarh-gold">
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {workload.pending} واجبات بانتظار التصحيح
          </span>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="إجمالي الطلاب"
          value={String(totalStudents)}
          hint="في جميع فصولك"
          icon={Users}
          accent="navy"
          href="/teacher/classes"
        />
        <StatCard
          label="الفصول الدراسية"
          value={String(classes.length)}
          hint="فصول نشطة هذا الفصل"
          icon={BookOpen}
          accent="teal"
          href="/teacher/classes"
        />
        <StatCard
          label="المهام والواجبات"
          value={String(workload.total)}
          hint={`منها ${workload.pending} بانتظار التصحيح`}
          icon={ClipboardList}
          accent="gold"
          href="/teacher/classes"
        />
        <StatCard
          label="حصص اليوم المنتهية"
          value={`${deliveredToday}/${today.length}`}
          hint="متابعة لحظية لجدول اليوم"
          icon={UserCheck}
          accent="teal"
          href="/teacher/schedule"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Panel
            title="جدولي اليومي"
            description="حالة كل حصة تتحدّث مع تقدّم اليوم"
            icon={CalendarDays}
            moreHref="/teacher/schedule"
          >
            <ul className="divide-y divide-sarh-borderLight dark:divide-sarh-borderDark">
              {today.map((slot) => {
                const status = SLOT_STATUS[slot.status];
                return (
                  <li
                    key={slot.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="font-mono text-xs font-bold tabular-nums text-slate-500 dark:text-slate-400"
                        dir="ltr"
                      >
                        {slot.start} - {slot.end}
                      </span>
                      <span
                        className={
                          slot.kind === "activity"
                            ? "rounded-full bg-sarh-gold/15 px-2.5 py-1 text-[11px] font-bold text-[#B4641A] dark:text-sarh-gold"
                            : "rounded-full bg-sarh-teal/10 px-2.5 py-1 text-[11px] font-bold text-sarh-tealDeep dark:text-sarh-teal"
                        }
                      >
                        {slot.kind === "activity" ? "نشاط" : "حصة دراسية"}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-sarh-navy dark:text-white">
                        {slot.subject}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {slot.className} — {slot.room}
                      </p>
                    </div>
                    <StatusPill tone={status.tone}>{status.label}</StatusPill>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel
            title="فصولي"
            description="تقدّم الخطة ونسب الحضور لكل فصل"
            icon={BookOpen}
            moreHref="/teacher/classes"
          >
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {classes.map((klass) => (
                <li key={klass.id}>
                  <Link
                    href="/teacher/classes"
                    className="block h-full rounded-xl border border-sarh-borderLight p-4 transition-colors hover:border-sarh-teal/50 hover:bg-sarh-teal/5 dark:border-sarh-borderDark"
                  >
                    <p className="text-sm font-bold text-sarh-navy dark:text-white">
                      {klass.name}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {klass.subject} — {klass.students} طالباً
                    </p>
                    <div className="mt-3 space-y-2.5">
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
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel
            title="مساعدك الذكي في التعليم"
            description="استخدم أدوات الذكاء الاصطناعي لتحضير الدروس وتوليد الأسئلة"
            icon={Sparkles}
            moreHref="/teacher/ai-studio"
            moreLabel="فتح الاستوديو"
          >
            <ul className="grid gap-2">
              {[
                { label: "شرح درس", detail: "تفصيل مفهوم بخطوات تعليمية" },
                { label: "حل الواجبات", detail: "تصحيح مقترح لأجوبة الطلاب" },
                { label: "أسئلة تفاعلية", detail: "اختبار قصير جاهز للصف" },
                { label: "تحضير خطة حصة", detail: "خطة مكتوبة بأهداف واضحة" },
              ].map((tool) => (
                <li key={tool.label}>
                  <Link
                    href="/teacher/ai-studio"
                    className="flex items-start justify-between gap-3 rounded-xl border border-sarh-borderLight px-3 py-2.5 transition-colors hover:border-sarh-teal/50 hover:bg-sarh-teal/5 dark:border-sarh-borderDark"
                  >
                    <span>
                      <span className="block text-xs font-bold text-sarh-navy dark:text-slate-200">
                        {tool.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-400">
                        {tool.detail}
                      </span>
                    </span>
                    <ArrowLeft
                      className="mt-1 h-3.5 w-3.5 shrink-0 text-sarh-teal"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="ملخّص اليوم"
            icon={Sun}
            description="أرقامك قبل نهاية الدوام"
          >
            <ul className="space-y-3 text-sm">
              <li className="flex items-center justify-between gap-3">
                <span className="text-slate-500 dark:text-slate-400">
                  حصص منتهية
                </span>
                <span className="font-mono font-bold tabular-nums text-sarh-navy dark:text-white">
                  {deliveredToday}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-slate-500 dark:text-slate-400">
                  واجبات مصحّحة
                </span>
                <span className="font-mono font-bold tabular-nums text-sarh-navy dark:text-white">
                  {workload.graded}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-slate-500 dark:text-slate-400">
                  واجبات معلّقة
                </span>
                <span className="font-mono font-bold tabular-nums text-sarh-navy dark:text-white">
                  {workload.pending}
                </span>
              </li>
            </ul>
          </Panel>

          <Panel title="دعم المعلمين" icon={LifeBuoy}>
            <p className="text-sm leading-7 text-slate-500 dark:text-slate-400">
              نحن هنا للاستماع إلى طلباتك التعليمية وللتنسيق مع إدارة المركز
              بشأن الجداول والحصص.
            </p>
            <Link
              href="/#contact"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-sarh-teal hover:underline"
            >
              تواصل معنا
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}
