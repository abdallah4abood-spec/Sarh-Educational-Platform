"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Search } from "lucide-react";

/**
 * Error boundary for the public area.
 *
 * A visitor hitting a failed database read on a marketing or directory page is
 * anonymous and has no portal to fall back to, so the recovery offered is
 * "try again" plus a route back into the catalogue rather than anything
 * account-shaped.
 */
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[public] route error:", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto grid min-h-[60vh] max-w-lg place-items-center px-4 py-16">
      <div className="sarh-card w-full space-y-4 p-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-sarh-gold/15 text-[#B4641A] dark:text-sarh-gold">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </span>

        <h1 className="text-lg font-bold text-sarh-navy dark:text-white">
          تعذّر عرض هذا المحتوى
        </h1>
        <p className="text-sm leading-7 text-slate-500 dark:text-slate-400">
          واجهنا مشكلة أثناء جلب البيانات. يمكنك المحاولة مرة أخرى، أو تصفّح
          الدليل من جديد.
        </p>

        {error.digest ? (
          <p className="font-mono text-[11px] text-slate-400" dir="ltr">
            {error.digest}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={reset}
            className="sarh-btn-primary h-10 gap-2 rounded-lg px-4 text-sm shadow-teal-glow hover:brightness-110"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            إعادة المحاولة
          </button>
          <Link
            href="/explore/centers"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-sarh-borderLight px-4 text-sm font-semibold text-sarh-navy transition-colors hover:border-sarh-teal hover:text-sarh-teal dark:border-sarh-borderDark dark:text-slate-100"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            تصفّح المراكز
          </Link>
        </div>
      </div>
    </div>
  );
}
