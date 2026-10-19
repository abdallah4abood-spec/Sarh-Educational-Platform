"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Download,
  Printer,
  RefreshCw,
  Sparkles,
  Trophy,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QUIZ_DIFFICULTIES } from "@/lib/data/institution";
import { cn } from "@/lib/utils";

const API_BASE =
  process.env.NEXT_PUBLIC_FASTAPI_URL ?? "http://localhost:8000";

type ApiQuestionType = "multiple_choice" | "true_false" | "short_answer";

interface QuizQuestion {
  id: number;
  type: ApiQuestionType;
  question: string;
  options: string[];
  correctIndex: number | null;
  answer: string | null;
  explanation: string | null;
  points: number;
}

interface QuizResult {
  subject: string;
  lesson: string;
  difficulty: string;
  questionCount: number;
  language: string;
  questions: QuizQuestion[];
  provider: string;
  generatedAt: string;
}

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "سهل",
  medium: "متوسط",
  hard: "صعب",
  سهل: "سهل",
  متوسط: "متوسط",
  صعب: "صعب",
};

const TYPE_LABELS: Record<ApiQuestionType, string> = {
  multiple_choice: "اختيار من متعدد",
  true_false: "صح أو خطأ",
  short_answer: "إجابة قصيرة",
};

const OPTION_MARKS = ["أ", "ب", "ج", "د", "هـ", "و"];

/** Show every type unless the teacher narrows the display. */
const TYPE_FILTERS = [
  { value: "all", label: "متنوعة (كل الأنواع)" },
  { value: "multiple_choice", label: "اختيار من متعدد" },
  { value: "true_false", label: "صح أو خطأ" },
  { value: "short_answer", label: "إجابة قصيرة" },
] as const;

type TypeFilter = (typeof TYPE_FILTERS)[number]["value"];

/**
 * AI Quiz Studio (Design.md §23 + §45) — Stripe-precise controls on one
 * side, generated result on the other, Gold AI action with a subtle
 * Teal/Gold pulsing glow while the FastAPI microservice works.
 */
export function QuizGeneratorStudio({ subjects }: { subjects: string[] }) {
  const [subject, setSubject] = useState<string>(subjects[0] ?? "");
  const [lesson, setLesson] = useState("");
  const [difficulty, setDifficulty] = useState<string>("متوسط");
  const [questionCount, setQuestionCount] = useState(5);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);

  const visibleQuestions = useMemo(() => {
    if (!result) return [];
    if (typeFilter === "all") return result.questions;
    return result.questions.filter((question) => question.type === typeFilter);
  }, [result, typeFilter]);

  const totalPoints = useMemo(
    () =>
      (result?.questions ?? []).reduce(
        (sum, question) => sum + question.points,
        0
      ),
    [result]
  );

  async function generate(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const trimmedLesson = lesson.trim();
    if (!trimmedLesson) {
      setError("يرجى إدخال اسم الدرس أولاً.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/ai/generate-quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          lesson: trimmedLesson,
          difficulty,
          questionCount,
          language: "ar",
        }),
      });

      if (!response.ok) {
        let message = "تعذر توليد الاختبار. حاول مرة أخرى.";
        try {
          const detail: unknown = (await response.json() as { detail?: unknown })
            .detail;
          if (typeof detail === "string") message = detail;
        } catch {
          // keep the friendly default message
        }
        setError(message);
        return;
      }

      const data = (await response.json()) as QuizResult;
      if (!Array.isArray(data.questions)) {
        setError("استجابة غير متوقعة من خدمة الذكاء الاصطناعي.");
        return;
      }
      setResult(data);
    } catch {
      setError(
        "تعذر الاتصال بخدمة الذكاء الاصطناعي. تأكد من تشغيل الخدمة وحاول مرة أخرى."
      );
    } finally {
      setLoading(false);
    }
  }

  function downloadJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sarh-quiz-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-labelledby="quiz-studio-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="quiz-studio-heading"
            className="flex items-center gap-2 text-lg font-bold text-sarh-navy dark:text-white"
          >
            <Sparkles className="h-5 w-5 text-sarh-gold" aria-hidden="true" />
            مولّد الاختبارات بالذكاء الاصطناعي
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            اختر المادة والدرس والصعوبة، واحصل على اختبار جاهز للطباعة والتحميل.
          </p>
        </div>
        <Badge variant="gold">AI</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* ---------------- AI controls ---------------- */}
        <aside className="print:hidden">
          <form
            onSubmit={(event) => void generate(event)}
            className={cn(
              "sarh-card space-y-4 p-5",
              loading && "animate-ai-glow"
            )}
          >
            <div className="space-y-1.5">
              <label
                htmlFor="quiz-subject"
                className="block text-sm font-semibold text-sarh-navy dark:text-slate-200"
              >
                المادة
              </label>
              <select
                id="quiz-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                disabled={loading}
                className="sarh-input"
              >
                {subjects.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="quiz-lesson"
                className="block text-sm font-semibold text-sarh-navy dark:text-slate-200"
              >
                اسم الدرس
              </label>
              <input
                id="quiz-lesson"
                type="text"
                value={lesson}
                onChange={(event) => setLesson(event.target.value)}
                disabled={loading}
                placeholder="مثال: المعادلات الخطية"
                className="sarh-input"
                aria-describedby="quiz-lesson-help"
              />
              <p
                id="quiz-lesson-help"
                className="text-xs text-slate-500 dark:text-slate-400"
              >
                اكتب اسم الدرس كما يظهر في الكتاب المدرسي.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="quiz-difficulty"
                  className="block text-sm font-semibold text-sarh-navy dark:text-slate-200"
                >
                  مستوى الصعوبة
                </label>
                <select
                  id="quiz-difficulty"
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value)}
                  disabled={loading}
                  className="sarh-input"
                >
                  {QUIZ_DIFFICULTIES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="quiz-count"
                  className="block text-sm font-semibold text-sarh-navy dark:text-slate-200"
                >
                  عدد الأسئلة
                </label>
                <input
                  id="quiz-count"
                  type="number"
                  min={1}
                  max={20}
                  value={questionCount}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (Number.isNaN(parsed)) return;
                    setQuestionCount(
                      Math.min(20, Math.max(1, Math.round(parsed)))
                    );
                  }}
                  disabled={loading}
                  className="sarh-input font-mono tabular-nums"
                  aria-describedby="quiz-count-help"
                />
                <p
                  id="quiz-count-help"
                  className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400"
                >
                  من 1 إلى 20
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="quiz-type"
                className="block text-sm font-semibold text-sarh-navy dark:text-slate-200"
              >
                نوع الأسئلة
              </label>
              <select
                id="quiz-type"
                value={typeFilter}
                onChange={(event) =>
                  setTypeFilter(event.target.value as TypeFilter)
                }
                disabled={loading}
                className="sarh-input"
                aria-describedby="quiz-type-help"
              >
                {TYPE_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p
                id="quiz-type-help"
                className="text-xs text-slate-500 dark:text-slate-400"
              >
                يُصفَّى به عرض النتيجة بعد التوليد.
              </p>
            </div>

            <Button
              type="submit"
              variant="accent"
              size="lg"
              loading={loading}
              className={cn(
                "w-full rounded-full",
                loading && "animate-ai-glow"
              )}
              icon={<Sparkles className="h-5 w-5" aria-hidden="true" />}
            >
              {loading ? "جارٍ التوليد…" : "توليد اختبار بالذكاء الاصطناعي"}
            </Button>

            {loading && (
              <p
                role="status"
                className="flex items-center justify-center gap-2 text-sm font-semibold text-sarh-teal"
              >
                <span className="h-2 w-2 animate-ping rounded-full bg-sarh-gold" />
                نحضّر أسئلة {subject} — لن يضيع ما كتبته.
              </p>
            )}
          </form>
        </aside>

        {/* ---------------- Generated result ---------------- */}
        <div>
          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-3 rounded-[14px] border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
            >
              <XCircle
                className="mt-0.5 h-5 w-5 shrink-0"
                aria-hidden="true"
              />
              <span>{error}</span>
            </div>
          )}

          {loading && !result && (
            <div className="sarh-card animate-ai-glow space-y-3 p-6">
              <div className="skeleton h-5 w-2/5" />
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <div className="skeleton h-4 w-full" />
                  <div className="skeleton h-4 w-4/5" />
                </div>
              ))}
              <p className="text-center text-sm font-semibold text-sarh-teal">
                جارٍ توليد الاختبار بالذكاء الاصطناعي…
              </p>
            </div>
          )}

          {!loading && !result && (
            <div className="sarh-card flex flex-col items-center gap-3 p-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-sarh-teal/10 ring-1 ring-inset ring-sarh-teal/25">
                <Trophy
                  className="h-7 w-7 text-sarh-teal"
                  aria-hidden="true"
                />
              </span>
              <p className="font-bold text-sarh-navy dark:text-white">
                لا يوجد اختبار بعد
              </p>
              <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
                اختر المادة وأدخل اسم الدرس، ثم اضغط «توليد اختبار بالذكاء
                الاصطناعي» ليظهر الاختبار هنا جاهزاً للطباعة والتحميل.
              </p>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-4 print:space-y-0">
              <div className="sarh-card p-5 print:border-0 print:shadow-none">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-sarh-navy dark:text-white">
                      اختبار {result.subject} — {result.lesson}
                    </h3>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                      <span>
                        الصعوبة: {DIFFICULTY_LABELS[result.difficulty] ?? result.difficulty}
                      </span>
                      <span
                        className="font-mono tabular-nums"
                        dir="ltr"
                        aria-hidden="true"
                      >
                        ·
                      </span>
                      <span className="font-mono tabular-nums">
                        {result.questions.length} سؤالاً
                      </span>
                      <span className="font-mono tabular-nums">
                        {totalPoints} نقطة
                      </span>
                      <span
                        className="font-mono text-xs tabular-nums"
                        dir="ltr"
                      >
                        {result.provider}
                      </span>
                    </p>
                  </div>
                  <Badge variant="gold">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    AI
                  </Badge>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 print:hidden">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadJson}
                    icon={<Download className="h-4 w-4" aria-hidden="true" />}
                  >
                    تحميل JSON
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.print()}
                    icon={<Printer className="h-4 w-4" aria-hidden="true" />}
                  >
                    طباعة
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void generate()}
                    icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
                  >
                    إعادة التوليد
                  </Button>
                </div>
              </div>

              {visibleQuestions.length === 0 ? (
                <div className="sarh-card flex flex-col items-center gap-3 p-8 text-center print:border-0 print:shadow-none">
                  <p className="font-semibold text-sarh-navy dark:text-white">
                    لا توجد أسئلة من هذا النوع في النتيجة
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTypeFilter("all")}
                  >
                    عرض كل الأسئلة
                  </Button>
                </div>
              ) : (
                <ol className="space-y-4">
                  {visibleQuestions.map((question, index) => (
                    <li
                      key={question.id}
                      className="sarh-card p-5 print:break-inside-avoid print:border-0 print:shadow-none"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sarh-teal/10 font-mono text-sm font-bold tabular-nums text-sarh-teal ring-1 ring-inset ring-sarh-teal/30"
                            dir="ltr"
                          >
                            {index + 1}
                          </span>
                          <p className="font-semibold leading-relaxed text-sarh-navy dark:text-slate-100">
                            {question.question}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <Badge variant="teal">
                            {TYPE_LABELS[question.type] ?? "سؤال"}
                          </Badge>
                          <Badge variant="gold">
                            <span
                              className="font-mono tabular-nums"
                              dir="ltr"
                            >
                              {question.points}
                            </span>
                            نقطة
                          </Badge>
                        </div>
                      </div>

                      {question.options.length > 0 ? (
                        <ul className="mt-3 space-y-2" aria-label="الخيارات">
                          {question.options.map((option, optionIndex) => {
                            const correct =
                              question.correctIndex === optionIndex ||
                              (question.correctIndex === null &&
                                question.answer === option);
                            return (
                              <li
                                key={optionIndex}
                                className={cn(
                                  "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm",
                                  correct
                                    ? "border-sarh-teal/40 bg-sarh-teal/10 font-semibold text-sarh-navy dark:text-white"
                                    : "border-sarh-borderLight bg-slate-50 text-slate-600 dark:border-sarh-borderDark dark:bg-white/[0.03] dark:text-slate-300"
                                )}
                              >
                                <span
                                  className={cn(
                                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                                    correct
                                      ? "bg-sarh-teal text-white"
                                      : "bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300"
                                  )}
                                  aria-hidden="true"
                                >
                                  {OPTION_MARKS[optionIndex] ?? optionIndex + 1}
                                </span>
                                <span>{option}</span>
                                {correct && (
                                  <CheckCircle2
                                    className="ms-auto h-4 w-4 shrink-0 text-sarh-teal"
                                    aria-label="الإجابة الصحيحة"
                                  />
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <div className="mt-3 rounded-lg border border-sarh-teal/30 bg-sarh-teal/10 px-3 py-2 text-sm">
                          <span className="font-bold text-sarh-teal">
                            الإجابة النموذجية:{" "}
                          </span>
                          <span className="text-slate-700 dark:text-slate-200">
                            {question.answer ?? "—"}
                          </span>
                        </div>
                      )}

                      {question.explanation && (
                        <p className="mt-3 rounded-lg bg-sarh-gold/15 px-3 py-2 text-sm leading-relaxed text-[#9A5A16] dark:text-sarh-gold">
                          <span className="font-bold">التوضيح: </span>
                          {question.explanation}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
