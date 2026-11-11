/**
 * Fixture: `undefined` filter values (audit finding H1).
 *
 * Prisma omits `undefined` filter values, so such a predicate restricts
 * nothing. Scanned by `test-isolation-guard.repo.test.ts`, never executed.
 */
import { prisma } from "@/lib/prisma";

export async function literalUndefined(): Promise<unknown> {
  return prisma.student.deleteMany({ where: { id: undefined } });
}

export async function operatorUndefined(): Promise<unknown> {
  return prisma.student.deleteMany({ where: { id: { equals: undefined } } });
}

export async function inUndefined(): Promise<unknown> {
  return prisma.student.deleteMany({ where: { id: { in: undefined } } });
}

export async function shorthandLookup(rows: { id: string }[]): Promise<unknown> {
  const id = rows.find((row) => row.id !== "")?.id;
  return prisma.student.deleteMany({ where: { id } });
}

export async function elementLookup(ids: string[]): Promise<unknown> {
  return prisma.student.deleteMany({ where: { id: ids[0] } });
}

export async function undefinedInOr(): Promise<unknown> {
  return prisma.student.deleteMany({ where: { OR: [{ id: undefined }] } });
}

export async function undefinedInAnd(): Promise<unknown> {
  return prisma.student.deleteMany({ where: { AND: [{ id: undefined }] } });
}

export async function undefinedInNot(): Promise<unknown> {
  return prisma.student.deleteMany({ where: { NOT: [{ id: undefined }] } });
}

export async function definedSibling(): Promise<unknown> {
  return prisma.student.findMany({ where: { id: undefined, fullName: "student" } });
}

export async function maybeSibling(rows: { id: string }[]): Promise<unknown> {
  const id = rows.find((row) => row.id !== "")?.id;
  return prisma.student.findMany({ where: { id, fullName: "student" } });
}

export async function definedValue(): Promise<unknown> {
  return prisma.student.findMany({ where: { id: "student-1" } });
}
