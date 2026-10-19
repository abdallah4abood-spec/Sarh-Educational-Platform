import { cn } from "@/lib/utils";

/**
 * Platform activity chart (overview dashboards).
 *
 * Draws the seven-day series as a plain inline SVG — no charting dependency —
 * because the whole dashboard must render on the server without a client
 * bundle, and because Lenis' smooth scroll and this chart should not compete
 * for the main thread.
 *
 * Reading direction: the English convention puts the oldest value on the left;
 * this is an Arabic (RTL) interface, so the series is mirrored — index 0 sits
 * at the *right* edge and time flows to the left, matching the axis labels
 * underneath. That mirroring is done in the geometry, not with CSS, so the
 * shape and the labels can never drift apart.
 */

interface ActivityChartProps {
  points: { day: string; value: number }[];
  className?: string;
  /** Accessible summary; defaults to a description of the series. */
  label?: string;
}

/** Rounds the axis top up to the next 50 so gridlines stay round numbers. */
function niceMax(values: number[]): number {
  const max = Math.max(...values, 1);
  return Math.ceil(max / 50) * 50;
}

export function ActivityChart({ points, className, label }: ActivityChartProps) {
  if (points.length === 0) return null;

  const width = 420;
  const height = 160;
  const padX = 12;
  const padY = 14;

  const top = niceMax(points.map((point) => point.value));
  const innerWidth = width - padX * 2;
  const innerHeight = height - padY * 2;

  // x is mirrored: the first point lands at the right edge.
  const step = points.length > 1 ? innerWidth / (points.length - 1) : 0;
  const coords = points.map((point, index) => ({
    x: width - padX - index * step,
    y: padY + innerHeight - (point.value / top) * innerHeight,
  }));

  const line = coords
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
    .join(" ");
  const area = `${line} L${coords[coords.length - 1].x} ${padY + innerHeight} L${coords[0].x} ${
    padY + innerHeight
  } Z`;

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(top * ratio));

  return (
    <figure className={cn("w-full", className)}>
      <div className="flex items-stretch gap-2">
        <div className="min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={
              label ??
              `نشاط المنصة خلال آخر ${points.length} أيام، من ${points[points.length - 1].value} إلى ${points[0].value}`
            }
            className="h-40 w-full overflow-visible"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="sarh-activity" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00A99D" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#00A99D" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {gridValues.map((value) => {
              const y = padY + innerHeight - (value / top) * innerHeight;
              return (
                <line
                  key={value}
                  x1={0}
                  x2={width}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth={1}
                  strokeDasharray={value === 0 ? undefined : "3 5"}
                  className="text-sarh-borderLight dark:text-sarh-borderDark"
                />
              );
            })}

            <path d={area} fill="url(#sarh-activity)" />
            <path
              d={line}
              fill="none"
              stroke="#00A99D"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {coords.map((point, index) => (
              <circle
                key={points[index].day}
                cx={point.x}
                cy={point.y}
                r={3.5}
                fill="#ffffff"
                stroke="#00A99D"
                strokeWidth={2}
              />
            ))}
          </svg>
        </div>

        {/* Axis scale — rendered on the inline-end of the RTL row (the left). */}
        <div
          className="flex flex-col justify-between py-3 text-[10px] font-semibold tabular-nums text-slate-400 dark:text-slate-500"
          dir="ltr"
          aria-hidden="true"
        >
          {[...gridValues].reverse().map((value) => (
            <span key={value}>{value}</span>
          ))}
        </div>
      </div>

      <figcaption className="mt-1 flex justify-between text-[10px] font-semibold text-slate-400 dark:text-slate-500">
        {points.map((point) => (
          <span key={point.day}>{point.day}</span>
        ))}
      </figcaption>
    </figure>
  );
}
