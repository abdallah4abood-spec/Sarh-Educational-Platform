/**
 * Fixture: parameter scope, destructuring patterns and namespace imports.
 *
 * Every function below is a binding form the guard must resolve lexically.
 * Scanned by `test-isolation-guard.repo.test.ts`, never executed.
 */
import { prisma } from "@/lib/prisma";
import * as prismaModule from "@/lib/prisma";

export function defaultParameter(prisma: any, x = prisma.student.findMany({})) {
  return x;
}

export function destructured({ prisma }: { prisma: any }) {
  return prisma.student.findMany({});
}

export function renamed({ prisma: client }: { prisma: any }) {
  return client.student.findMany({});
}

export function nested({ db: { prisma } }: { db: { prisma: any } }) {
  return prisma.student.findMany({});
}

export function arrayParam([prisma]: any[]) {
  return prisma.student.findMany({});
}

export async function namespaceMember(): Promise<unknown> {
  return prismaModule.prisma.student.findMany({});
}

export async function namespaceDefault(): Promise<unknown> {
  return prismaModule.default.student.findMany({});
}

export function localPrisma(): unknown {
  const prisma = { student: { findMany: (_args?: unknown) => [] } };
  return prisma.student.findMany({});
}

export function usesClient(): unknown {
  const db = prisma;
  return db.student.findMany({});
}

export function usesObject(): unknown {
  const db = { student: { findMany: (_args?: unknown) => [] } };
  return db.student.findMany({});
}
