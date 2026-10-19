import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "teal"
  | "gold"
  | "navy"
  | "success"
  | "danger"
  | "neutral"
  | "outline";

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
}

const VARIANTS: Record<BadgeVariant, string> = {
  teal: "bg-sarh-teal/10 text-sarh-teal ring-sarh-teal/30",
  gold: "bg-sarh-gold/15 text-[#C9741F] ring-sarh-gold/40 dark:text-sarh-gold",
  navy: "bg-sarh-navy/10 text-sarh-navy ring-sarh-navy/25 dark:bg-white/10 dark:text-white dark:ring-white/20",
  success: "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400",
  danger: "bg-red-500/15 text-red-600 ring-red-500/30 dark:text-red-400",
  neutral: "bg-slate-500/10 text-slate-600 ring-slate-500/25 dark:text-slate-300",
  outline:
    "bg-transparent text-sarh-navy ring-sarh-borderLight dark:text-slate-200 dark:ring-sarh-borderDark",
};

/** Pill badge used for zones, statuses, verified marks and counters. */
export function Badge({
  variant = "neutral",
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "sarh-badge ring-1 ring-inset",
        VARIANTS[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
