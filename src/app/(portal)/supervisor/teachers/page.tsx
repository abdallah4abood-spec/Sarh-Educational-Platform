import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { BadgeCheck, Users } from "lucide-react";

import { Meter, PageHeader, Panel, StatCard } from "@/components/portal/primitives";
import { StatusPill } from "@/components/portal/status-pill";
import { authOptions } from "@/lib/auth";
import { loadScopedTeachers } from "@/lib/db/supervisor";

export const metadata: Metadata = {
  title: "المعلمون في نطاقي",
  description:
    "قائمة المعلمين داخل نطاق الإشراف مع التزامهم بتسليم الخطط ومؤشر أدائهم وعدد فصولهم — ببيانات مقصورة على نطاقك فقط.",
};

/**
 * Supervisor → Scoped teachers.
 *
 * Scoping is done by the loader, keyed on the signed-in supervisor: the query
 * resolves the institutions they hold membership in and returns only teachers
 * inside that span, so the page can never render a teacher from another scope
 * — the isolation is structural, not a filter someone could forget.
 */
export default async function SupervisorTeachersPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  /*
   * Scoping is done by the loader, keyed on the signed-in supervisor: the
   * query resolves the institutions they hold membership in and returns only
   * teachers inside that span — an edited URL cannot widen it.
   */
  const teachers = userId ? await loadScopedTeachers(userId) : [];

  const totalClasses = teachers.reduce(
    (sum, teacher) => sum + teacher.classes,
    0
  );
  const avgCompliance = teachers.length
    ? Math.round(
        (teachers.reduce((sum, t) => sum + t.planCompliance, 0) /
          teachers.length) *
          100
      )
    : 0;
  const centers = [...new Set(teachers.map((t) => t.center))];

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["بوابة الإشراف", "المعلمون في نطاقي"]}
        title="المعلمون في نطاقي"
        lead="أعضاء هيئة التدريس الذين تشرف عليهم، مع عدد فصولهم ونسب التزامهم بتسليم الخطط."
        icon={Users}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="عدد المعلمين"
          value={String(teachers.length)}
          hint={`موزعين على ${centers.length} مراكز`}
          icon={Users}
          accent="navy"
        />
        <StatCard
          label="الفصول المُشرَف عليها"
          value={String(totalClasses)}
          hint="فصول نشطة هذا الفصل"
          icon={BadgeCheck}
          accent="teal"
        />
        <StatCard
          label="متوسط التزام الخطط"
          value={`${avgCompliance}%`}
          hint="تسليم في الموعد"
          icon={BadgeCheck}
          accent="gold"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {teachers.map((teacher) => (
          <Panel
            key={teacher.id}
            title={teacher.name}
            description={`${teacher.subject} — ${teacher.center}`}
            icon={Users}
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone="slate">{teacher.classes} فصول</StatusPill>
                <StatusPill
                  tone={teacher.score >= 88 ? "teal" : teacher.score >= 75 ? "gold" : "rose"}
                >
                  الأداء {teacher.score}%
                </StatusPill>
              </div>

              <Meter
                label="التزام تسليم الخطط"
                value={teacher.planCompliance * 100}
                accent={teacher.planCompliance < 0.7 ? "rose" : "teal"}
              />
              <Meter
                label="مؤشر الأداء العام"
                value={teacher.score}
                accent="gold"
              />
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
