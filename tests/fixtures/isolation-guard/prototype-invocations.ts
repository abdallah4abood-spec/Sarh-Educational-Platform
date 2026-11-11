/**
 * Fixture: `Function.prototype.call`/`apply` on extracted Prisma operations.
 *
 * A stored operation reference can be invoked without calling it directly, so
 * `.call`/`.apply` must be judged with the original operation and the supplied
 * `thisArg` must never be treated as proof of Prisma provenance. Every case
 * here is scanned by `test-isolation-guard.repo.test.ts`, never executed.
 */
import { prisma } from "@/lib/prisma";

/** Stands in for any argument array built at runtime. */
declare const buildArgs: () => any;

/* ── `.call` ─────────────────────────────────────────────────────────── */

export async function callScoped() {
  const fn = prisma.student.findFirst;
  return fn.call(prisma.student, { where: { id: "p4-s1" } });
}

export async function callEmptyWhere() {
  const fn = prisma.student.findFirst;
  return fn.call(prisma.student, { where: {} });
}

export async function callWithoutArguments() {
  const fn = prisma.student.count;
  return fn.call(prisma.student);
}

export async function callThroughAlias() {
  const first = prisma.student.findFirst;
  const second = first;
  return second.call(prisma.student, { where: {} });
}

export async function callThroughContainer() {
  const ops = { run: prisma.student.count };
  return ops.run.call(prisma.student);
}

export async function callThroughArray() {
  const ops = [prisma.student.findFirst];
  return ops[0].call(prisma.student, { where: {} });
}

export async function callOptional() {
  const fn = prisma.student.count;
  return fn.call?.(prisma.student);
}

export async function callWithSpread() {
  const fn = prisma.student.findFirst;
  const args: object[] = [{ where: {} }];
  return fn.call(prisma.student, ...args);
}

export async function callWriteWithoutWhere() {
  const fn = prisma.student.update;
  // @ts-expect-error — an update payload without `where` is exactly the bug.
  return fn.call(prisma.student, { data: { fullName: "Updated" } });
}

/* ── `.apply` ────────────────────────────────────────────────────────── */

export async function applyScoped() {
  const fn = prisma.student.findFirst;
  return fn.apply(prisma.student, [{ where: { id: "p4-s1" } }]);
}

export async function applyEmptyArray() {
  const fn = prisma.student.findFirst;
  return fn.apply(prisma.student, []);
}

export async function applyWithoutArray() {
  const fn = prisma.student.findFirst;
  return fn.apply(prisma.student);
}

export async function applyThroughArrayAlias() {
  const args: object[] = [{ where: { id: "p4-s1" } }];
  const more = args as any;
  const fn = prisma.student.findFirst;
  return fn.apply(prisma.student, more);
}

export async function applyWithDynamicArray() {
  const fn = prisma.student.findFirst;
  return fn.apply(prisma.student, buildArgs());
}

export async function applyWriteWithoutWhere() {
  const fn = prisma.student.update;
  // @ts-expect-error — an update payload without `where` is exactly the bug.
  return fn.apply(prisma.student, [{ data: { fullName: "Updated" } }]);
}

export async function applyRawDelete() {
  const fn = prisma.$executeRaw;
  // @ts-expect-error — a plain string is not the tagged-template form.
  return fn.apply(prisma, [`DELETE FROM "Student"`]);
}

/* ── controls: ordinary receivers stay untouched ─────────────────────── */

export function ordinaryCall(repository: { findFirst: (this: unknown, a: object) => unknown }) {
  return repository.findFirst.call(repository, {});
}

export function ordinaryApply(stats: { count: (this: unknown) => number }) {
  return stats.count.apply(stats, []);
}

export function unrelatedFunction() {
  const add = (a: number) => a + 1;
  return add.call(null, 1);
}

/* ── syntax variants of the same invocation ──────────────────────────── */

export async function bracketCall() {
  const fn = prisma.student.findFirst;
  return fn["call"](prisma.student, { where: {} });
}

export async function bracketApply() {
  const fn = prisma.student.findFirst;
  return fn["apply"](prisma.student, [{ where: {} }]);
}

export async function parenthesisedCall() {
  const fn = prisma.student.findFirst;
  return (fn.call)(prisma.student, { where: {} });
}

export async function commaSelectedCall() {
  const fn = prisma.student.findFirst;
  // @ts-expect-error — comma selection loses the `this` type, not the call.
  return (0, fn.call)(prisma.student, { where: {} });
}

export function storedCallMethod() {
  const fn = prisma.student.findFirst;
  return fn.call;
}

export function storedBracketMethod() {
  const fn = prisma.student.findFirst;
  return fn["apply"];
}
