"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Image from "next/image";
import {
  CheckCircle2,
  Database,
  RotateCcw,
  Sparkles,
  XCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import type {
  PaymentReceipt,
  PaymentStatus,
} from "@/lib/data/finance";
import { cn, formatSarh } from "@/lib/utils";

const API_BASE =
  process.env.NEXT_PUBLIC_FASTAPI_URL ?? "http://localhost:8000";

interface OcrResponse {
  status: "ok" | "no_engine" | "unreadable";
  engine?: string;
  ocrText?: string;
  amount?: number | null;
  currency?: string | null;
  transactionId?: string | null;
  payerName?: string | null;
  date?: string | null;
  confidence?: number;
  message?: string | null;
}

interface ExtractedFields {
  amount: number | null;
  currency: string | null;
  transactionId: string | null;
  payerName: string | null;
  date: string | null;
  confidence: number | null;
  /** `stored` = the DB record, `ai` = freshly extracted by OCR. */
  origin: "stored" | "ai";
  engine?: string | null;
}

const STATUS_META: Record<
  PaymentStatus,
  { label: string; variant: BadgeVariant; short: string }
> = {
  VERIFIED: { label: "✓ معتمد", variant: "success", short: "معتمد" },
  PENDING: { label: "◷ قيد المراجعة", variant: "gold", short: "معلّق" },
  REJECTED: { label: "× مرفوض", variant: "danger", short: "مرفوض" },
};

function confidenceBadge(confidence: number | null): {
  label: string;
  variant: BadgeVariant;
} {
  if (confidence === null) {
    return { label: "غير متاح", variant: "neutral" };
  }
  const percent = Math.round(confidence * 100);
  if (confidence >= 0.9) {
    return { label: `ثقة عالية · ${percent}%`, variant: "success" };
  }
  if (confidence >= 0.7) {
    return { label: `يحتاج مراجعة · ${percent}%`, variant: "gold" };
  }
  return { label: `ثقة منخفضة · ${percent}%`, variant: "danger" };
}

function fmtMoney(amount: number | null, currency: string | null): string {
  if (amount === null) return "—";
  if (currency && currency !== "ILS") return `${amount.toFixed(2)} ${currency}`;
  return formatSarh(amount, "en-US");
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-sarh-borderLight py-3 last:border-0 dark:border-sarh-borderDark">
      <dt className="text-sm font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className="min-w-0 text-end">{children}</dd>
    </div>
  );
}

/**
 * OCR Reconciliation Workspace (Design.md §25 + §47) — split screen:
 * receipt viewer with zoom on the left, extracted AI fields with
 * confidence + database match on the right. The AI extraction never
 * silently approves a transaction; a human always confirms.
 */
export function OCRReconciler({ receipts }: { receipts: PaymentReceipt[] }) {
  const [selectedId, setSelectedId] = useState(receipts[0]?.id ?? "");
  const [zoom, setZoom] = useState(1);
  const [statuses, setStatuses] = useState<Record<string, PaymentStatus>>(
    () => Object.fromEntries(receipts.map((r) => [r.id, r.status]))
  );
  const [aiFields, setAiFields] = useState<Record<string, ExtractedFields>>({});

  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(
    null
  );
  const [flash, setFlash] = useState<string | null>(null);

  const selected = useMemo(
    () =>
      receipts.find((receipt) => receipt.id === selectedId) ??
      receipts[0] ??
      null,
    [receipts, selectedId]
  );

  const shown: ExtractedFields = useMemo(() => {
    if (!selected) {
      return {
        amount: null,
        currency: "ILS",
        transactionId: null,
        payerName: "",
        date: "",
        confidence: 0,
        origin: "stored",
      };
    }
    return (
      aiFields[selected.id] ?? {
        amount: selected.amount,
        currency: selected.currency,
        transactionId: selected.transactionId,
        payerName: selected.payerName,
        date: selected.date,
        confidence: selected.confidence,
        origin: "stored",
      }
    );
  }, [aiFields, selected]);

  const dbMatch = useMemo(() => {
    if (!selected) {
      return { label: "—", variant: "neutral" as BadgeVariant };
    }
    const ai = aiFields[selected.id];
    if (!ai) {
      return { label: "بانتظار الاستخراج", variant: "neutral" as BadgeVariant };
    }
    const amountOk =
      ai.amount !== null && Math.abs(ai.amount - selected.amount) < 0.01;
    const txOk =
      ai.transactionId !== null &&
      ai.transactionId.trim() === selected.transactionId;
    if (amountOk && txOk) {
      return {
        label: "✓ مطابق لقاعدة البيانات",
        variant: "success" as BadgeVariant,
      };
    }
    if (ai.amount === null && ai.transactionId === null) {
      return { label: "لا توجد بيانات كافية", variant: "neutral" as BadgeVariant };
    }
    return { label: "× لا يوجد تطابق تام", variant: "danger" as BadgeVariant };
  }, [aiFields, selected]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(timer);
  }, [flash]);

  // Empty ledger: the workspace explains itself instead of rendering against
  // an undefined receipt. Placed after every hook so hook order is stable.
  if (!selected) {
    return (
      <section
        aria-labelledby="ocr-heading"
        className="sarh-card p-10 text-center"
      >
        <p className="font-bold text-sarh-navy dark:text-white">
          لا توجد إيصالات بانتظار المطابقة حالياً.
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          ستظهر هنا كل إيصالات الدفع الجديدة فور وصولها من المؤسسات.
        </p>
      </section>
    );
  }

  const status = statuses[selected.id];

  function selectReceipt(id: string) {
    setSelectedId(id);
    setZoom(1);
    setExtractError(null);
    setNotice(null);
    setFile(null);
  }

  async function extract() {
    if (!file) {
      setExtractError("اختر صورة الإيصال أولاً.");
      return;
    }
    setExtracting(true);
    setExtractError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`${API_BASE}/api/ai/ocr-receipt`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        setExtractError("تعذر استخراج بيانات الإيصال. حاول مرة أخرى.");
        return;
      }
      const data = (await response.json()) as OcrResponse;
      if (data.status === "ok") {
        setAiFields((prev) => ({
          ...prev,
          [selected.id]: {
            amount: data.amount ?? null,
            currency: data.currency ?? null,
            transactionId: data.transactionId ?? null,
            payerName: data.payerName ?? null,
            date: data.date ?? null,
            confidence: data.confidence ?? null,
            origin: "ai",
            engine: data.engine ?? null,
          },
        }));
        setNotice({
          tone: "ok",
          text: "تم استخراج البيانات بنجاح — راجعها قبل الاعتماد.",
        });
      } else if (data.status === "no_engine") {
        setNotice({
          tone: "warn",
          text:
            data.message ??
            "لا يتوفر محرك OCR على هذا الجهاز؛ راجع البيانات المخزّنة يدوياً قبل الاعتماد.",
        });
      } else {
        setExtractError(
          data.message ?? "تعذّرت قراءة الصورة. جرّب صورة أوضح وأعد المحاولة."
        );
      }
    } catch {
      setExtractError(
        "تعذر الاتصال بخدمة الذكاء الاصطناعي. تأكد من تشغيل الخدمة وحاول مرة أخرى."
      );
    } finally {
      setExtracting(false);
    }
  }

  async function decide(next: "VERIFIED" | "REJECTED") {
    // Optimistic flip, then persist to PostgreSQL; a failed write rolls the
    // row back so the screen never claims a decision the ledger does not have.
    const previous = statuses[selected.id];
    setStatuses((prev) => ({ ...prev, [selected.id]: next }));
    try {
      const response = await fetch(`/api/admin/transactions/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setFlash(
        next === "VERIFIED"
          ? `تم اعتماد إيصال ${selected.payerName}.`
          : `تم رفض طلب إيصال ${selected.payerName}.`
      );
    } catch {
      setStatuses((prev) => ({ ...prev, [selected.id]: previous }));
      setFlash("تعذّر حفظ القرار على الخادم — لم يتغيّر سجل الإيصال، حاول مجدداً.");
    }
  }

  const confidence = confidenceBadge(shown.confidence);

  return (
    <section aria-labelledby="ocr-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="ocr-heading"
            className="flex items-center gap-2 text-lg font-bold text-sarh-navy dark:text-white"
          >
            <Database className="h-5 w-5 text-sarh-teal" aria-hidden="true" />
            مطابقة الإيصالات
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            استخرج بيانات الدفع بالذكاء الاصطناعي، قارنها بقاعدة البيانات، ثم
            اعتمد أو ارفض — لا يُعتمد أي معاملة تلقائياً.
          </p>
        </div>
        <Badge variant="gold">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          OCR
        </Badge>
      </div>

      {flash && (
        <p
          role="status"
          className="mb-4 flex items-center gap-2 rounded-[14px] border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {flash}
        </p>
      )}

      {/* Receipt picker */}
      <div
        role="group"
        className="mb-5 flex gap-3 overflow-x-auto pb-1"
        aria-label="اختيار إيصال للمطابقة"
      >
        {receipts.map((receipt) => {
          const active = receipt.id === selectedId;
          const receiptStatus = statuses[receipt.id];
          const meta = STATUS_META[receiptStatus];
          return (
            <button
              key={receipt.id}
              type="button"
              onClick={() => selectReceipt(receipt.id)}
              aria-pressed={active}
              className={cn(
                "flex min-w-[240px] flex-1 items-center gap-3 rounded-[14px] border p-2.5 text-start transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal focus-visible:ring-offset-2",
                active
                  ? "border-sarh-teal bg-sarh-teal/10"
                  : "border-sarh-borderLight bg-white hover:border-sarh-teal/40 dark:border-sarh-borderDark dark:bg-sarh-cardDark"
              )}
            >
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                <Image
                  src={receipt.image}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-sarh-navy dark:text-white">
                  {receipt.payerName}
                </span>
                <span
                  className="block font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400"
                  dir="ltr"
                >
                  {formatSarh(receipt.amount, "en-US")} · {receipt.transactionId}
                </span>
              </span>
              <Badge variant={meta.variant} className="shrink-0">
                {meta.short}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Split workspace: viewer (left on desktop) + fields (right) */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* -------- Receipt viewer -------- */}
        <div className="lg:order-2">
          <div className="sarh-card h-full p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-sarh-navy dark:text-white">
                صورة الإيصال
              </p>
              <div className="flex items-center gap-1.5">
                <span
                  className="ms-1 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400"
                  dir="ltr"
                  aria-live="polite"
                >
                  {Math.round(zoom * 100)}%
                </span>
                {[
                  {
                    key: "out",
                    label: "تصغير",
                    icon: ZoomOut,
                    disabled: zoom <= 1,
                    action: () => setZoom((z) => Math.max(1, z - 0.25)),
                  },
                  {
                    key: "in",
                    label: "تكبير",
                    icon: ZoomIn,
                    disabled: zoom >= 3,
                    action: () => setZoom((z) => Math.min(3, z + 0.25)),
                  },
                  {
                    key: "reset",
                    label: "إعادة الضبط",
                    icon: RotateCcw,
                    disabled: zoom === 1,
                    action: () => setZoom(1),
                  },
                ].map((control) => (
                  <button
                    key={control.key}
                    type="button"
                    onClick={control.action}
                    disabled={control.disabled}
                    aria-label={control.label}
                    title={control.label}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal focus-visible:ring-offset-2",
                      "disabled:cursor-not-allowed disabled:opacity-40",
                      "border-sarh-borderLight text-sarh-navy hover:border-sarh-teal hover:text-sarh-teal",
                      "dark:border-sarh-borderDark dark:text-slate-200"
                    )}
                  >
                    <control.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[440px] overflow-auto rounded-[14px] bg-slate-100 p-2 dark:bg-slate-900">
              {/*
                * The receipt is a user-uploaded file reached by URL, so its
                * intrinsic size is unknown at build time — `fill` inside an
                * aspect box lets the image scale with the zoom control without
                * the layout jumping when it loads.
                */}
              <div className="relative aspect-[3/4] w-full">
                <Image
                  src={selected.image}
                  alt={`إيصال دفع — ${selected.payerName}`}
                  fill
                  className="rounded-lg object-contain"
                  style={{ width: `${zoom * 100}%` }}
                  sizes="(max-width: 1024px) 100vw, 560px"
                />
              </div>
            </div>

            <p
              className="mt-2 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400"
              dir="ltr"
            >
              {selected.id} · {selected.transactionId}
            </p>
          </div>
        </div>

        {/* -------- Extracted OCR fields -------- */}
        <div className="lg:order-1">
          <div className="sarh-card h-full p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-sarh-navy dark:text-white">
                البيانات المستخرجة
              </p>
              <Badge variant={shown.origin === "ai" ? "teal" : "navy"}>
                {shown.origin === "ai"
                  ? "مستخرج الآن عبر AI"
                  : "بيانات مخزّنة"}
              </Badge>
            </div>

            <dl className="mt-2">
              <FieldRow label="المبلغ">
                <span
                  className="font-mono text-lg font-bold tabular-nums text-sarh-navy dark:text-white"
                  dir="ltr"
                >
                  {fmtMoney(shown.amount, shown.currency)}
                </span>
              </FieldRow>
              <FieldRow label="رقم المعاملة">
                <span
                  className="font-mono text-sm font-semibold tabular-nums"
                  dir="ltr"
                >
                  {shown.transactionId ?? "—"}
                </span>
              </FieldRow>
              <FieldRow label="اسم الدافع">
                <span className="font-semibold text-sarh-navy dark:text-slate-100">
                  {shown.payerName ?? "—"}
                </span>
              </FieldRow>
              <FieldRow label="التاريخ">
                <span
                  className="font-mono text-sm tabular-nums"
                  dir="ltr"
                >
                  {shown.date ?? "—"}
                </span>
              </FieldRow>
              <FieldRow label="مستوى الثقة">
                <Badge variant={confidence.variant}>{confidence.label}</Badge>
              </FieldRow>
              <FieldRow label="مطابقة قاعدة البيانات">
                <Badge variant={dbMatch.variant}>{dbMatch.label}</Badge>
              </FieldRow>
              <FieldRow label="الحالة">
                <Badge variant={STATUS_META[status].variant}>
                  {STATUS_META[status].label}
                </Badge>
              </FieldRow>
            </dl>

            {/* Upload + AI extraction */}
            <div className="mt-4 space-y-3 rounded-[14px] border border-dashed border-sarh-borderLight p-4 dark:border-sarh-borderDark">
              <FileInput
                value={file}
                onChange={setFile}
                label="رفع إيصال آخر"
                hint="يُضغط تلقائياً إلى WebP قبل الإرسال (متوافق مع ضعف الشبكة)."
                errorMessage="الصورة أكبر من الحد المسموح (8 ميغابايت)"
                disabled={extracting}
              />
              <Button
                variant="accent"
                className="w-full rounded-full"
                loading={extracting}
                onClick={() => void extract()}
                icon={<Sparkles className="h-5 w-5" aria-hidden="true" />}
              >
                {extracting ? "جارٍ الاستخراج…" : "استخراج بيانات الإيصال"}
              </Button>
            </div>

            {extractError && (
              <p
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-[14px] border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
              >
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {extractError}
              </p>
            )}

            {notice && (
              <p
                role="status"
                className={cn(
                  "mt-3 flex items-start gap-2 rounded-[14px] border px-4 py-2.5 text-sm font-semibold",
                  notice.tone === "ok"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                )}
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {notice.text}
              </p>
            )}

            {/* Decision actions */}
            <div className="mt-4">
              {status === "PENDING" ? (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void decide("VERIFIED")}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#16A34A] px-6 text-sm font-bold text-white transition-all hover:bg-[#15803D] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A34A] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    تأكيد الاعتماد
                  </button>
                  <button
                    type="button"
                    onClick={() => void decide("REJECTED")}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-red-600 px-6 text-sm font-bold text-white transition-all hover:bg-red-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <XCircle className="h-5 w-5" aria-hidden="true" />
                    رفض الطلب
                  </button>
                </div>
              ) : (
                <p className="flex items-center justify-center gap-2 rounded-full bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  تمت مراجعة هذا الإيصال — {STATUS_META[status].label}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
