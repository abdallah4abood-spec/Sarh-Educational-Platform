/**
 * Fixture: conditional expressions holding operation references.
 *
 * A conditional keeps whatever provenance its branches agree on; when they do
 * not agree but one may hold an operation, a later call must be unsupported.
 * Scanned by `test-isolation-guard.repo.test.ts`, never executed.
 */
import { prisma } from "@/lib/prisma";

import { repository } from "./fixtures-support";

declare const flag: boolean;
declare const other: boolean;

export async function prismaOrEmpty() {
  const fn = prisma.student.count;
  const ops = flag ? [fn] : [];
  return ops[0]();
}

export async function sameOperation() {
  const ops = flag
    ? { run: prisma.student.findFirst }
    : { run: prisma.student.findFirst };
  return ops.run({ where: {} });
}

export async function differentOperations() {
  const ops: any = flag
    ? { run: prisma.student.findFirst }
    : { run: prisma.student.count };
  return ops.run();
}

export async function prismaOrUnrelated() {
  const ops: any[] = flag ? [prisma.student.findFirst] : [repository.findFirst];
  return ops[0]({ where: {} });
}

export async function nestedConditional() {
  const fn = prisma.student.count;
  const ops = flag ? (other ? [fn] : []) : [];
  return ops[0]();
}

export async function conditionalAlias() {
  const first = [prisma.student.count];
  const second: any[] = [];
  const ops = flag ? first : second;
  return ops[0]();
}

export async function conditionalEscaped() {
  const fn = prisma.student.count;
  return flag ? [fn] : [];
}

export async function conditionalReassigned() {
  let ops = flag ? [prisma.student.count] : [];
  ops = [];
  return ops[0]();
}

export function unrelatedConditional() {
  const ops = flag ? [repository.count] : [];
  return ops[0]();
}
