import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Status vocabulary for the portal tables.
 *
 * The data modules store machine states (`PENDING`, `ON_LEAVE`, `REJECTED`)
 * because they mirror the Prisma enums; the dashboards speak Arabic. Mapping
 * happens once here so the same row never reads «قيد المراجعة» on one screen
 * and «بانتظار الاعتماد» on another — a small thing that users read as
 * sloppiness.
 */

export type PillTone = "teal" | "gold" | "rose" | "slate" | "navy" | "violet";

const TONE: Record<PillTone, string> = {
  teal: "bg-sarh-teal/10 text-sarh-tealDeep ring-sarh-teal/25 dark:text-sarh-teal",
  gold: "bg-sarh-gold/15 text-[#B4641A] ring-sarh-gold/40 dark:text-sarh-gold",
  rose: "bg-rose-500/10 text-rose-600 ring-rose-400/30 dark:text-rose-400",
  slate:
    "bg-sarh-muted text-slate-600 ring-sarh-borderLight dark:bg-white/10 dark:text-slate-300 dark:ring-white/10",
  navy: "bg-sarh-navy/10 text-sarh-navy ring-sarh-navy/20 dark:bg-white/10 dark:text-white dark:ring-white/15",
  violet: "bg-violet-500/10 text-violet-700 ring-violet-400/30 dark:text-violet-300",
};

export function StatusPill({
  children,
  tone = "slate",
  icon: Icon,
  className,
}: {
  children: ReactNode;
  tone?: PillTone;
  icon?: (props: { className?: string }) => ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset",
        TONE[tone],
        className
      )}
    >
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {children}
    </span>
  );
}

interface PillSpec {
  label: string;
  tone: PillTone;
}

/** Payment / approval lifecycle (`PaymentStatus`). */
export function paymentPill(status: string): PillSpec {
  switch (status) {
    case "VERIFIED":
      return { label: "معتمد", tone: "teal" };
    case "REJECTED":
      return { label: "مرفوض", tone: "rose" };
    default:
      return { label: "قيد المراجعة", tone: "gold" };
  }
}

/** Institution verification state in the directory. */
export function institutionPill(state: string): PillSpec {
  switch (state) {
    case "VERIFIED":
      return { label: "موثّق", tone: "teal" };
    case "SUSPENDED":
      return { label: "موقوف", tone: "rose" };
    default:
      return { label: "قيد التوثيق", tone: "gold" };
  }
}

/** Lesson-plan review outcome. */
export function planPill(status: string): PillSpec {
  switch (status) {
    case "APPROVED":
      return { label: "معتمدة", tone: "teal" };
    case "REVISION":
      return { label: "بحاجة تعديل", tone: "rose" };
    default:
      return { label: "قيد المراجعة", tone: "gold" };
  }
}

/** Teacher attendance in a roster row. */
export function attendancePill(status: string): PillSpec {
  switch (status) {
    case "PRESENT":
      return { label: "حاضر", tone: "teal" };
    case "LATE":
      return { label: "متأخر", tone: "gold" };
    default:
      return { label: "غائب", tone: "rose" };
  }
}

/** Employment state of a center staff member. */
export function staffPill(status: string): PillSpec {
  switch (status) {
    case "ACTIVE":
      return { label: "نشط", tone: "teal" };
    case "ON_LEAVE":
      return { label: "في إجازة", tone: "gold" };
    default:
      return { label: "بانتظار القبول", tone: "slate" };
  }
}

/** Platform account state. */
export function accountPill(status: string): PillSpec {
  switch (status) {
    case "ACTIVE":
      return { label: "نشط", tone: "teal" };
    case "SUSPENDED":
      return { label: "موقوف", tone: "rose" };
    default:
      return { label: "غير مفعّل", tone: "gold" };
  }
}

/** Live-vs-bundled provenance badge used by the DB-backed screens. */
export function sourcePill(source: "db" | "offline"): PillSpec {
  return source === "db"
    ? { label: "بيانات مباشرة من قاعدة البيانات", tone: "teal" }
    : { label: "نسخة محلية — تعذّر الوصول لقاعدة البيانات", tone: "gold" };
}
