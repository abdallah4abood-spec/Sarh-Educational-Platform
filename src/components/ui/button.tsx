import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "accent"
  | "outline"
  | "ghost"
  | "danger"
  | "google";

export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-sarh-teal text-white hover:brightness-110 shadow-teal-glow focus-visible:ring-sarh-teal",
  accent:
    "bg-sarh-gold text-white hover:brightness-110 shadow-gold-glow focus-visible:ring-sarh-gold",
  outline:
    "border border-sarh-borderLight bg-transparent text-sarh-navy hover:border-sarh-teal hover:text-sarh-teal dark:border-sarh-borderDark dark:text-slate-100 dark:hover:text-sarh-teal",
  google:
    "inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-sarh-teal hover:bg-sarh-teal/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-sarh-cardDark dark:text-slate-200 dark:hover:border-sarh-teal",
  ghost:
    "bg-transparent text-sarh-navy hover:bg-sarh-teal/10 dark:text-slate-200",
  danger:
    "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-7 text-base",
};

/**
 * SARH button. Variants map straight onto the brand tokens so every action
 * in the platform looks identical (Design.md — reusable UI components).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      icon,
      className,
      children,
      type = "button",
      ...rest
    },
    ref
  ) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold",
        "transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "rtl:gap-2 ltr:gap-2",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        icon
      )}
      {children}
    </button>
  )
);

Button.displayName = "Button";
