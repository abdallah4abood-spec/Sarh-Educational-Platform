import { performance } from "node:perf_hooks";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadLiveTiers } from "@/lib/session-tiers";

/**
 * D5 session-tier measurement.
 *
 * Read-only: it never writes, and it prints no user ids, emails or secrets.
 *
 * It instruments the Prisma model delegates this module touches by wrapping
 * their methods on the shared client instance (the same object `loadLiveTiers`
 * imports), so the call count is the real number of Prisma round calls rather
 * than an estimate.
 *
 * Usage: `node --import tsx scripts/d5-session-bench.ts [iterations]`
 */

const ITERATIONS = Number(process.argv[2] ?? 200);
const WARMUP = 20;

type Counter = Record<string, number>;
const calls: Counter = {};

function instrument(model: string, method: string) {
  const delegate = (prisma as unknown as Record<string, Record<string, unknown>>)[
    model
  ];
  if (!delegate) return;
  const original = delegate[method];
  if (typeof original !== "function") return;

  delegate[method] = (...args: unknown[]) => {
    const key = `${model}.${method}`;
    calls[key] = (calls[key] ?? 0) + 1;
    return (original as (...a: unknown[]) => unknown).apply(delegate, args);
  };
}

for (const [model, methods] of [
  ["user", ["findUnique"]],
  ["staffMember", ["findFirst", "findMany"]],
  ["institution", ["findFirst"]],
] as const) {
  for (const method of methods) instrument(model, method);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[index];
}

async function measure(label: string, run: () => Promise<unknown>) {
  for (let i = 0; i < WARMUP; i += 1) await run();

  for (const key of Object.keys(calls)) delete calls[key];

  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i += 1) {
    const started = performance.now();
    await run();
    samples.push(performance.now() - started);
  }

  samples.sort((a, b) => a - b);
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const total = Object.values(calls).reduce((sum, value) => sum + value, 0);
  const perCall = Object.fromEntries(
    Object.entries(calls).map(([key, value]) => [key, +(value / ITERATIONS).toFixed(2)])
  );

  console.log(
    JSON.stringify(
      {
        label,
        iterations: ITERATIONS,
        prismaCallsPerInvocation: +(total / ITERATIONS).toFixed(2),
        breakdown: perCall,
        meanMs: +mean.toFixed(3),
        p50Ms: +percentile(samples, 50).toFixed(3),
        p95Ms: +percentile(samples, 95).toFixed(3),
      },
      null,
      2
    )
  );
}

async function main() {
  // Read-only probe: a real account that holds an ACTIVE teaching membership.
  const membership = await prisma.staffMember.findFirst({
    where: { status: "ACTIVE", role: "TEACHER" },
    select: { userId: true },
    orderBy: { joinedAt: "asc" },
  });
  if (!membership) throw new Error("no ACTIVE TEACHER membership in this database");

  const userId = membership.userId;

  await measure("loadLiveTiers (teacher account)", () => loadLiveTiers(userId));

  const jwt = authOptions.callbacks?.jwt;
  if (jwt) {
    const token = {
      sub: userId,
      id: userId,
      role: "PARENT",
      roles: ["PARENT"],
      activeRole: "PARENT",
    };
    await measure("callbacks.jwt (normal session read)", () =>
      Promise.resolve(jwt({ token, trigger: undefined, session: undefined } as never))
    );
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("benchmark failed:", error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
