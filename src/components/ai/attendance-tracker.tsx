"use client";

import {
  useEffect,
  useState,
  type ChangeEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  CloudUpload,
  NotebookPen,
  RefreshCw,
  Users,
  WifiOff,
  X,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Skeleton } from "@/components/ui/skeleton";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { dayKey } from "@/lib/data/feed";
import type { RosterStudent } from "@/lib/data/institution";
import { cn } from "@/lib/utils";

const fullDate = new Intl.DateTimeFormat("ar-PS", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

type MarkStatus = "present" | "absent";

interface Mark {
  status: MarkStatus;
  note?: string;
  photoName?: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Quick Attendance Grid (Design.md Prompt 4):
 * 1-click حاضر/غائب toggles + a note/photo composer. Every mutation is
 * persisted to Dexie **immediately** (optimistic UI) and flushed to
 * `/api/institution/attendance` by the background sync queue.
 *
 * The roster and the institution id arrive as props from the server page
 * (read from PostgreSQL, scoped to the signed-in centre) — this client
 * component never invents them.
 */
export function AttendanceTracker({
  roster,
  institutionId,
}: {
  roster: RosterStudent[];
  institutionId: string;
}) {
  const { isOffline, queuedCount, queueAttendance, syncNow } = useOfflineSync();

  const [today, setToday] = useState<string>("");
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [composerId, setComposerId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => setToday(dayKey(new Date())), []);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 3200);
    return () => clearTimeout(timer);
  }, [flash]);

  const presentCount = Object.values(marks).filter((m) => m.status === "present").length;
  const absentCount = Object.values(marks).filter((m) => m.status === "absent").length;
  const unmarked = roster.length - presentCount - absentCount;

  const mark = (student: RosterStudent, status: MarkStatus) => {
    if (!today) return;
    setMarks((prev) => ({
      ...prev,
      [student.id]: { ...prev[student.id], status },
    }));
    void queueAttendance({
      studentId: student.id,
      institutionId,
      date: today,
      present: status === "present",
      note: marks[student.id]?.note ?? null,
    });
    setFlash(
      `${student.name}: ${status === "present" ? "حاضر" : "غائب"} — حُفظ محلياً فوراً`
    );
  };

  const saveNote = async (student: RosterStudent) => {
    if (!today) return;
    let photoDataUrl: string | null = null;
    if (photo) {
      try {
        photoDataUrl = await readFileAsDataUrl(photo);
      } catch {
        photoDataUrl = null;
      }
    }
    const trimmed = note.trim() || null;
    setMarks((prev) => ({
      ...prev,
      [student.id]: {
        status: prev[student.id]?.status ?? "present",
        ...(trimmed ? { note: trimmed } : {}),
        ...(photo ? { photoName: photo.name } : {}),
      },
    }));
    void queueAttendance({
      studentId: student.id,
      institutionId,
      date: today,
      present: (marks[student.id]?.status ?? "present") === "present",
      note: trimmed,
      photoDataUrl,
    });
    setComposerId(null);
    setNote("");
    setPhoto(null);
    setFlash(`حُفظت ملاحظة ${student.name} محلياً${photo ? " مع الصورة" : ""}`);
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const flushed = await syncNow();
      setFlash(
        flushed > 0
          ? `تمت مزامنة ${flushed} سجل مع الخادم`
          : "لا توجد سجلات بانتظار المزامنة"
      );
    } finally {
      setSyncing(false);
    }
  };

  const statChip = (label: string, value: number, cls: string) => (
    <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset", cls)}>
      {label}
      <span className="font-mono tabular-nums">{value}</span>
    </span>
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="sarh-card p-5 sm:p-6"
      aria-labelledby="attendance-title"
    >
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="attendance-title"
            className="flex items-center gap-2 text-lg font-bold text-sarh-navy dark:text-white"
          >
            <Users className="h-5 w-5 text-sarh-teal" aria-hidden="true" />
            تسجيل الحضور السريع
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            {today ? fullDate.format(new Date(`${today}T00:00:00`)) : "…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {statChip("حاضر", presentCount, "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400")}
          {statChip("غائب", absentCount, "bg-red-500/15 text-red-600 ring-red-500/30 dark:text-red-400")}
          {statChip("لم يُسجل", unmarked, "bg-slate-500/10 text-slate-600 ring-slate-500/25 dark:text-slate-300")}
        </div>
      </div>

      {/* Offline / queue indicators */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {isOffline ? (
          <span className="flex items-center gap-1.5 rounded-full bg-sarh-gold/15 px-3 py-1 text-xs font-bold text-[#C9741F] ring-1 ring-inset ring-sarh-gold/40 dark:text-sarh-gold">
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
            يعمل بدون إنترنت — الحفظ محلي
          </span>
        ) : null}
        {queuedCount > 0 ? (
          <span className="flex items-center gap-1.5 rounded-full bg-sarh-teal/10 px-3 py-1 text-xs font-bold text-sarh-teal ring-1 ring-inset ring-sarh-teal/30">
            <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />
            بانتظار المزامنة
            <span className="font-mono tabular-nums">{queuedCount}</span>
          </span>
        ) : today ? (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-600 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            البيانات متزامنة
          </span>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          onClick={() => void runSync()}
          loading={syncing}
          icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
          className="ms-auto rounded-full"
        >
          مزامنة الآن
        </Button>
      </div>

      <AnimatePresence>
        {flash ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="status"
            className="mb-4 rounded-xl bg-sarh-teal/10 px-4 py-2 text-xs font-bold text-sarh-teal ring-1 ring-inset ring-sarh-teal/30"
          >
            {flash}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Roster rows */}
      <ul className="space-y-3">
        {roster.map((student) => {
          const current = marks[student.id];
          const composerOpen = composerId === student.id;
          return (
            <li
              key={student.id}
              className={cn(
                "rounded-2xl border p-4 transition-colors",
                current?.status === "present" && "border-emerald-500/40 bg-emerald-500/5",
                current?.status === "absent" && "border-red-500/40 bg-red-500/5",
                !current && "border-sarh-borderLight dark:border-sarh-borderDark"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-bold text-sarh-navy dark:text-white">
                    {student.name}
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {student.gradeLevel}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    ولي الأمر: {student.guardian}
                  </p>
                  {current?.note ? (
                    <p className="mt-1 flex items-center gap-1.5 rounded-lg bg-sarh-gold/10 px-2.5 py-1 text-xs text-[#C9741F] dark:text-sarh-gold">
                      <NotebookPen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {current.note}
                      {current.photoName ? (
                        <span className="flex items-center gap-1 opacity-80">
                          <Camera className="h-3 w-3" aria-hidden="true" />
                          {current.photoName}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </div>

                <div
                  className="flex flex-wrap items-center gap-2"
                  role="group"
                  aria-label={`حالة الحضور — ${student.name}`}
                >
                  <button
                    type="button"
                    aria-pressed={current?.status === "present"}
                    onClick={() => mark(student, "present")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold ring-1 ring-inset transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                      current?.status === "present"
                        ? "bg-emerald-600 text-white ring-emerald-600 shadow-md"
                        : "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30 hover:bg-emerald-500/20 dark:text-emerald-400"
                    )}
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    حاضر
                  </button>
                  <button
                    type="button"
                    aria-pressed={current?.status === "absent"}
                    onClick={() => mark(student, "absent")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold ring-1 ring-inset transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500",
                      current?.status === "absent"
                        ? "bg-red-600 text-white ring-red-600 shadow-md"
                        : "bg-red-500/10 text-red-600 ring-red-500/30 hover:bg-red-500/20 dark:text-red-400"
                    )}
                  >
                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    غائب
                  </button>
                  <button
                    type="button"
                    aria-expanded={composerOpen}
                    onClick={() => {
                      setComposerId(composerOpen ? null : student.id);
                      setNote(marks[student.id]?.note ?? "");
                      setPhoto(null);
                    }}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold ring-1 ring-inset transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-gold",
                      composerOpen
                        ? "bg-sarh-gold text-white ring-sarh-gold shadow-md"
                        : "bg-sarh-gold/10 text-[#C9741F] ring-sarh-gold/40 hover:bg-sarh-gold/20 dark:text-sarh-gold"
                    )}
                  >
                    <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />
                    ملاحظة/صورة
                  </button>
                </div>
              </div>

              {/* Note / photo composer */}
              <AnimatePresence initial={false}>
                {composerOpen ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 grid gap-4 border-t border-sarh-borderLight pt-4 dark:border-sarh-borderDark sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor={`note-${student.id}`}
                          className="mb-1.5 block text-sm font-medium text-sarh-navy dark:text-slate-200"
                        >
                          ملاحظة المعلم
                        </label>
                        <textarea
                          id={`note-${student.id}`}
                          rows={3}
                          value={note}
                          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                            setNote(event.target.value)
                          }
                          placeholder="مثال: أكمل التمارين المنزلية — يحتاج مراجعة إضافية."
                          className="sarh-input resize-none"
                        />
                      </div>
                      <div className="space-y-3">
                        <FileInput
                          value={photo}
                          onChange={setPhoto}
                          label="صورة (اختياري)"
                          hint="تُضغط الصورة تلقائياً إلى WebP قبل الرفع (متوافق مع ضعف الشبكة)."
                          errorMessage="الصورة أكبر من الحد المسموح (8 ميغابايت)"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => void saveNote(student)}
                            icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                            className="rounded-full"
                          >
                            حفظ الملاحظة
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setComposerId(null);
                              setNote("");
                              setPhoto(null);
                            }}
                            icon={<X className="h-4 w-4" aria-hidden="true" />}
                            className="rounded-full"
                          >
                            إلغاء
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>

      {!today ? (
        <div className="mt-3 space-y-2" aria-hidden="true">
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}
    </motion.section>
  );
}
