/**
 * Fixture: exemption directives.
 *
 * A directive is only a directive inside a comment. The same text inside a
 * string literal is data. Scanned, never executed.
 */
import { prisma } from "@/lib/prisma";

export async function stringDirective(): Promise<unknown> {
  return prisma.user.count(); // "isolation-guard: allow" is data, not a directive
}

export async function commentDirective(): Promise<unknown> {
  // isolation-guard: allow — fixture: reviewed exception
  return prisma.user.count();
}
