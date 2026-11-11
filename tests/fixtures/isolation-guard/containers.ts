/**
 * Fixture: local object/array containers holding operation references.
 *
 * Every container here is a literal with statically known keys. Scanned by
 * `test-isolation-guard.repo.test.ts`, never executed.
 */
import { prisma } from "@/lib/prisma";

import { run } from "./fixtures-support";

export async function arrayAlias() {
  const fn = prisma.student.count;
  const ops = [fn];
  return ops[0]();
}

export async function objectAlias() {
  const fn = prisma.student.findFirst;
  const ops = { run: fn };
  return ops.run({ where: {} });
}

export async function shorthand() {
  const { count } = prisma.student;
  const ops = { count };
  return ops.count();
}

export async function multiple() {
  const ops = { first: prisma.student.findFirst, total: prisma.student.count };
  return [await ops.first({ where: {} }), await ops.total()];
}

export async function rawInContainer() {
  const raw = prisma.$executeRaw;
  const ops = [raw];
  return ops[0]`DELETE FROM "Student"`;
}

export async function scopedThroughContainer() {
  const fn = prisma.student.findUnique;
  const ops = { fn };
  return ops.fn({ where: { id: "s1" } });
}

export async function mutatedContainer() {
  const ops = [prisma.student.count];
  ops[0] = (() => 0) as any;
  return ops[0]();
}

export async function dynamicIndex(key: number) {
  const ops = [prisma.student.count];
  return ops[key]();
}

export async function constKeyIndex() {
  const ops = [prisma.student.count];
  const index = 0;
  return ops[index]();
}

export async function escapedContainer() {
  const fn = prisma.student.count;
  const ops = [fn];
  return run(ops);
}

export async function nestedContainer() {
  const fn = prisma.student.count;
  const ops = { inner: { run: fn } };
  return ops.inner.run();
}

export async function containerAlias() {
  const fn = prisma.student.count;
  const ops = [fn];
  const more = ops;
  return more[0]();
}

export function unrelatedContainer() {
  const repo = { count: () => 0 };
  const ops = [repo.count];
  return ops[0]();
}
