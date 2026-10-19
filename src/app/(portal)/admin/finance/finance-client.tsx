"use client";

import Link from "next/link";
import { Building2, ClipboardCheck, Landmark, Settings2, Wallet } from "lucide-react";

import { ApprovalsTable } from "./approvals-table";
import { OCRReconciler } from "./ocr-reconciler";
import type {
  ApprovalRow,
  FinanceStats,
  PaymentReceipt,
} from "@/lib/data/finance";
import { cn, formatSarh } from "@/lib/utils";

interface StatCard {
  key: string;
  label: string;
  value: string;
  icon: typeof Wallet;
  accent: "teal" | "gold";
}

/**
 * Admin finance shell (Design.md §47) — glassmorphism KPI header with
 * Teal/Gold rings, then the split OCR workspace and the approvals queue.
 * Every figure renders with `font-mono tabular-nums` (Design.md §7).
 */
export function FinanceClient({
  stats: finance,
  receipts,
  approvals,
}: {
  stats: FinanceStats;
  receipts: PaymentReceipt[];
  approvals: ApprovalRow[];
}) {
  const stats: StatCard[] = [
    {
      key: "revenue",
      label: "إجمالي الإيرادات",
      value: formatSarh(finance.totalRevenue, "en-US"),
      icon: Landmark,
      accent: "teal",
    },
    {
      key: "commissions",
      label: "العمولات المحصلة",
      value: formatSarh(finance.collectedCommissions, "en-US"),
      icon: Wallet,
      accent: "gold",
    },
    {
      key: "pending",
      label: "الطلبات المعلقة",
      value: String(finance.pendingApprovals),
      icon: ClipboardCheck,
      accent: "gold",
    },
    {
      key: "centers",
      label: "المؤسسات النشطة",
      value: String(finance.activeCenters),
      icon: Building2,
      accent: "teal",
    },
  ];

  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl px-4 pb-20 pt-6">
      <header className="mb-6">
        <p className="flex items-center gap-1.5 text-xs font-bold text-sarh-teal">
          <span>صَرْح</span>
          <span className="text-slate-400">/</span>
          <span className="text-slate-500 dark:text-slate-400">
            الإدارة المالية
          </span>
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-sarh-navy dark:text-white">
              المركز المالي
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              إيرادات المنصة، مطابقة إيصالات الدفع بالذكاء الاصطناعي، وطابور
              اعتماد المؤسسات.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-2 rounded-full bg-sarh-navy/10 px-4 py-1.5 text-xs font-bold text-sarh-navy ring-1 ring-inset ring-sarh-navy/25 dark:bg-white/10 dark:text-white dark:ring-white/20">
              <Landmark className="h-4 w-4" aria-hidden="true" />
              محفظة صَرْح المالية
            </span>
            <Link
              href="/admin/settings"
              className="flex items-center gap-2 rounded-full border border-sarh-borderLight px-4 py-1.5 text-xs font-bold text-sarh-navy transition-colors hover:border-sarh-teal hover:text-sarh-teal dark:border-sarh-borderDark dark:text-slate-200"
            >
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              إعدادات المنصة
            </Link>
          </div>
        </div>
      </header>

      {/* ---------------- KPI header ---------------- */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <article
            key={stat.key}
            className={cn(
              "sarh-glass rounded-[14px] p-5 ring-1 ring-inset",
              stat.accent === "teal"
                ? "ring-sarh-teal/30"
                : "ring-sarh-gold/40"
            )}
          >
            <span
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-inset",
                stat.accent === "teal"
                  ? "bg-sarh-teal/10 ring-sarh-teal/25"
                  : "bg-sarh-gold/15 ring-sarh-gold/40"
              )}
            >
              <stat.icon
                className={cn(
                  "h-5 w-5",
                  stat.accent === "teal" ? "text-sarh-teal" : "text-sarh-gold"
                )}
                aria-hidden="true"
              />
            </span>
            <p
              className="mt-3 font-mono text-2xl font-bold tabular-nums text-sarh-navy dark:text-white"
              dir="ltr"
            >
              {stat.value}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
              {stat.label}
            </p>
          </article>
        ))}
      </div>

      <div className="space-y-10">
        <OCRReconciler receipts={receipts} />
        <ApprovalsTable initialRows={approvals} />
      </div>
    </div>
  );
}
