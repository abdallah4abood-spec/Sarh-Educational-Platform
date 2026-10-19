"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Error boundary for the whole portal area.
 *
 * The portal pages read PostgreSQL directly, which introduces a failure mode
 * the fixture-backed versions could not have: the database is unreachable, a
 * query times out, or a row a page depends on was deleted underneath it. Without
 * this boundary any of those produced Next's default error screen — an
 * unstyled English stack trace inside an Arabic RTL product.
 *
 * Two things matter here beyond the copy:
 *   - `reset()` re-renders the segment, which re-runs the failed server query.
 *     That is the only recovery that actually works, so it leads.
 *   - A link out is offered as well, because a retry against a genuinely down
 *     database would just fail again and the user would be stuck.
 */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-thrown errors arrive stripped of their message in production, so
    // the digest is the only handle that ties this screen to a server log line.
    console.error("[portal] route error:", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center px-4">
      <div className="sarh-card w-full max-w-lg space-y-4 p-7 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </span>

        <h1 className="text-lg font-bold text-sarh-navy dark:text-white">
          تعذّر تحميل هذه الصفحة
        </h1>
        <p className="text-sm leading-7 text-slate-500 dark:text-slate-400">
          حدث خطأ أثناء جلب البيانات من قاعدة البيانات. قد تكون المشكلة مؤقتة —
          حاول مرة أخرى، وإن استمرت فتواصل مع الدعم.
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
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-sarh-borderLight px-4 text-sm font-semibold text-sarh-navy transition-colors hover:border-sarh-teal hover:text-sarh-teal dark:border-sarh-borderDark dark:text-slate-100"
          >
            العودة إلى الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}
