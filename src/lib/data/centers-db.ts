/**
 * Server-only data access for the Discovery Hub (Design.md Prompt 1).
 *
 * Prisma is the only source: the directory pages read `Institution` rows and
 * map them onto the richer display model the UI was written against. There is
 * no bundled fallback — a directory that invents centres is worse than one
 * that reports it cannot load.
 */

import net from "node:net";

import type { Institution } from "@prisma/client";

import {
  CENTER_FACILITIES,
  KG_FACILITIES,
  coverFor,
  type Center,
} from "@/lib/data/centers";
import { prisma } from "@/lib/prisma";

type InstitutionRow = Institution & {
  _count: { students: number };
};

const INCLUDE_COUNT = {
  _count: { select: { students: true } },
} as const;

/** Milliseconds allowed for the database probe before reporting unreachable. */
const PROBE_TIMEOUT = 700;

function databaseTarget(): { host: string; port: number } {
  const raw = process.env.DATABASE_URL ?? "";
  try {
    const url = new URL(raw);
    return {
      host: url.hostname || "127.0.0.1",
      port: url.port ? Number(url.port) : 5432,
    };
  } catch {
    return { host: "127.0.0.1", port: 5432 };
  }
}

/**
 * Resolves `true` only when something is actually listening on the DB port.
 * Used by callers that need a fast, non-throwing readiness check (for example
 * the platform-settings loader) without opening a Prisma query.
 */
export function isDatabaseReachable(
  timeoutMs: number = PROBE_TIMEOUT
): Promise<boolean> {
  const { host, port } = databaseTarget();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (reachable: boolean) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve(reachable);
    };

    const socket = net.connect({ host, port });
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

/**
 * A centre's programmes are derived from its row (type + a fee baseline)
 * rather than stored, because the fee ladder is a platform rule the directory
 * presents — the authoritative money is `Enrollment.commissionFee`.
 */
function programsForType(
  id: string,
  type: Institution["type"],
  fee: number
) {
  return type === "KINDERGARTEN"
    ? [
        { id: `${id}-p1`, name: "روضة صباحية", grades: "5–6 سنوات", fee },
        {
          id: `${id}-p2`,
          name: "برنامج متكامل (صباحي + مسائي)",
          grades: "5–7 سنوات",
          fee: fee + 70,
        },
      ]
    : [
        {
          id: `${id}-p1`,
          name: "تحضير اختبار التوجيهي",
          grades: "الصف الثاني عشر",
          fee,
        },
        { id: `${id}-p2`, name: "دروس تقوية", grades: "الصفوف 9–11", fee: fee - 90 },
      ];
}

/** Map a Prisma row onto the richer display model the UI expects. */
function toCenter(row: InstitutionRow, index: number): Center {
  const isKindergarten = row.type === "KINDERGARTEN";
  const monthlyFee = isKindergarten ? 320 : 550;
  const cover = coverFor(row.id);

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    zone: row.zone,
    address: row.address,
    description:
      row.description ??
      (isKindergarten
        ? "روضة طفولة مبكرة بفصول صغيرة وأنشطة يومية مصممة لأعمار 5–7 سنوات."
        : "مركز تحضير وتقوية لمراحل 8–18 سنة مع مجموعات صغيرة ومتابعة مستمرة لأولياء الأمور."),
    rating: row.rating,
    // No fabricated review platform yet: count real enrollments so the number
    // on the card is always something the database can defend.
    reviewsCount: row._count.students,
    verified: row.trustStatus === "VERIFIED",
    monthlyFee,
    cover,
    gallery: [cover, coverFor(index + 2), coverFor(index + 4)],
    phone: row.phone ?? "—",
    whatsapp: (row.phone ?? "").split("").filter((ch) => ch >= "0" && ch <= "9").join("") || "—",
    yearsOfExperience: Math.max(1, new Date().getFullYear() - 2018),
    studentsEnrolled: row._count.students,
    ownerName: "إدارة المركز",
    facilities: isKindergarten ? KG_FACILITIES : CENTER_FACILITIES,
    programs: programsForType(row.id, row.type, monthlyFee),
  };
}

/** Directory listing for the Explore hub — PostgreSQL, nothing else. */
export async function getCenters(): Promise<Center[]> {
  const rows = await prisma.institution.findMany({
    take: 24,
    orderBy: { rating: "desc" },
    include: INCLUDE_COUNT,
  });

  return rows.map((row, index) => toCenter(row, index));
}

/** Single center for the profile page — `null` means "not found" (404). */
export async function getCenter(id: string): Promise<Center | null> {
  const row = await prisma.institution.findUnique({
    where: { id },
    include: INCLUDE_COUNT,
  });

  return row ? toCenter(row, 0) : null;
}
