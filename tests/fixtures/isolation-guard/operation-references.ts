/**
 * Fixture: extracted operation references.
 *
 * An operation detached from its Prisma delegate must not become invisible: a
 * call through the alias is judged by the same rules as a direct call, and a
 * reference that escapes as a value is reported as unresolved. Scanned by
 * `test-isolation-guard.repo.test.ts`, never executed.
 */
import { prisma } from "@/lib/prisma";

import { run } from "./fixtures-support";

export async function detachedNoArguments() {
  const fn = prisma.student.findFirst;
  return fn();
}

export async function destructuredEmptyWhere() {
  const { findFirst } = prisma.student;
  return findFirst({ where: {} });
}

export async function renamedDestructured() {
  const { count: tally } = prisma.student;
  return tally({ where: {} });
}

export async function multiHopAlias() {
  const first = prisma.student.groupBy;
  const second = first;
  return second({ by: ["id"] });
}

export async function bracketExtracted() {
  const fn = prisma.student["aggregate"];
  return fn({ where: {} });
}

export async function scopedThroughAlias() {
  const fn = prisma.student.findUnique;
  return fn({ where: { id: "s1" } });
}

export async function passedAsValue() {
  return run(prisma.student.findUniqueOrThrow);
}

export function returnedReference() {
  return prisma.student.count;
}

export async function escapedAlias() {
  const fn = prisma.student.deleteMany;
  return run(fn);
}

export async function reassignedAlias() {
  let fn: any = prisma.student.updateMany;
  fn = () => null;
  return fn({ where: {} });
}

export async function rawExtracted() {
  const raw = prisma.$executeRaw;
  return raw`DELETE FROM "Student"`;
}
