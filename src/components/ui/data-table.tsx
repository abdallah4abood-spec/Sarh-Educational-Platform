import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  loading?: boolean;
  emptyMessage?: string;
  /** Number of shimmer rows shown while `loading`. */
  skeletonRows?: number;
}

const ALIGN: Record<"start" | "center" | "end", string> = {
  start: "text-start",
  center: "text-center",
  end: "text-end",
};

/**
 * Generic data table used by the enrollment, commission and finance
 * workspaces. RTL inherits from <html dir>, so `text-start`/`text-end`
 * flip automatically.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyMessage = "لا توجد بيانات لعرضها",
  skeletonRows = 4,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="sarh-card overflow-hidden">
        <div className="space-y-3 p-5">
          {Array.from({ length: skeletonRows }).map((_, index) => (
            <span key={index} className="skeleton block h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="sarh-card flex flex-col items-center gap-2 p-10 text-center">
        <p className="font-semibold text-sarh-navy dark:text-white">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="sarh-card overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-sarh-borderLight bg-sarh-teal/5 dark:border-sarh-borderDark">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "whitespace-nowrap px-4 py-3 font-bold text-sarh-navy dark:text-slate-200",
                  ALIGN[column.align ?? "start"],
                  column.className
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              className={cn(
                "border-b border-sarh-borderLight transition-colors last:border-0",
                "hover:bg-sarh-teal/5 dark:border-sarh-borderDark",
                index % 2 === 1 && "bg-sarh-bgLight/60 dark:bg-white/[0.03]"
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-4 py-3 align-middle text-slate-700 dark:text-slate-300",
                    ALIGN[column.align ?? "start"],
                    column.className
                  )}
                >
                  {column.cell(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
