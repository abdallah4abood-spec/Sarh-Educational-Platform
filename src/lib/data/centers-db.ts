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
  COVERS,
  KG_FACILITIES,
  coverFor,
  type Center,
} from "@/lib/data/centers";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import type { DirectoryKind, DirectoryListing } from "@/lib/data/directory";
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

/* ==================================================================== */
/* Directory listings (the /explore cards)                              */
/* ==================================================================== */

/**
 * Zone → governorate label.
 *
 * `Institution.zone` is free text typed by the institution ("غزة", "خان يونس"…),
 * while the directory filter compares a `DictionaryKey`. This map is the only
 * place that translation happens; an unknown zone falls back to the generic
 * `city_other` label instead of silently being shown as "Gaza".
 */
const ZONE_LABEL_KEYS: Record<string, DictionaryKey> = {
  "غزة": "city_gaza",
  "مدينة غزة": "city_gaza",
  "خان يونس": "city_khanYounis",
  "دير البلح": "city_deirAlBalah",
  "رفح": "city_rafah",
  "جباليا": "city_jabalia",
  "جباليا Camp": "city_jabalia",
  "شمال غزة": "city_jabalia",
  "بيت لاهيا": "city_jabalia",
  "بيت حانون": "city_jabalia",
};

function cityKeyFor(zone: string): DictionaryKey {
  return ZONE_LABEL_KEYS[zone.trim()] ?? "city_other";
}

/**
 * Directory taxonomy per institution type.
 *
 * The schema stores one discriminator (`InstitutionType`), so the card badge
 * and the sidebar category are derived from it rather than invented per row.
 */
const DIRECTORY_CATEGORY: Record<Institution["type"], string> = {
  KINDERGARTEN: "private_kindergartens",
  EDUCATIONAL_CENTER: "learning_centers",
};

const DIRECTORY_STAGES: Record<Institution["type"], DictionaryKey[]> = {
  KINDERGARTEN: ["dir_stage_5_6"],
  EDUCATIONAL_CENTER: ["dir_stage_general"],
};

/**
 * Map an `Institution` row onto the card model.
 *
 * `id` is the row's primary key on purpose: the cards link to `/center/{id}`,
 * and that route looks the profile up by the same key. The old bundled
 * catalogue used invented `dir-center-*` slugs, so every "التفاصيل" click ended
 * on a 404.
 *
 * `name.en` repeats the Arabic name because the schema stores one name only; an
 * empty English slot would render blank labels after the language toggle.
 */
function toListing(
  row: InstitutionRow,
  kind: DirectoryKind,
  index: number
): DirectoryListing {
  const isKindergarten = row.type === "KINDERGARTEN";
  const programs = programsForType(row.id, row.type, isKindergarten ? 320 : 550);
  const fees = programs.map((program) => program.fee);
  const digits = (row.phone ?? "").replace(/\D+/g, "");

  return {
    id: row.id,
    kind,
    name: { ar: row.name, en: row.name },
    category: DIRECTORY_CATEGORY[row.type],
    cityKey: cityKeyFor(row.zone),
    rating: row.rating,
    // Real enrolment count — there is no review table yet, so nothing here is
    // invented (see the card: the number is not labelled as reviews).
    reviewsCount: row._count.students,
    priceMin: Math.min(...fees),
    priceMax: Math.max(...fees),
    stageKeys: DIRECTORY_STAGES[row.type],
    coverIndex: index % COVERS.length,
    phone: row.phone ?? "",
    whatsapp: digits,
  };
}

/**
 * The one rule for a public listing: the centre has passed manual verification.
 *
 * The product tells visitors “لا يظهر مركز في الدليل إلا بعد التحقق من بياناته”
 * and “مراكز موثقة فقط”, and `PENDING` / `UNVERIFIED` / `REJECTED` rows are
 * either still being reviewed or were turned down. They stay visible to their
 * owner in `/institution/profile` and to admins in `/admin/trust`, never in the
 * public directory, the public profile page or the sitemap.
 */
export const PUBLICLY_LISTED_INSTITUTION = { trustStatus: "VERIFIED" } as const;

/**
 * Cards for one directory route.
 *
 * Only institutions of the requested type are returned, and only real rows:
 * the two directories are views of the same table the profile page reads, so a
 * card can never point at an id that does not exist.
 */
export async function getDirectoryListings(
  kind: DirectoryKind
): Promise<DirectoryListing[]> {
  const rows = await prisma.institution.findMany({
    where: {
      ...PUBLICLY_LISTED_INSTITUTION,
      type: kind === "kindergartens" ? "KINDERGARTEN" : "EDUCATIONAL_CENTER",
    },
    orderBy: { rating: "desc" },
    include: INCLUDE_COUNT,
  });

  return rows.map((row, index) => toListing(row, kind, index));
}

/**
 * Single center for the public profile page — `null` means "not found" (404).
 *
 * Same eligibility rule as the directory: an unverified, pending or rejected
 * institution must not be presented publicly as a real centre (the QA fixture
 * `mverify-inst` is exactly such a row). Its owner still sees it in the
 * institution portal, and admins see it in the trust queue.
 */
export async function getCenter(id: string): Promise<Center | null> {
  const row = await prisma.institution.findFirst({
    where: { id, ...PUBLICLY_LISTED_INSTITUTION },
    include: INCLUDE_COUNT,
  });

  return row ? toCenter(row, 0) : null;
}
