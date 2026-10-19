import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

/** Shimmering placeholder used while directory data is loading. */
export function Skeleton({ className }: SkeletonProps) {
  return <span className={cn("skeleton block", className)} aria-hidden="true" />;
}

/** Grid of card-shaped skeletons for the discovery hub. */
export function CardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="sarh-card overflow-hidden">
          <Skeleton className="h-40 w-full rounded-none" />
          <div className="space-y-3 p-5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="mt-4 h-9 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
