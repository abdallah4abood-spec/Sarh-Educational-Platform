/**
 * Fixture: raw SQL.
 *
 * A WHERE token alone is not restriction (`WHERE 1=1`), constant SQL is
 * analysable, runtime-composed SQL is not, and the connection warm-up stays
 * accepted. Scanned, never executed.
 */
import { prisma } from "@/lib/prisma";

export async function tautology(): Promise<unknown> {
  return prisma.$executeRaw`DELETE FROM "Student" WHERE 1=1`;
}

export async function scoped(): Promise<unknown> {
  return prisma.$executeRaw`DELETE FROM "Student" WHERE "id" = 'x'`;
}

export async function warmup(): Promise<unknown> {
  return prisma.$queryRaw`SELECT 1 AS warm`;
}

export async function dynamic(sql: string): Promise<unknown> {
  return prisma.$executeRaw(sql as unknown as TemplateStringsArray);
}
