"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Search } from "lucide-react";

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import type {
  ApprovalRow,
  PaymentStatus,
} from "@/lib/data/finance";
import { cn } from "@/lib/utils";

type FilterValue = "ALL" | PaymentStatus;

const STATUS_META: Record<
  PaymentStatus,
  { label: string; variant: BadgeVariant }
> = {
  VERIFIED: { label: "✓ موثّق", variant: "success" },
  PENDING: { label: "◷ قيد المراجعة", variant: "gold" },
  REJECTED: { label: "× مرفوض", variant: "danger" },
};

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "ALL", label: "الكل" },
  { value: "PENDING", label: "قيد المراجعة" },
  { value: "VERIFIED", label: "موثّق" },
  { value: "REJECTED", label: "مرفوض" },
];

const APPROVE_CLS =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-[#16A34A] px-4 text-xs font-bold text-white transition-all hover:bg-[#15803D] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A34A] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const REJECT_CLS =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-red-600 px-4 text-xs font-bold text-white transition-all hover:bg-red-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Approvals queue (Design.md §48) — filters above the table, instant
 * row-level approve/reject without a page refresh, and an intentional
 * empty state per Design.md §49.
 */
export function ApprovalsTable({ initialRows }: { initialRows: ApprovalRow[] }) {
  const [rows, setRows] = useState<ApprovalRow[]>(initialRows);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("ALL");
  const [flash, setFlash] = useState<string | null>(null);

  const counts = useMemo(() => {
    const base: Record<FilterValue, number> = {
      ALL: rows.length,
      PENDING: 0,
      VERIFIED: 0,
      REJECTED: 0,
    };
    for (const row of rows) base[row.status] += 1;
    return base;
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = query.trim();
    return rows.filter((row) => {
      if (filter !== "ALL" && row.status !== filter) return false;
      if (!needle) return true;
      return (
        row.institutionName.includes(needle) ||
        row.ownerName.includes(needle) ||
        row.zone.includes(needle)
      );
    });
  }, [rows, query, filter]);

  const isDefaultView = filter === "ALL" && query.trim() === "";

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(timer);
  }, [flash]);

  async function decide(id: string, next: PaymentStatus, name: string) {
    // Optimistic row update, then the write; on failure the row is restored
    // so the queue never shows a decision the database rejected.
    const previous = rows.find((row) => row.id === id)?.status;
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, status: next } : row))
    );
    try {
      const response = await fetch(`/api/admin/institutions/${id}/trust`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setFlash(
        next === "VERIFIED"
          ? `تم اعتماد «${name}».`
          : `تم رفض طلب «${name}».`
      );
    } catch {
      setRows((prev) =>
        prev.map((row) =>
          row.id === id && previous ? { ...row, status: previous } : row
        )
      );
      setFlash(`تعذّر حفظ قرار «${name}» على الخادم — حاول مجدداً.`);
    }
  }

  function resetFilters() {
    setQuery("");
    setFilter("ALL");
  }

  const columns: Column<ApprovalRow>[] = [
    {
      key: "name",
      header: "المؤسسة",
      cell: (row) => (
        <span className="flex flex-col">
          <span className="font-semibold text-sarh-navy dark:text-slate-100">
            {row.institutionName}
          </span>
          <span
            className="font-mono text-xs tabular-nums text-slate-400"
            dir="ltr"
          >
            {row.id}
          </span>
        </span>
      ),
    },
    { key: "type", header: "النوع", cell: (row) => row.type },
    { key: "zone", header: "المنطقة", cell: (row) => row.zone },
    { key: "owner", header: "المالك", cell: (row) => row.ownerName },
    {
      key: "status",
      header: "الحالة",
      align: "center",
      cell: (row) => {
        const meta = STATUS_META[row.status];
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
    },
    {
      key: "date",
      header: "التاريخ",
      align: "center",
      cell: (row) => (
        <time
          dateTime={row.submittedAt}
          className="font-mono text-sm tabular-nums"
          dir="ltr"
        >
          {row.submittedAt}
        </time>
      ),
    },
    {
      key: "action",
      header: "الإجراء",
      align: "center",
      cell: (row) =>
        row.status === "PENDING" ? (
          <span className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => void decide(row.id, "VERIFIED", row.institutionName)}
              className={APPROVE_CLS}
            >
              اعتماد
            </button>
            <button
              type="button"
              onClick={() => void decide(row.id, "REJECTED", row.institutionName)}
              className={REJECT_CLS}
            >
              رفض
            </button>
          </span>
        ) : (
          <span className="text-xs font-semibold text-slate-400">
            لا إجراء مطلوب
          </span>
        ),
    },
  ];

  return (
    <section aria-labelledby="approvals-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="approvals-heading"
            className="flex items-center gap-2 text-lg font-bold text-sarh-navy dark:text-white"
          >
            <ClipboardCheck
              className="h-5 w-5 text-sarh-teal"
              aria-hidden="true"
            />
            طابور اعتماد المؤسسات
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            طلبات انضمام رياض الأطفال والمراكز — التحديث فوري دون إعادة تحميل.
          </p>
        </div>
        <Badge variant="gold">
          <span className="font-mono tabular-nums" dir="ltr">
            {counts.PENDING}
          </span>
          معلّق
        </Badge>
      </div>

      {flash && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-[14px] border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
        >
          {flash}
        </p>
      )}

      {/* Filters above the table (Design.md §26) */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث باسم المؤسسة أو المالك أو المنطقة…"
            aria-label="بحث في طلبات الاعتماد"
            className="sarh-input ps-9"
          />
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="فلتر الحالة">
          {FILTERS.map((option) => {
            const active = filter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                aria-pressed={active}
                className={cn(
                  "rounded-full px-4 py-2 text-xs font-bold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal focus-visible:ring-offset-2",
                  active
                    ? "bg-sarh-teal text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-sarh-teal/10 hover:text-sarh-teal dark:bg-white/10 dark:text-slate-300"
                )}
              >
                {option.label}{" "}
                <span className="font-mono tabular-nums" dir="ltr">
                  {counts[option.value]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="sarh-card flex flex-col items-center gap-3 p-10 text-center">
          <p className="font-bold text-sarh-navy dark:text-white">
            {isDefaultView
              ? "لا توجد طلبات معلقة حالياً"
              : "لا توجد نتائج مطابقة للبحث أو الفلاتر"}
          </p>
          {!isDefaultView && (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              إعادة ضبط الفلاتر
            </Button>
          )}
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.id}
          emptyMessage="لا توجد طلبات معلقة حالياً"
        />
      )}
    </section>
  );
}
