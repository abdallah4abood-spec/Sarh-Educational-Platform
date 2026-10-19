import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma Client for the SARH (صَرْح) platform.
 * Reused across hot reloads in development to avoid exhausting
 * PostgreSQL connection slots during query engine restarts.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
