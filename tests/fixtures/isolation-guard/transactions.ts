/**
 * Fixture: transaction-client scope.
 *
 * A `$transaction` callback parameter is a Prisma client only when the
 * receiver is a proven Prisma client; inside it, the same query-isolation
 * rules apply. Scanned by `test-isolation-guard.repo.test.ts`, never executed.
 */
import { prisma } from "@/lib/prisma";

declare const otherClient: any;
declare const unrelated: any;

export async function unscopedInCallback() {
  return prisma.$transaction(async (tx) => {
    return tx.student.findMany();
  });
}

export async function scopedInCallback() {
  return prisma.$transaction(async (tx) => {
    return tx.student.findMany({ where: { id: "s1" } });
  });
}

export async function aliasInCallback() {
  return prisma.$transaction(async (tx) => {
    const alias = tx;
    return alias.student.deleteMany();
  });
}

export async function arrayForm() {
  return prisma.$transaction([
    prisma.student.findMany(),
    prisma.student.count({ where: { id: "s1" } }),
  ]);
}

export async function arbitraryParameter(tx: any) {
  return tx.student.findMany();
}

export async function notAPrismaTransaction() {
  return otherClient.$transaction(async (tx: any) => {
    return tx.anything();
  });
}

export async function unrelatedCallbackParameter() {
  return unrelated(async (tx: any) => {
    return tx.student.findMany();
  });
}
