import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import {
  ArrowLeft,
  Baby,
  CalendarCheck,
  CalendarDays,
  GraduationCap,
  LayoutDashboard,
  Mail,
  MailOpen,
  MapPin,
  Megaphone,
  Sparkles,
  UserPlus,
} from "lucide-react";

import { Meter, PageHeader, Panel, StatCard } from "@/components/portal/primitives";
import { StatusPill } from "@/components/portal/status-pill";
import { authOptions } from "@/lib/auth";
import { loadParentDashboard } from "@/lib/db/parent";

export const metadata: Metadata = {
  title: "بوابة الأهالي",
  description:
    "متابعة الأبناء: برنامج اليوم، الحضور، الإعلانات الجديدة، الرسائل، ومؤشر أداء الطالب — مع مساعد الذكاء الاصطناعي وروابط مباشرة ليوميات الأطفال.",
};

const ANNOUNCEMENT_ICON = {
  holiday: CalendarCheck,
  schedule: CalendarDays,
  meeting: Megaphone,
} as const;

const ANNOUNCEMENT_LABEL = {
  holiday: "إجازة",
  schedule: "جدول",
  meeting: "اجتماع",
} as const;

/** Performance ring — plain SVG so it renders on the server with no client JS. */
function PerformanceRing({ value }: { value: number }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className="relative grid h-24 w-24 shrink-0 place-items-center"
      role="img"
      aria-label={`معدل الأداء ${clamped} بالمئة`}
    >
      <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          strokeWidth="8"
          className="stroke-sarh-muted dark:stroke-white/10"
        />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="#00A99D"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span
        className="absolute font-mono text-lg font-bold tabular-nums text-sarh-navy dark:text-white"
        dir="ltr"
      >
        {clamped}%
      </span>
    </div>
  );
}

/**
 * Parent overview (Pillar 3 — the family's home screen).
 *
 * One screen answers a parent's two daily questions — “how is my child doing?”
 * and “did I miss anything?” — and every widget drills into the focused
 * workspace that answers it in depth (day feed, children, assistant).
 */
export default async function ParentOverviewPage() {
  const session = await getServerSession(authOptions);
  const firstName = (session?.user?.name ?? "ولي الأمر").split(" ")[0];

  /*
   * Every figure below is read from PostgreSQL for the signed-in parent.
   * `middleware.ts` already guarantees a session on this route, but the id is
   * re-checked here because the loaders scope their queries by it — an absent
   * id would otherwise silently widen the query to every family.
   */
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

  const children = data.children;
  const primaryChild = children[0];
  const dayPlan = data.todayDayPlan;
  const institutionCount = data.institutionCount;
  const unread = data.messages.filter((message) => message.unread);
  const pendingWork = data.pendingHomework;

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["بوابة الأهالي"]}
        title="لوحة ولي الأمر"
        lead={`مرحباً ${firstName} 👋 نحن هنا لمساعدتك في متابعة رحلة طفلك بكل سهولة وراحة.`}
        icon={LayoutDashboard}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="المراكز والروضات"
          value={String(institutionCount)}
          hint="مراكز مسجّل بها أبناؤك"
          icon={GraduationCap}
          accent="gold"
          href="/parent/children"
          cta="أبنائي"
        />
        <StatCard
          label="الرسائل الجديدة"
          value={String(unread.length)}
          hint="رسائل لم تُقرأ بعد"
          icon={Mail}
          accent="teal"
          href="/parent/children"
        />
        <StatCard
          label="المواعيد القادمة"
          value={String(data.announcements.length)}
          hint="إعلانات ومواعيد هذا الشهر"
          icon={CalendarDays}
          accent="navy"
          href="/parent/feed"
        />
        <StatCard
          label="الأنشطة والواجبات"
          value={String(pendingWork)}
          hint="مهام بحاجة إلى متابعة اليوم"
          icon={Baby}
          accent="gold"
          href="/parent/feed"
          cta="يومية الطفل"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Panel
            title="أبنائي"
            description="فصولهم والمراكز التي ينتسبون إليها"
            icon={GraduationCap}
            moreHref="/parent/children"
          >
            <ul className="grid gap-3 sm:grid-cols-2">
              {children.map((child) => (
                <li key={child.id}>
                  <Link
                    href="/parent/feed"
                    className="flex h-full items-center gap-3 rounded-xl border border-sarh-borderLight p-4 transition-colors hover:border-sarh-teal/50 hover:bg-sarh-teal/5 dark:border-sarh-borderDark"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sarh-teal/10 text-sm font-bold text-sarh-tealDeep dark:text-sarh-teal">
                      {child.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-sarh-navy dark:text-white">
                        {child.name}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                        {child.gradeLevel} — {child.institutionName}
                      </span>
                      <span className="mt-1.5 block">
                        <StatusPill
                          tone={child.tier === "KINDERGARTEN" ? "gold" : "teal"}
                        >
                          {child.tier === "KINDERGARTEN" ? "روضة" : "مركز تعليمي"}
                        </StatusPill>
                      </span>
                    </span>
                    <ArrowLeft
                      className="h-4 w-4 shrink-0 text-slate-300"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>

            <Link
              href="/parent/children"
              className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-sarh-teal/10 px-4 py-3 text-xs font-bold text-sarh-tealDeep transition-colors hover:bg-sarh-teal/20 dark:text-sarh-teal"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              إضافة طالب آخر
            </Link>
          </Panel>

          <Panel
            title={`برنامج يوم ${primaryChild?.name ?? "الطفل"}`}
            description={
              primaryChild ? `${primaryChild.institutionName} — اليوم` : undefined
            }
            icon={CalendarDays}
            moreHref="/parent/feed"
          >
            {dayPlan.length > 0 ? (
              <ul className="space-y-3">
                {dayPlan.map((entry) => (
                  <li
                    key={entry}
                    className="rounded-xl border border-sarh-borderLight px-4 py-3 text-xs leading-6 text-slate-600 dark:border-sarh-borderDark dark:text-slate-300"
                  >
                    {entry}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                لا يوجد برنامج مسجّل لهذا اليوم — يوم راحة.
              </p>
            )}
            <Link
              href="/parent/feed"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-sarh-teal hover:underline"
            >
              عرض اليومية الكاملة
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="أداء طفلي" icon={GraduationCap} description="معدل الفصل الحالي">
            <div className="flex items-center gap-5">
              <PerformanceRing value={data.overall} />
              <div className="min-w-0 flex-1 space-y-3">
                {data.performance.map((row) => (
                  <Meter
                    key={row.subject}
                    label={row.subject}
                    value={row.percent}
                    accent="teal"
                  />
                ))}
              </div>
            </div>
          </Panel>

          <Panel
            title="أحدث الإعلانات"
            icon={Megaphone}
            moreHref="/parent/feed"
          >
            <ul className="space-y-3">
              {data.announcements.map((announcement) => {
                const Icon = ANNOUNCEMENT_ICON[announcement.kind];
                return (
                  <li
                    key={announcement.id}
                    className="flex items-start gap-3 rounded-xl border border-sarh-borderLight p-3 dark:border-sarh-borderDark"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sarh-gold/15 text-[#B4641A] dark:text-sarh-gold">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-sarh-navy dark:text-slate-200">
                          {announcement.title}
                        </span>
                        <StatusPill tone="slate">
                          {ANNOUNCEMENT_LABEL[announcement.kind]}
                        </StatusPill>
                      </span>
                      <span className="mt-1 block text-[11px] leading-6 text-slate-500 dark:text-slate-400">
                        {announcement.body}
                      </span>
                      <span className="mt-1 flex items-center gap-3 text-[10px] text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" aria-hidden="true" />
                          {announcement.center}
                        </span>
                        <span dir="ltr">{announcement.date}</span>
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="الرسائل" icon={Mail} description={`${unread.length} غير مقروءة`}>
            <ul className="divide-y divide-sarh-borderLight dark:divide-sarh-borderDark">
              {data.messages.map((message) => (
                <li
                  key={message.id}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {message.unread ? (
                      <Mail className="h-3.5 w-3.5 shrink-0 text-sarh-teal" aria-hidden="true" />
                    ) : (
                      <MailOpen
                        className="h-3.5 w-3.5 shrink-0 text-slate-300"
                        aria-hidden="true"
                      />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-sarh-navy dark:text-slate-200">
                        {message.subject}
                      </span>
                      <span className="block text-[11px] text-slate-400">
                        {message.from}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400" dir="auto">
                    {message.at}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="التعليم بالذكاء الاصطناعي"
            description="مساعد تعليمي لطفلك حسب مستواه الدراسي"
            icon={Sparkles}
            moreHref="/parent/assistant"
            moreLabel="ابدأ الآن"
          >
            <p className="text-sm leading-7 text-slate-500 dark:text-slate-400">
              اطرح أي سؤال على مساعد صَرْح الذكي، وسيساعد طفلك على المراجعة والفهم
              بشكل أفضل — بشرح مبسّط وأمثلة من المنهج.
            </p>
            <Link
              href="/parent/assistant"
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-sarh-teal px-4 py-2.5 text-xs font-bold text-white shadow-teal-glow"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              ابدأ الآن
            </Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}
