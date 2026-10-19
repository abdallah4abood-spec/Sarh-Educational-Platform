"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Baby,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Database,
  GraduationCap,
  ListChecks,
  Moon,
  Sparkles,
  Trophy,
  UserCheck,
  WifiOff,
  X,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { db } from "@/lib/offline/db";
import { cn } from "@/lib/utils";
import {
  dayKey,
  isSchoolDay,
  weekDays,
  weekdayAr,
  type FeedChild,
  type FeedDayLog,
  type HomeworkItem,
} from "@/lib/data/feed";

/* ------------------------------------------------------------------ */
/* Small shared pieces                                                */
/* ------------------------------------------------------------------ */

function Section({
  title,
  icon,
  delay = 0,
  className,
  children,
}: {
  title: string;
  icon: ReactNode;
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className={cn("sarh-card p-5", className)}
    >
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-sarh-navy dark:text-white">
        {icon}
        {title}
      </h2>
      {children}
    </motion.section>
  );
}

function AttendancePill({
  state,
}: {
  state: "present" | "absent" | "holiday" | "pending";
}) {
  const MAP = {
    present: { label: "حاضر", cls: "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400" },
    absent: { label: "غائب", cls: "bg-red-500/15 text-red-600 ring-red-500/30 dark:text-red-400" },
    holiday: { label: "عطلة", cls: "bg-slate-500/10 text-slate-600 ring-slate-500/25 dark:text-slate-300" },
    pending: { label: "بانتظار اليوم الدراسي", cls: "bg-sarh-gold/15 text-[#C9741F] ring-sarh-gold/40 dark:text-sarh-gold" },
  } as const;
  const { label, cls } = MAP[state];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold ring-1 ring-inset", cls)}>
      <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}

/** Circular progress ring for the Tawjihi average score (tnum figures). */
function ScoreRing({ percent }: { percent: number }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const dash = (percent / 100) * C;
  return (
    <svg viewBox="0 0 120 120" className="h-32 w-32 shrink-0" role="img" aria-label={`المعدل العام ${percent}%`}>
      <defs>
        <linearGradient id="sarh-score-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00A99D" />
          <stop offset="100%" stopColor="#F2994A" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r={R} fill="none" strokeWidth="10" className="stroke-slate-200 dark:stroke-slate-700" />
      <circle
        cx="60"
        cy="60"
        r={R}
        fill="none"
        stroke="url(#sarh-score-ring)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={C - dash}
        transform="rotate(-90 60 60)"
        className="transition-all duration-700"
      />
      <text x="60" y="56" textAnchor="middle" className="fill-sarh-navy dark:fill-white" style={{ fontFeatureSettings: '"tnum"' }}>
        <tspan className="font-mono text-2xl font-bold">{percent}%</tspan>
      </text>
      <text x="60" y="80" textAnchor="middle" className="fill-slate-500 dark:fill-slate-400">
        <tspan className="text-[11px]">المعدل العام</tspan>
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Photo lightbox                                                     */
/* ------------------------------------------------------------------ */

function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: FeedDayLog["photos"];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const step = useCallback(
    (delta: number) => onIndex((index + delta + photos.length) % photos.length),
    [index, photos.length, onIndex]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, step]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="عارض صور النشاط"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="إغلاق"
        className="absolute end-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
      <motion.figure
        initial={{ scale: 0.94 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.94 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="w-full max-w-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black">
          <Image
            src={photos[index]}
            alt={`صورة نشاط اليوم ${index + 1}`}
            fill
            sizes="96vw"
            className="object-contain"
            priority
          />
        </div>
        <figcaption className="mt-3 flex items-center justify-between text-white">
          <span className="font-mono text-sm tabular-nums" dir="ltr">
            {index + 1} / {photos.length}
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="الصورة السابقة"
              className="grid h-10 w-10 place-items-center rounded-full bg-white/15 hover:bg-white/25"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="الصورة التالية"
              className="grid h-10 w-10 place-items-center rounded-full bg-white/15 hover:bg-white/25"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          </span>
        </figcaption>
      </motion.figure>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Main feed                                                          */
/* ------------------------------------------------------------------ */

const EMPTY_WEEK: Date[] = [];
const monthLabel = new Intl.DateTimeFormat("ar-PS", { month: "long", year: "numeric" });
const dayLabel = new Intl.DateTimeFormat("ar-PS", { day: "numeric", month: "short" });

/** Rendered only when a parent account has no children yet. */
const EMPTY_CHILD: FeedChild = {
  id: "",
  name: "—",
  tier: "KINDERGARTEN",
  institutionId: "",
  institutionName: "—",
  gradeLevel: "—",
};

/**
 * The feed is a *view*, not a data source: both props arrive from the parent
 * page, read from PostgreSQL and scoped to the signed-in account. The week's
 * logs come as a flat array (serializable across the server/client boundary)
 * and are indexed back into a map keyed by `childId:day` — exactly how the
 * week strip and the day panel ask for them.
 */
export function ChildFeed({
  kids,
  logs,
}: {
  /** The parent's children — `kids` rather than `children` because `children`
   *  is React's own prop and must never be passed as data. */
  kids: FeedChild[];
  logs: FeedDayLog[];
}) {
  const { isOffline, queuedCount } = useOfflineSync();

  const [mounted, setMounted] = useState(false);
  const [childId, setChildId] = useState<string>(kids[0]?.id ?? "");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedISO, setSelectedISO] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [hwOverrides, setHwOverrides] = useState<Record<string, boolean>>({});
  const [cacheReady, setCacheReady] = useState(false);

  const child: FeedChild =
    kids.find((item) => item.id === childId) ?? kids[0] ?? EMPTY_CHILD;

  const logIndex = useMemo(() => {
    const map = new Map<string, FeedDayLog>();
    for (const entry of logs) map.set(`${entry.childId}:${entry.date}`, entry);
    return map;
  }, [logs]);

  const logFor = useCallback(
    (target: FeedChild, date: Date) =>
      logIndex.get(`${target.id}:${dayKey(date)}`) ?? null,
    [logIndex]
  );

  const week = useMemo(
    () => (mounted ? weekDays(anchor) : EMPTY_WEEK),
    [mounted, anchor]
  );
  const weekKey = useMemo(() => week.map(dayKey).join(","), [week]);

  /* First paint → all clock-dependent UI unlocks (hydration stays clean). */
  useEffect(() => setMounted(true), []);

  /* Default selection: today when it is a school day inside the strip. */
  useEffect(() => {
    if (!mounted || week.length === 0) return;
    if (selectedISO && week.some((d) => dayKey(d) === selectedISO)) return;
    const today = new Date();
    const todayKey = dayKey(today);
    const inWeek = week.some((d) => dayKey(d) === todayKey);
    if (inWeek && isSchoolDay(today)) {
      setSelectedISO(todayKey);
      return;
    }
    const schoolDays = week.filter(isSchoolDay);
    const past = schoolDays.filter((d) => dayKey(d) <= todayKey);
    setSelectedISO(dayKey(past[past.length - 1] ?? schoolDays[0]));
  }, [mounted, week, selectedISO]);

  /* Mirror the week into Dexie + restore homework toggles (offline-first). */
  useEffect(() => {
    if (!mounted || week.length === 0) return;
    let alive = true;
    setHwOverrides({});
    setCacheReady(false);

    (async () => {
      try {
        const existing = await db.dailyLogs
          .where("studentId")
          .equals(child.id)
          .toArray();
        const haveDates = new Set(existing.map((row) => row.date));
        const missing = week
          .map((date) => logFor(child, date))
          .filter((log): log is FeedDayLog => log !== null && !haveDates.has(log.date));

        if (missing.length > 0) {
          await db.dailyLogs.bulkPut(
            missing.map((log) => ({
              id: log.id,
              studentId: log.childId,
              institutionId: log.institutionId,
              date: log.date,
              attendance: log.attendance,
              dayPlan: log.dayPlan.join(" | ") || null,
              // Photos are already servable URLs; the offline queue stores the
              // same strings the row carried, so a replay is byte-identical.
              activityPhotos: [...log.photos],
              pickupPerson: log.pickupPerson
                ? `${log.pickupPerson.name} — ${log.pickupPerson.relation}`
                : null,
              aiSummary: log.aiSummary,
              gradesJson: { homework: log.homework },
              cachedAt: Date.now(),
            }))
          );
        }

        const all = await db.dailyLogs
          .where("studentId")
          .equals(child.id)
          .toArray();
        const overrides: Record<string, boolean> = {};
        for (const row of all) {
          const cached = (row.gradesJson as { homework?: HomeworkItem[] } | null)
            ?.homework;
          if (!cached || cached.length === 0) continue;
          const storedLog = logFor(child, new Date(`${row.date}T00:00:00`));
          for (const item of cached) {
            const seedItem = storedLog?.homework.find((h) => h.id === item.id);
            if (seedItem && seedItem.done !== item.done) {
              overrides[`${child.id}::${row.date}::${item.id}`] = item.done;
            }
          }
        }
        if (alive) {
          setHwOverrides(overrides);
          setCacheReady(true);
        }
      } catch {
        // IndexedDB unavailable (private mode) — feed still renders from seeds.
        if (alive) setCacheReady(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [mounted, weekKey, week, child, logFor]);

  const selectedDate = useMemo(
    () => week.find((d) => dayKey(d) === selectedISO) ?? null,
    [week, selectedISO]
  );
  const log = useMemo(
    () => (selectedDate && mounted ? logFor(child, selectedDate) : null),
    [child, selectedDate, mounted, logFor]
  );
  const isFuture = Boolean(
    selectedISO && dayKey(new Date()) < selectedISO
  );

  const hwKey = (date: string, hwId: string) => `${child.id}::${date}::${hwId}`;
  const effectiveHomework = (dayLog: FeedDayLog): HomeworkItem[] =>
    dayLog.homework.map((item) => ({
      ...item,
      done: hwOverrides[hwKey(dayLog.date, item.id)] ?? item.done,
    }));

  const toggleHomework = (dayLog: FeedDayLog, itemId: string) => {
    const next = dayLog.homework.map((item) => ({
      ...item,
      done:
        item.id === itemId
          ? !(hwOverrides[hwKey(dayLog.date, item.id)] ?? item.done)
          : hwOverrides[hwKey(dayLog.date, item.id)] ?? item.done,
    }));

    setHwOverrides((prev) => {
      const base = { ...prev };
      for (const item of dayLog.homework) {
        const key = hwKey(dayLog.date, item.id);
        const target = next.find((n) => n.id === item.id);
        if (target && target.done !== item.done) base[key] = target.done;
        else delete base[key];
      }
      return base;
    });

    void db.dailyLogs
      .update(dayLog.id, { gradesJson: { homework: next } })
      .catch(() => undefined);
  };

  const photos = log?.photos ?? [];
  const scores = log?.scores ?? [];
  const avg =
    scores.length > 0
      ? Math.round(
          (scores.reduce((sum, s) => sum + s.score, 0) /
            scores.reduce((sum, s) => sum + s.total, 0)) *
            100
        )
      : 0;
  const homework = log ? effectiveHomework(log) : [];
  const homeworkDone = homework.filter((h) => h.done).length;

  const attendanceState = !log
    ? "holiday"
    : isFuture
      ? "pending"
      : log.attendance
        ? "present"
        : "absent";

  /* ---------------- render ---------------- */
  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl px-4 pb-24 pt-6">
      {/* Offline indicator bar — Design.md Prompt 3 */}
      {isOffline ? (
        <div className="offline-bar mb-4 flex justify-center rounded-full p-1" role="status">
          <span className="flex items-center gap-2 rounded-full bg-black/75 px-4 py-1.5 text-xs font-bold text-white">
            <WifiOff className="h-4 w-4" aria-hidden="true" />
            يعمل بدون إنترنت - تم الحفظ محلياً
          </span>
        </div>
      ) : null}
      {queuedCount > 0 ? (
        <div className="mb-4 flex items-center justify-center gap-2 rounded-full bg-sarh-gold/15 px-4 py-2 text-xs font-bold text-[#C9741F] ring-1 ring-inset ring-sarh-gold/40 dark:text-sarh-gold" role="status">
          <CloudUpload className="h-4 w-4" aria-hidden="true" />
          <span className="font-mono tabular-nums">بانتظار المزامنة: {queuedCount}</span>
        </div>
      ) : null}

      {/* Header */}
      <header className="mb-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-bold text-sarh-teal">
              <Link href="/" className="hover:underline">
                صَرْح
              </Link>
              <span className="text-slate-400">/</span>
              <span className="text-slate-500 dark:text-slate-400">بوابة الوالدين</span>
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-sarh-navy dark:text-white">
              يوميتي
            </h1>
          </div>
          {cacheReady ? (
            <span className="flex items-center gap-1.5 rounded-full bg-sarh-teal/10 px-3 py-1 text-[11px] font-bold text-sarh-teal ring-1 ring-inset ring-sarh-teal/30">
              <Database className="h-3.5 w-3.5" aria-hidden="true" />
              محفوظ للعمل دون إنترنت
            </span>
          ) : null}
        </div>

        {/* Child selector switcher */}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="اختيار الطفل">
          {kids.map((item) => {
            const active = item.id === child.id;
            const Icon = item.tier === "KINDERGARTEN" ? Baby : GraduationCap;
            const shortTier =
              item.tier === "KINDERGARTEN" ? "الروضة" : "التوجيهي";
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setChildId(item.id)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal focus-visible:ring-offset-2",
                  active
                    ? "bg-sarh-teal text-white shadow-teal-glow"
                    : "border border-sarh-borderLight bg-card text-sarh-navy hover:border-sarh-teal hover:text-sarh-teal dark:border-sarh-borderDark dark:text-slate-200"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.name} — {shortTier}
              </button>
            );
          })}
        </div>
      </header>

      {/* Week date slider */}
      <nav className="sarh-card mb-4 p-3" aria-label="التنقل بين أيام الأسبوع">
        <div className="mb-2 flex items-center justify-between px-1">
          <button
            type="button"
            aria-label="الأسبوع الماضي"
            onClick={() => setAnchor((prev) => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; })}
            className="grid h-8 w-8 place-items-center rounded-full text-sarh-navy hover:bg-sarh-teal/10 hover:text-sarh-teal dark:text-slate-200"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="flex items-center gap-1.5 text-sm font-bold text-sarh-navy dark:text-white">
            <CalendarDays className="h-4 w-4 text-sarh-teal" aria-hidden="true" />
            {mounted ? monthLabel.format(anchor) : "…"}
          </span>
          <button
            type="button"
            aria-label="الأسبوع القادم"
            onClick={() => setAnchor((prev) => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; })}
            className="grid h-8 w-8 place-items-center rounded-full text-sarh-navy hover:bg-sarh-teal/10 hover:text-sarh-teal dark:text-slate-200"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {!mounted ? (
          <div className="flex gap-2" aria-hidden="true">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-16 flex-1" />
            ))}
          </div>
        ) : (
          <ol className="flex gap-1.5 overflow-x-auto pb-1">
            {week.map((date) => {
              const key = dayKey(date);
              const school = isSchoolDay(date);
              const active = key === selectedISO;
              const isToday = key === dayKey(new Date());
              return (
                <li key={key} className="min-w-[3.4rem] flex-1">
                  <button
                    type="button"
                    onClick={() => school && setSelectedISO(key)}
                    disabled={!school}
                    aria-current={active ? "date" : undefined}
                    className={cn(
                      "flex w-full flex-col items-center gap-0.5 rounded-xl px-1 py-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal",
                      active
                        ? "bg-sarh-teal text-white shadow-teal-glow"
                        : school
                          ? "text-sarh-navy hover:bg-sarh-teal/10 dark:text-slate-200"
                          : "cursor-not-allowed text-slate-400 opacity-60"
                    )}
                  >
                    <span className="text-[10px] font-semibold">
                      {weekdayAr(date).replace("ال", "")}
                    </span>
                    <span className={cn("font-mono text-lg font-bold tabular-nums", active && "text-white")}>
                      {date.getDate()}
                    </span>
                    <span className={cn("h-1.5 w-1.5 rounded-full", isToday ? (active ? "bg-white" : "bg-sarh-gold") : "bg-transparent")} />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </nav>

      {/* Child summary + attendance */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="sarh-card mb-4 flex flex-wrap items-center justify-between gap-3 p-5"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-sarh-teal to-sarh-tealDeep text-lg font-bold text-white">
            {child.name.charAt(0)}
          </span>
          <div>
            <p className="font-bold text-sarh-navy dark:text-white">
              {child.name}
              <span className="mr-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {child.gradeLevel}
              </span>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {child.institutionName}
              {selectedDate ? ` — ${dayLabel.format(selectedDate)}` : ""}
            </p>
          </div>
        </div>
        {!mounted ? (
          <Skeleton className="h-9 w-28" />
        ) : (
          <AttendancePill state={attendanceState} />
        )}
      </motion.div>

      {/* ---------------- content ---------------- */}
      {!mounted ? (
        <div className="space-y-4" aria-hidden="true">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : !selectedDate ? (
        <Section title="عطلة نهاية الأسبوع" icon={<Moon className="h-4 w-4 text-sarh-teal" aria-hidden="true" />}>
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            لا يوجد يوم دراسي في هذا التاريخ — تعود المتابعة يوم الأحد القادم.
          </p>
        </Section>
      ) : isFuture ? (
        <Section title="بانتظار يوم الدراسة" icon={<CalendarDays className="h-4 w-4 text-sarh-teal" aria-hidden="true" />}>
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            لم تُسجَّل ملاحظات بعد لهذا اليوم. ستظهر هنا فور إدخالها من المعلمة.
          </p>
        </Section>
      ) : !log || !log.attendance ? (
        <Section title="لم يحضر اليوم" icon={<Moon className="h-4 w-4 text-red-500" aria-hidden="true" />}>
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            لم يُسجَّل حضور {child.name} في يوم {weekdayAr(selectedDate)} —
            تواصل مع {child.institutionName} للتأكد.
          </p>
        </Section>
      ) : child.tier === "KINDERGARTEN" ? (
        /* -------- Kindergarten mode (ages 5–7) -------- */
        <div className="space-y-4">
          <Section
            title="برنامج اليوم والأنشطة"
            icon={<ListChecks className="h-4 w-4 text-sarh-teal" aria-hidden="true" />}
            delay={0.05}
          >
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-bold text-sarh-inkMute">برنامج اليوم</p>
                {log.dayPlan.length > 0 ? (
                  <ul className="space-y-1.5">
                    {log.dayPlan.map((entry) => (
                      <li key={entry} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                        {entry}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">لم يُسجَّل برنامج اليوم بعد.</p>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-bold text-sarh-inkMute">أنشطة اليوم</p>
                <div className="flex flex-wrap gap-2">
                  {log.activities.map((activity) => (
                    <span
                      key={activity}
                      className="rounded-full bg-sarh-tealSoft px-3 py-1 text-xs font-semibold text-sarh-teal ring-1 ring-inset ring-sarh-teal/25"
                    >
                      {activity}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <Section
            title="صور النشاط"
            icon={<Camera className="h-4 w-4 text-sarh-teal" aria-hidden="true" />}
            delay={0.1}
          >
            <div className="grid grid-cols-2 gap-3">
              {photos.map((photo, index) => (
                <button
                  key={photo}
                  type="button"
                  onClick={() => setLightbox(index)}
                  className="group relative aspect-[4/3] overflow-hidden rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal"
                  aria-label={`تكبير صورة النشاط ${index + 1}`}
                >
                  <Image
                    src={photo}
                    alt={`صورة نشاط ${child.name} — ${index + 1}`}
                    fill
                    sizes="(max-width: 768px) 50vw, 300px"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </button>
              ))}
            </div>
          </Section>

          <Section
            title="مسؤول الاستلام المعتمد"
            icon={<UserCheck className="h-4 w-4 text-sarh-teal" aria-hidden="true" />}
            delay={0.15}
          >
            {log.pickupPerson ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-sarh-borderLight p-4 dark:border-sarh-borderDark">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-sarh-navy/10 text-sarh-navy dark:bg-white/10 dark:text-white">
                    <UserCheck className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-bold text-sarh-navy dark:text-white">
                      {log.pickupPerson.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {log.pickupPerson.relation}
                    </p>
                  </div>
                </div>
                {log.pickupPerson.verified ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-600 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    مصادق عليه
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-500/10 px-3 py-1 text-xs font-bold text-slate-500 ring-1 ring-inset ring-slate-500/25">
                    قيد التوثيق
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">لم يُحدد مسؤول الاستلام لهذا اليوم.</p>
            )}
          </Section>
        </div>
      ) : (
        /* -------- Center / Tawjihi mode (ages 8–18) -------- */
        <div className="space-y-4">
          {/* AI daily summary — gold/teal gradient border */}
          {log.aiSummary ? (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 }}
              className="rounded-2xl bg-gradient-to-br from-sarh-gold to-sarh-teal p-[1.5px] shadow-card-float"
            >
              <div className="rounded-2xl bg-card p-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-bold text-sarh-navy dark:text-white">
                    <Sparkles className="h-4 w-4 text-sarh-gold" aria-hidden="true" />
                    ملخص المعلم اليومي
                  </h2>
                  <span className="flex items-center gap-1 rounded-full bg-sarh-gold/15 px-2.5 py-0.5 text-[11px] font-bold text-[#C9741F] ring-1 ring-inset ring-sarh-gold/40 dark:text-sarh-gold">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    مدعوم بالذكاء الاصطناعي
                  </span>
                </div>
                <p className="text-sm leading-7 text-slate-700 dark:text-slate-300">
                  {log.aiSummary}
                </p>
              </div>
            </motion.section>
          ) : null}

          <Section
            title="قائمة الواجبات"
            icon={<ListChecks className="h-4 w-4 text-sarh-teal" aria-hidden="true" />}
            delay={0.1}
          >
            <div className="mb-3 flex items-center justify-between text-xs font-bold">
              <span className="text-sarh-inkMute">تم إنجاز</span>
              <span className="font-mono text-sarh-teal tabular-nums">
                {homeworkDone} / {homework.length}
              </span>
            </div>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-l from-sarh-teal to-sarh-gold transition-all duration-500"
                style={{ width: `${homework.length ? (homeworkDone / homework.length) * 100 : 0}%` }}
              />
            </div>
            <ul className="space-y-2">
              {homework.map((item) => (
                <li key={item.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                      item.done
                        ? "border-sarh-teal/40 bg-sarh-teal/5"
                        : "border-sarh-borderLight hover:border-sarh-teal/50 dark:border-sarh-borderDark"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => toggleHomework(log, item.id)}
                      className="h-4 w-4 accent-[#00A99D]"
                    />
                    <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                      {item.title}
                    </span>
                    <span className="rounded-full bg-sarh-navy/10 px-2 py-0.5 text-[11px] font-bold text-sarh-navy dark:bg-white/10 dark:text-white">
                      {item.subject}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </Section>

          {scores.length > 0 ? (
            <Section
              title="درجات الاختبارات"
              icon={<Trophy className="h-4 w-4 text-sarh-gold" aria-hidden="true" />}
              delay={0.15}
            >
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <ScoreRing percent={avg} />
                <ul className="w-full flex-1 space-y-3">
                  {scores.map((score) => {
                    const pct = Math.round((score.score / score.total) * 100);
                    return (
                      <li key={score.subject}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {score.subject}
                          </span>
                          <span className="font-mono font-bold text-sarh-navy tabular-nums dark:text-white" dir="ltr">
                            {score.score} / {score.total}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              pct >= 85 ? "bg-emerald-500" : pct >= 60 ? "bg-sarh-gold" : "bg-red-500"
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </Section>
          ) : null}
        </div>
      )}

      {/* Photo lightbox */}
      <AnimatePresence>
        {lightbox !== null && photos.length > 0 ? (
          <Lightbox
            photos={photos}
            index={Math.min(lightbox, photos.length - 1)}
            onIndex={setLightbox}
            onClose={() => setLightbox(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
