import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading boundary for the whole portal area.
 *
 * Every portal page is a Server Component that now awaits PostgreSQL, so the
 * navigation between two of them is a real network gap rather than an instant
 * client transition. Before this file existed that gap rendered *nothing*: the
 * browser sat on the previous page until the new one was fully streamed, which
 * reads as a frozen app on a slow connection.
 *
 * A route-group `loading.tsx` wraps every descendant segment in one Suspense
 * boundary, so this single file covers /parent, /teacher, /supervisor,
 * /institution and /admin and all of their children. The skeleton deliberately
 * mirrors the shared shell's rhythm — header, four stat tiles, then a two-panel
 * body — so the layout does not jump when the real content replaces it.
 */
export default function PortalLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">جارٍ تحميل البيانات…</span>

      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-3 w-80" />
        </div>
        <Skeleton className="h-11 w-11 rounded-2xl" />
      </div>

      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="sarh-card space-y-3 p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      {/* Body: main column + side column, matching the overview layout */}
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="sarh-card space-y-4 p-5">
              <Skeleton className="h-4 w-40" />
              {Array.from({ length: 3 }).map((__, row) => (
                <Skeleton key={row} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ))}
        </div>
        <div className="space-y-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="sarh-card space-y-3 p-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
