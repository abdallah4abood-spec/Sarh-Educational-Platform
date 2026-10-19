import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { ArrowLeft, CalendarDays, Clock, MapPin } from "lucide-react";

import { Meter, PageHeader, Panel } from "@/components/portal/primitives";
import { StatusPill } from "@/components/portal/status-pill";
import { authOptions } from "@/lib/auth";
import { loadTeacherOverview } from "@/lib/db/teacher";

export const metadata: Metadata = {
  title: "جدولي اليومي",
  description:
    "جدول اليوم الدراسي للمعلم بالتفصيل: أوقات الحصص والقاعات والفصول وحالة كل حصة، مع الحمل الأسبوعي لكل فصل.",
};

const SLOT_STATUS: Record<
  string,
  { label: string; tone: "teal" | "gold" | "slate" }
> = {
  DONE: { label: "انتهت", tone: "slate" },
  NOW: { label: "الآن", tone: "teal" },
  UPCOMING: { label: "قادمة", tone: "gold" },
};

/**
 * Teacher → My daily timetable (drill-down of the overview's timetable panel).
 *
 * Focused workspace: the full slot detail, the room, and the weekly load per
 * class — the planning view a teacher opens before the day starts.
 */
export default async function TeacherSchedulePage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const overview = userId ? await loadTeacherOverview(userId) : null;
  const classes = overview?.classes ?? [];
  const today = overview?.today ?? [];

  // `Math.max` of an empty list is -Infinity, which would poison every meter;
  // the floor of 1 keeps the bars at zero instead.
  const maxLessons = Math.max(1, ...classes.map((klass) => klass.weeklyLessons));

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["بوابة المعلم", "جدولي اليومي"]}
        title="جدولي اليومي"
        lead="تفاصيل حصص اليوم وحالتها، والحمل الأسبوعي لكل فصل — لتخطيط دوامك بوضوح."
        icon={CalendarDays}
        actions={
          <Link
            href="/teacher/classes"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-sarh-teal hover:underline"
          >
            الفصول الدراسية
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        }
      />

      <Panel
        title="حصص اليوم"
        description={`${today.length} حصص مبرمجة`}
        icon={Clock}
      >
        <ul className="divide-y divide-sarh-borderLight dark:divide-sarh-borderDark">
          {today.map((slot) => {
            const status = SLOT_STATUS[slot.status];
            return (
              <li
                key={slot.id}
                className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-56 items-center gap-3">
                  <span
                    className="font-mono text-sm font-bold tabular-nums text-sarh-navy dark:text-white"
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

                <div className="min-w-48 flex-1">
                  <p className="text-sm font-bold text-sarh-navy dark:text-white">
                    {slot.subject}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <MapPin className="h-3 w-3" aria-hidden="true" />
                    {slot.className} — {slot.room} · {slot.gradeLevel}
                  </p>
                </div>

                <StatusPill tone={status.tone}>{status.label}</StatusPill>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel
        title="الحمل الأسبوعي"
        description="عدد الحصص الأسبوعية لكل فصل"
        icon={CalendarDays}
      >
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((klass) => (
            <li
              key={klass.id}
              className="rounded-xl border border-sarh-borderLight p-4 dark:border-sarh-borderDark"
            >
              <p className="text-sm font-bold text-sarh-navy dark:text-white">
                {klass.name}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {klass.subject} — {klass.room}
              </p>
              <div className="mt-3">
                <Meter
                  label="حصص أسبوعية"
                  value={(klass.weeklyLessons / maxLessons) * 100}
                  valueLabel={`${klass.weeklyLessons} حصة`}
                  accent="teal"
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                الحصة القادمة: {klass.nextLesson}
              </p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
