/**
 * Fixture: receiver shape.
 *
 * An ordinary object that happens to have `count()` must not be reported as
 * Prisma access; a delegate-shaped unknown (`x.model.findMany()`) or a
 * Prisma-named binding must be. Scanned, never executed.
 */
import { metrics } from "./fixtures-support";

export function parameterCount(stats: { count(): number }): number {
  return stats.count();
}

export function arrayCount(rows: any): number {
  return rows.count();
}

export function importedCount(): number {
  return metrics.count();
}

export function localObjectCount(): number {
  const repo = { count: () => 0 };
  return repo.count();
}

export function delegateShapedUnknown(client: any): unknown {
  return client.student.findMany({});
}

export function namedLikelyClient(db: any): unknown {
  return db.findMany();
}
