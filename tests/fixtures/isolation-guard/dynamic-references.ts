/**
 * Fixture: destructuring defaults, dynamic computed access and value containers.
 *
 * A default only applies when the property is `undefined`, and a computed key
 * hides the operation name, so neither may silently turn an operation into an
 * ordinary value. Scanned by `test-isolation-guard.repo.test.ts`, never
 * executed.
 */
import { prisma } from "@/lib/prisma";

import { run } from "./fixtures-support";

const fallback = ((): never => {
  throw new Error("unused fallback");
}) as any;

export async function defaultDestructuredCount() {
  const { count = fallback } = prisma.student;
  return count();
}

export async function defaultDestructuredRenamed() {
  const { findFirst: first = fallback } = prisma.student;
  return first({ where: {} });
}

export async function defaultDestructuredRaw() {
  const { $executeRaw: raw = fallback } = prisma;
  return raw`DELETE FROM "Student"`;
}

export function defaultDestructuredUnrelated() {
  const source: { id?: string } = {};
  const { id = "unknown" } = source;
  return id;
}

export async function dynamicDelegateCall(method: string) {
  const fn = (prisma.student as any)[method];
  return fn();
}

export async function dynamicDelegateMultiHop(method: string) {
  const first = (prisma.student as any)[method];
  const second = first;
  return second({ where: {} });
}

export async function dynamicDelegateEscaped(method: string) {
  const fn = (prisma.student as any)[method];
  return run(fn);
}

export async function objectContainer() {
  const ops = { fn: prisma.student.count };
  return ops.fn();
}

export async function arrayContainer() {
  const ops = [prisma.student.findFirst];
  return ops[0]();
}

export async function callForm() {
  return prisma.student.findFirst.call(prisma.student, { where: {} });
}

export async function bindForm() {
  return prisma.student.findFirst.bind(prisma.student);
}

export async function inlineDynamicCall(method: string) {
  return (prisma.student as any)[method]();
}

export function inlineDynamicEscaped(method: string) {
  return run((prisma.student as any)[method]);
}
