import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Shared dashboard primitives.
 *
 * Every portal screen is assembled from these three pieces, which is what
 * keeps the five dashboards visually identical while their data differs:
 *
 *   StatCard   — one KPI tile. Renders as a *link* when it owns a drill-down
 *                workspace, so the overview → drill-down hop is a real
 *                affordance instead of a dead number (Pillar 3).
 *   PageHeader — breadcrumb + title + lead + action slot.
 *   Panel      — a titled card with an optional "عرض الكل" drill-down link.
 */

export type StatAccent = "teal" | "gold" | "navy" | "rose";

const ACCENT_RING: Record<StatAccent, string> = {
  teal: "ring-sarh-teal/25",
  gold: "ring-sarh-gold/40",
  navy: "ring-sarh-navy/20 dark:ring-white/15",
  rose: "ring-rose-400/30",
};

const ACCENT_CHIP: Record<StatAccent, string> = {
  teal: "bg-sarh-teal/10 ring-sarh-teal/25 text-sarh-teal",
  gold: "bg-sarh-gold/15 ring-sarh-gold/40 text-sarh-gold",
  navy: "bg-sarh-navy/10 ring-sarh-navy/20 text-sarh-navy dark:bg-white/10 dark:ring-white/15 dark:text-white",
  rose: "bg-rose-500/10 ring-rose-400/30 text-rose-500",
};

const ACCENT_VALUE: Record<StatAccent, string> = {
  teal: "text-sarh-navy dark:text-white",
  gold: "text-sarh-navy dark:text-white",
  navy: "text-sarh-navy dark:text-white",
  rose: "text-rose-600 dark:text-rose-400",
};

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  accent?: StatAccent;
  /** Small supporting line under the label (e.g. "+12% هذا الشهر"). */
  hint?: string;
  /** When present the whole tile becomes a link to the drill-down workspace. */
  href?: string;
  /** Call-to-action label shown next to the arrow on a linked tile. */
  cta?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = "teal",
  hint,
  href,
  cta,
  className,
}: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ring-inset",
            ACCENT_CHIP[accent]
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        {href ? (
          <span className="flex items-center gap-1 text-[11px] font-bold text-sarh-teal opacity-0 transition-opacity group-hover:opacity-100">
            {cta ?? "التفاصيل"}
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        ) : null}
      </div>

      <p
        className={cn(
          "mt-3 font-mono text-2xl font-bold tabular-nums",
          ACCENT_VALUE[accent]
        )}
        dir="ltr"
      >
        {value}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</p>
      ) : null}
    </>
  );

  const shell = cn(
    "group block rounded-2xl bg-sarh-cardLight p-5 ring-1 ring-inset shadow-soft transition-all dark:bg-sarh-cardDark",
    ACCENT_RING[accent],
    href && "hover:-translate-y-0.5 hover:shadow-teal-glow",
    className
  );

  if (href) {
    return (
      <Link href={href} className={shell}>
        {body}
      </Link>
    );
  }

  return <article className={shell}>{body}</article>;
}

interface PageHeaderProps {
  /** Breadcrumb segments, e.g. ["الإدارة", "المالية"]. The portal caption is
   * prepended automatically by the shell's breadcrumb trail when omitted. */
  breadcrumb?: string[];
  title: string;
  lead?: string;
  icon?: LucideIcon;
  /** Badge / action cluster on the opposite edge. */
  actions?: ReactNode;
}

export function PageHeader({
  breadcrumb,
  title,
  lead,
  icon: Icon,
  actions,
}: PageHeaderProps) {
  return (
    <header className="mb-6">
      {breadcrumb && breadcrumb.length > 0 ? (
        <nav aria-label="مسار التنقل" className="mb-1.5">
          <p className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-sarh-teal">
            <span>صَرْح</span>
            {breadcrumb.map((crumb) => (
              <span key={crumb} className="flex items-center gap-1.5">
                <span className="text-slate-400">/</span>
                <span className="text-slate-500 dark:text-slate-400">
                  {crumb}
                </span>
              </span>
            ))}
          </p>
        </nav>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-sarh-navy dark:text-white">
            {Icon ? (
              <Icon className="h-6 w-6 text-sarh-gold" aria-hidden="true" />
            ) : null}
            {title}
          </h1>
          {lead ? (
            <p className="mt-1 max-w-2xl text-sm leading-7 text-slate-500 dark:text-slate-400">
              {lead}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

interface PanelProps {
  title: string;
  icon?: LucideIcon;
  /** Drill-down target — renders the "عرض الكل" affordance. */
  moreHref?: string;
  moreLabel?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function Panel({
  title,
  icon: Icon,
  moreHref,
  moreLabel = "عرض الكل",
  description,
  actions,
  className,
  bodyClassName,
  children,
}: PanelProps) {
  return (
    <section className={cn("sarh-card overflow-hidden", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sarh-borderLight px-5 py-4 dark:border-sarh-borderDark">
        <div className="flex items-center gap-2">
          {Icon ? (
            <Icon className="h-4 w-4 text-sarh-teal" aria-hidden="true" />
          ) : null}
          <div>
            <h2 className="text-sm font-bold text-sarh-navy dark:text-white">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {actions}
          {moreHref ? (
            <Link
              href={moreHref}
              className="flex items-center gap-1 text-xs font-bold text-sarh-teal transition-colors hover:text-sarh-tealDeep"
            >
              {moreLabel}
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </div>

      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * Progress bar used by plan/attendance/quality meters. `value` is 0–100 and is
 * clamped so a data slip can never paint outside the track.
 */
export function Meter({
  value,
  accent = "teal",
  label,
  valueLabel,
}: {
  value: number;
  accent?: "teal" | "gold" | "rose";
  label?: string;
  valueLabel?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const fill =
    accent === "gold"
      ? "bg-sarh-gold"
      : accent === "rose"
        ? "bg-rose-500"
        : "bg-sarh-teal";

  return (
    <div>
      {label || valueLabel ? (
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold">
          <span className="text-slate-500 dark:text-slate-400">{label}</span>
          <span className="font-mono tabular-nums text-sarh-navy dark:text-slate-200">
            {valueLabel ?? `${clamped}%`}
          </span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-sarh-muted dark:bg-white/10"
      >
        <span
          className={cn("block h-full rounded-full", fill)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
