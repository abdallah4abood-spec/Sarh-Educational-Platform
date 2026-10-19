/**
 * SARH (صَرْح) — Center (Institution) display model + seed directory.
 *
 * The Prisma `Institution` model stores the canonical fields; everything else
 * shown in the Discovery Hub (fee, cover, verified mark, facilities, programs)
 * lives here so the UI renders identically whether the PostgreSQL database is
 * reachable or the app falls back to the offline seed (Agent.md: offline-first).
 *
 * This module is intentionally free of Node built-ins / Prisma so client
 * components may import its types safely.
 */

import type { StaticImageData } from "next/image";

import cover1 from "@/assets/covers/center-1.webp";
import cover2 from "@/assets/covers/center-2.webp";
import cover3 from "@/assets/covers/center-3.webp";
import cover4 from "@/assets/covers/center-4.webp";
import cover5 from "@/assets/covers/center-5.webp";
import cover6 from "@/assets/covers/center-6.webp";

/** WebP covers shipped with the bundle (offline-safe, blur placeholder ready). */
export const COVERS: StaticImageData[] = [
  cover1,
  cover2,
  cover3,
  cover4,
  cover5,
  cover6,
];

export type InstitutionType = "KINDERGARTEN" | "EDUCATIONAL_CENTER";
export type AgeTier = "kindergarten" | "center";

export interface CenterProgram {
  id: string;
  name: string;
  grades: string;
  fee: number;
}

export interface Center {
  id: string;
  name: string;
  type: InstitutionType;
  zone: string;
  address: string;
  description: string;
  rating: number;
  reviewsCount: number;
  verified: boolean;
  /** Monthly fee in shekels — the "price tag" of the directory card. */
  monthlyFee: number;
  cover: StaticImageData;
  gallery: StaticImageData[];
  phone: string;
  whatsapp: string;
  yearsOfExperience: number;
  studentsEnrolled: number;
  ownerName: string;
  facilities: string[];
  programs: CenterProgram[];
}

/** Gaza governorate zones used by the directory filter. */
export const ZONES = [
  "غزة",
  "خان يونس",
  "الرفاح",
  "دير البلح",
  "جباليا",
  "النصيرات",
] as const;

export const tierOf = (type: InstitutionType): AgeTier =>
  type === "KINDERGARTEN" ? "kindergarten" : "center";

export const ageRangeOf = (type: InstitutionType): string =>
  type === "KINDERGARTEN" ? "5–7 سنوات" : "8–18 سنة";

/** Deterministic cover selection so a center keeps the same art across routes. */
export function coverFor(seed: string | number): StaticImageData {
  const numeric =
    typeof seed === "number"
      ? seed
      : Array.from(seed).reduce((total, char) => total + char.charCodeAt(0), 0);
  return COVERS[Math.abs(numeric) % COVERS.length];
}

export const KG_FACILITIES = [
  "حديقة آمنة بملاعب",
  "غرفة أنشطة وفنون",
  "باص نقل مدرسي",
  "كاميرات مراقبة",
  "برنامج أنشطة يومي",
  "إسعافات أولية",
];

export const CENTER_FACILITIES = [
  "قاعات دراسية مجهزة",
  "مكتبة ومطالعة",
  "معمل علوم وحاسب",
  "إنترنت عالي السرعة",
  "نظام تكييف",
  "مشرفون تربويون",
];

const KG_PROGRAMS = (id: string, base: number): CenterProgram[] => [
  {
    id: `${id}-p1`,
    name: "روضة صباحية",
    grades: "5–6 سنوات",
    fee: base,
  },
  {
    id: `${id}-p2`,
    name: "برنامج متكامل (صباحي + مسائي)",
    grades: "5–7 سنوات",
    fee: base + 70,
  },
];

const CENTER_PROGRAMS = (id: string, base: number): CenterProgram[] => [
  {
    id: `${id}-p1`,
    name: "تحضير اختبار التوجيهي",
    grades: "الصف الثاني عشر",
    fee: base,
  },
  {
    id: `${id}-p2`,
    name: "دروس تقوية",
    grades: "الصفوف 9–11",
    fee: base - 90,
  },
];

/** Build the program list for a database row (ids stay unique per center). */
export function programsFor(center: Center): CenterProgram[] {
  return center.programs.length > 0
    ? center.programs
    : center.type === "KINDERGARTEN"
      ? KG_PROGRAMS(center.id, center.monthlyFee)
      : CENTER_PROGRAMS(center.id, center.monthlyFee);
}
