import type { Prisma } from "@prisma/client";

/**
 * Take a transaction-scoped PostgreSQL advisory lock before the read that must
 * not race.
 *
 * `hashtext` maps the key to an int4 that `pg_advisory_xact_lock(bigint)`
 * accepts. The lock is released automatically when the transaction commits or
 * rolls back, so a crashed request cannot leave a stuck lock behind. A hash
 * collision can only over-serialise two unrelated keys; it can never let a
 * duplicate through, because the caller still re-reads the row under the lock.
 *
 * Shared by student intake (identity/retry locks) and join-code redemption.
 */
export async function acquireAdvisoryLock(
  tx: Prisma.TransactionClient,
  key: string
): Promise<void> {
  // The outer SELECT keeps Prisma from having to deserialise the function's
  // `void` result column.
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS advisory_lock`;
}
