/**
 * Fixture: statically provable computed keys.
 *
 * A key is resolved only when its whole binding history is one literal value;
 * anything mutable, reassigned or genuinely dynamic stays unsupported.
 * Scanned by `test-isolation-guard.repo.test.ts`, never executed.
 */
import { prisma } from "@/lib/prisma";

import { repository } from "./fixtures-support";

export async function constKey() {
  const key = "count";
  return prisma.student[key]();
}

export async function constKeyAlias() {
  const key = "findFirst";
  const method = key;
  return prisma.student[method]({ where: {} });
}

export async function asConstKey() {
  const key = "count" as const;
  return prisma.student[key]();
}

export async function parenthesisedKey() {
  const key = ("count");
  return prisma.student[key]();
}

export async function shadowedKey() {
  const key = "count";
  {
    const key = "findFirst";
    return prisma.student[key]({ where: {} });
  }
}

export async function reassignedKey() {
  let key = "count";
  key = "findFirst";
  return (prisma.student as any)[key]();
}

export async function dynamicKey(key: string) {
  return (prisma.student as any)[key]();
}

export function unrelatedDynamic(key: string) {
  return (repository as any)[key]();
}

export async function numericIndex() {
  const ops = [prisma.student.count];
  const index = 0;
  return ops[index]();
}
