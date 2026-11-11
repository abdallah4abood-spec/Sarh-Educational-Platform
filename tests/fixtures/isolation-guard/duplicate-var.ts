/**
 * Fixture: repeated `var` declarations of one binding.
 *
 * `var` redeclarations are a single JavaScript binding, so every initializer
 * belongs to the same write set. Scanned, never executed.
 */
import { prisma } from "@/lib/prisma";

export async function firstThenNull(): Promise<unknown> {
  var db: any = prisma;
  var db: any = null;
  return db.student.findMany({});
}

export async function nullThenFirst(): Promise<unknown> {
  var client: any = null;
  var client: any = prisma;
  return client.student.findMany({});
}

export async function sameValue(): Promise<unknown> {
  var handle: any = prisma;
  var handle: any = prisma;
  return handle.student.findMany({});
}
