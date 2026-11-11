import { CardSkeletonGrid, Skeleton } from "@/components/ui/skeleton";

/**
 * Loading boundary for the two directories.
 *
 * The directories are database-backed, so this is the first paint a visitor
 * sees on a cold navigation from a search result. It renders the same
 * hero-then-grid rhythm as the directory so the real content does not shift the
 * page when it arrives.
 *
 * It lives at `/explore` rather than at the `(public)` group root on purpose.
 * A `loading.tsx` wraps the page in a Suspense boundary, and a boundary that is
 * already streaming when `notFound()` is thrown commits the response as 200 —
 * so an unknown center URL answered 200 with a 404-looking body instead of a
 * real 404. The center profile therefore has no loading boundary and resolves
 * (or 404s) before the shell is flushed.
 */
export default function PublicLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-12 sm:px-6">
      <span className="sr-only">جارٍ تحميل المحتوى…</span>

      <div className="space-y-4">
        <Skeleton className="h-4 w-40 rounded-full" />
        <Skeleton className="h-10 w-2/3 max-w-xl" />
        <Skeleton className="h-3 w-full max-w-lg" />
        <Skeleton className="h-3 w-3/4 max-w-md" />
        <Skeleton className="mt-2 h-12 w-full max-w-xl rounded-xl" />
      </div>

      <CardSkeletonGrid count={6} />
    </div>
  );
}
