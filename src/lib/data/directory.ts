/**
 * SARH — Discovery directory data model for the two separated public routes:
 * `/explore/centers` (learning centers & schools) and `/explore/kindergartens`.
 *
 * The two entities are deliberately modelled as one shape (`DirectoryListing`)
 * with a `kind` discriminator, because the *layout* of a directory page is the
 * same for both; only the copy, the category taxonomy, the stage vocabulary and
 * the hero illustration differ. Splitting them into two entirely separate
 * component trees would have duplicated the filter/sort/paginate logic twice.
 *
 * Everything a user reads here goes through a `DictionaryKey` rather than a raw
 * string, so flipping the language toggle re-renders names, cities, badges and
 * stage tags — not just the surrounding chrome. Institution names carry both
 * languages inline because a proper noun cannot live in a flat dictionary.
 *
 * The module stays free of Prisma and next/image imports so both Server and
 * Client Components can import it without pulling either into the other bundle.
 */

import type { DictionaryKey } from "@/lib/i18n/dictionary";

export type DirectoryKind = "centers" | "kindergartens";

/** Lucide icon token — resolved to a component in the sidebar (client side). */
export type CategoryIcon =
  | "school"
  | "book"
  | "users"
  | "languages"
  | "cog"
  | "palette"
  | "laptop"
  | "home"
  | "landmark"
  | "blocks"
  | "star";

export interface DirectoryCategory {
  /** Identifier stored on each listing's `category` field. */
  id: string;
  /** Full label used by the sidebar and the type dropdown. */
  labelKey: DictionaryKey;
  /** Short label painted on the card cover (e.g. "مركز تعليمي", "خاصة"). */
  badgeKey: DictionaryKey;
  /**
   * Platform-wide total for the category chip. It is the catalogue figure the
   * sidebar advertises, not the number of rows bundled with the demo build.
   */
  count: number;
  icon: CategoryIcon;
}

export interface DirectoryListing {
  id: string;
  kind: DirectoryKind;
  /** Institutions are proper nouns, so both labels travel with the row. */
  name: { ar: string; en: string };
  /** `DirectoryCategory.id` */
  category: string;
  cityKey: DictionaryKey;
  rating: number;
  reviewsCount: number;
  /** Monthly fee band in shekels — the card shows "من {min} – {max} شيكل شهرياً". */
  priceMin: number;
  priceMax: number;
  /** Stage / age chips shown under the title. */
  stageKeys: DictionaryKey[];
  /** Index into the bundled cover set (0–5) so a listing keeps its photo. */
  coverIndex: number;
  phone: string;
  whatsapp: string;
}

/* ------------------------------------------------------------------ */
/* Category taxonomy                                                  */
/* ------------------------------------------------------------------ */

export const CENTER_CATEGORIES: DirectoryCategory[] = [
  {
    id: "private_schools",
    labelKey: "cat_private_schools",
    badgeKey: "cat_badge_private_school",
    count: 124,
    icon: "school",
  },
  {
    id: "learning_centers",
    labelKey: "cat_learning_centers",
    badgeKey: "cat_badge_learning_center",
    count: 98,
    icon: "book",
  },
  {
    id: "support_centers",
    labelKey: "cat_support_centers",
    badgeKey: "cat_badge_support_center",
    count: 67,
    icon: "users",
  },
  {
    id: "language_centers",
    labelKey: "cat_language_centers",
    badgeKey: "cat_badge_language_center",
    count: 54,
    icon: "languages",
  },
  {
    id: "skills_centers",
    labelKey: "cat_skills_centers",
    badgeKey: "cat_badge_skills_center",
    count: 32,
    icon: "cog",
  },
  {
    id: "creative_centers",
    labelKey: "cat_creative_centers",
    badgeKey: "cat_badge_creative_center",
    count: 28,
    icon: "palette",
  },
  {
    id: "tech_centers",
    labelKey: "cat_tech_centers",
    badgeKey: "cat_badge_tech_center",
    count: 19,
    icon: "laptop",
  },
];

export const KINDERGARTEN_CATEGORIES: DirectoryCategory[] = [
  {
    id: "gov_kindergartens",
    labelKey: "cat_gov_kindergartens",
    badgeKey: "cat_badge_gov",
    count: 41,
    icon: "school",
  },
  {
    id: "private_kindergartens",
    labelKey: "cat_private_kindergartens",
    badgeKey: "cat_badge_private",
    count: 128,
    icon: "home",
  },
  {
    id: "islamic_kindergartens",
    labelKey: "cat_islamic_kindergartens",
    badgeKey: "cat_badge_islamic",
    count: 36,
    icon: "landmark",
  },
  {
    id: "language_kindergartens",
    labelKey: "cat_language_kindergartens",
    badgeKey: "cat_badge_language_kg",
    count: 29,
    icon: "languages",
  },
  {
    id: "mixed_kindergartens",
    labelKey: "cat_mixed_kindergartens",
    badgeKey: "cat_badge_mixed",
    count: 87,
    icon: "blocks",
  },
  {
    id: "featured_kindergartens",
    labelKey: "cat_featured_kindergartens",
    badgeKey: "cat_badge_featured",
    count: 18,
    icon: "star",
  },
];

/** The region dropdown options — shared by both directories. */
export const DIRECTORY_REGIONS: DictionaryKey[] = [
  "city_ramallah",
  "city_jerusalem",
  "city_alBireh",
  "city_nablus",
  "city_hebron",
  "city_gaza",
  "city_tulkarm",
  "city_bethlehem",
  "city_jenin",
  "city_jericho",
  "city_qalqilya",
  "city_salfit",
  "city_khanYounis",
  "city_deirAlBalah",
  "city_jabalia",
  "city_rafah",
];

/**
 * Stage / age dropdown options per directory.
 *
 * `dir_stage_all` is deliberately absent: it is a *card tag* ("جميع المراحل" on
 * a listing), and the dropdown already carries its own "all stages" option, so
 * including it here would render the same label twice in one `<select>`.
 */
export const CENTER_STAGES: DictionaryKey[] = [
  "dir_stage_general",
  "dir_stage_academic",
  "dir_stage_kgFoundation",
  "dir_stage_languages",
  "dir_stage_techSkills",
  "dir_stage_arts",
  "dir_stage_schoolReady",
];

export const KINDERGARTEN_STAGES: DictionaryKey[] = [
  "dir_stage_2_5",
  "dir_stage_3_6",
  "dir_stage_5_6",
];

/* ------------------------------------------------------------------ */
/* Seed listings                                                      */
/* ------------------------------------------------------------------ */

export const CENTER_LISTINGS: DirectoryListing[] = [
  {
    id: "dir-center-alufuq",
    kind: "centers",
    name: { ar: "مدرسة الأفق الدولية", en: "Al-Ufuq International School" },
    category: "private_schools",
    cityKey: "city_ramallah",
    rating: 4.6,
    reviewsCount: 243,
    priceMin: 800,
    priceMax: 1200,
    stageKeys: ["dir_stage_all", "dir_stage_general"],
    coverIndex: 1,
    phone: "+970599100100",
    whatsapp: "970599100100",
  },
  {
    id: "dir-center-alquds",
    kind: "centers",
    name: { ar: "مدرسة القدس الحديثة", en: "Modern Jerusalem School" },
    category: "private_schools",
    cityKey: "city_jerusalem",
    rating: 4.6,
    reviewsCount: 187,
    priceMin: 600,
    priceMax: 1000,
    stageKeys: ["dir_stage_kgFoundation"],
    coverIndex: 3,
    phone: "+970599100200",
    whatsapp: "970599100200",
  },
  {
    id: "dir-center-ibdaa",
    kind: "centers",
    name: { ar: "مركز الإبداع التعليمي", en: "Al-Ibda Educational Center" },
    category: "learning_centers",
    cityKey: "city_alBireh",
    rating: 4.7,
    reviewsCount: 132,
    priceMin: 400,
    priceMax: 800,
    stageKeys: ["dir_stage_all", "dir_stage_academic"],
    coverIndex: 0,
    phone: "+970599100300",
    whatsapp: "970599100300",
  },
  {
    id: "dir-center-languages",
    kind: "centers",
    name: { ar: "مركز اللغات العالمية", en: "World Languages Center" },
    category: "language_centers",
    cityKey: "city_nablus",
    rating: 4.5,
    reviewsCount: 96,
    priceMin: 500,
    priceMax: 900,
    stageKeys: ["dir_stage_languages", "dir_stage_all"],
    coverIndex: 4,
    phone: "+970599100400",
    whatsapp: "970599100400",
  },
  {
    id: "dir-center-mustaqbal",
    kind: "centers",
    name: { ar: "أكاديمية المستقبل", en: "Al-Mustaqbal Academy" },
    category: "skills_centers",
    cityKey: "city_hebron",
    rating: 4.3,
    reviewsCount: 78,
    priceMin: 300,
    priceMax: 700,
    stageKeys: ["dir_stage_techSkills", "dir_stage_6_18"],
    coverIndex: 2,
    phone: "+970599100500",
    whatsapp: "970599100500",
  },
  {
    id: "dir-center-finearts",
    kind: "centers",
    name: { ar: "مركز الفنون الجميلة", en: "Fine Arts Center" },
    category: "creative_centers",
    cityKey: "city_gaza",
    rating: 4.6,
    reviewsCount: 65,
    priceMin: 400,
    priceMax: 850,
    stageKeys: ["dir_stage_arts", "dir_stage_4_16"],
    coverIndex: 5,
    phone: "+970599100600",
    whatsapp: "970599100600",
  },
  {
    id: "dir-center-alnoor",
    kind: "centers",
    name: { ar: "مدرسة النور النموذجية", en: "Al-Noor Model School" },
    category: "private_schools",
    cityKey: "city_tulkarm",
    rating: 4.4,
    reviewsCount: 52,
    priceMin: 700,
    priceMax: 1200,
    stageKeys: ["dir_stage_all", "dir_stage_general"],
    coverIndex: 1,
    phone: "+970599100700",
    whatsapp: "970599100700",
  },
  {
    id: "dir-center-ruwad",
    kind: "centers",
    name: { ar: "مركز الرواد الأكاديمي", en: "Al-Ruwad Academic Center" },
    category: "learning_centers",
    cityKey: "city_bethlehem",
    rating: 4.7,
    reviewsCount: 41,
    priceMin: 450,
    priceMax: 900,
    stageKeys: ["dir_stage_academic", "dir_stage_6_18"],
    coverIndex: 0,
    phone: "+970599100800",
    whatsapp: "970599100800",
  },
  {
    id: "dir-center-ghad",
    kind: "centers",
    name: { ar: "مركز جيل الغد", en: "Future Generation Center" },
    category: "support_centers",
    cityKey: "city_ramallah",
    rating: 4.5,
    reviewsCount: 36,
    priceMin: 500,
    priceMax: 950,
    stageKeys: ["dir_stage_kgFoundation"],
    coverIndex: 2,
    phone: "+970599100900",
    whatsapp: "970599100900",
  },
  {
    id: "dir-center-furqan",
    kind: "centers",
    name: { ar: "مدرسة الفرقان الخاصة", en: "Al-Furqan Private School" },
    category: "private_schools",
    cityKey: "city_gaza",
    rating: 4.5,
    reviewsCount: 211,
    priceMin: 600,
    priceMax: 1100,
    stageKeys: ["dir_stage_all", "dir_stage_general"],
    coverIndex: 3,
    phone: "+970599101000",
    whatsapp: "970599101000",
  },
  {
    id: "dir-center-tafawuq",
    kind: "centers",
    name: { ar: "مركز التفوق التعليمي", en: "Excellence Learning Center" },
    category: "learning_centers",
    cityKey: "city_nablus",
    rating: 4.4,
    reviewsCount: 166,
    priceMin: 350,
    priceMax: 750,
    stageKeys: ["dir_stage_all", "dir_stage_academic"],
    coverIndex: 0,
    phone: "+970599101100",
    whatsapp: "970599101100",
  },
  {
    id: "dir-center-skills",
    kind: "centers",
    name: { ar: "معهد المهارات الحديثة", en: "Modern Skills Institute" },
    category: "skills_centers",
    cityKey: "city_ramallah",
    rating: 4.2,
    reviewsCount: 144,
    priceMin: 300,
    priceMax: 700,
    stageKeys: ["dir_stage_techSkills", "dir_stage_6_18"],
    coverIndex: 4,
    phone: "+970599101200",
    whatsapp: "970599101200",
  },
  {
    id: "dir-center-afaq",
    kind: "centers",
    name: { ar: "مركز آفاق للغات", en: "Afaq Languages Center" },
    category: "language_centers",
    cityKey: "city_bethlehem",
    rating: 4.6,
    reviewsCount: 128,
    priceMin: 450,
    priceMax: 850,
    stageKeys: ["dir_stage_languages"],
    coverIndex: 5,
    phone: "+970599101300",
    whatsapp: "970599101300",
  },
  {
    id: "dir-center-ruwadtrain",
    kind: "centers",
    name: { ar: "أكاديمية الرواد للتدريب", en: "Ruwad Training Academy" },
    category: "support_centers",
    cityKey: "city_hebron",
    rating: 4.3,
    reviewsCount: 118,
    priceMin: 400,
    priceMax: 800,
    stageKeys: ["dir_stage_academic", "dir_stage_6_18"],
    coverIndex: 1,
    phone: "+970599101400",
    whatsapp: "970599101400",
  },
  {
    id: "dir-center-artcreativity",
    kind: "centers",
    name: { ar: "مركز الإبداع الفني", en: "Art Creativity Center" },
    category: "creative_centers",
    cityKey: "city_jenin",
    rating: 4.5,
    reviewsCount: 97,
    priceMin: 350,
    priceMax: 800,
    stageKeys: ["dir_stage_arts", "dir_stage_4_16"],
    coverIndex: 2,
    phone: "+970599101500",
    whatsapp: "970599101500",
  },
  {
    id: "dir-center-computer",
    kind: "centers",
    name: { ar: "مركز الحاسوب والتكنولوجيا", en: "Computer & Technology Center" },
    category: "tech_centers",
    cityKey: "city_gaza",
    rating: 4.4,
    reviewsCount: 89,
    priceMin: 400,
    priceMax: 900,
    stageKeys: ["dir_stage_techSkills", "dir_stage_6_18"],
    coverIndex: 0,
    phone: "+970599101600",
    whatsapp: "970599101600",
  },
  {
    id: "dir-center-amal-school",
    kind: "centers",
    name: { ar: "مدرسة الأمل النموذجية", en: "Al-Amal Model School" },
    category: "private_schools",
    cityKey: "city_khanYounis",
    rating: 4.6,
    reviewsCount: 203,
    priceMin: 650,
    priceMax: 1200,
    stageKeys: ["dir_stage_all", "dir_stage_general"],
    coverIndex: 3,
    phone: "+970599101700",
    whatsapp: "970599101700",
  },
  {
    id: "dir-center-qudstutoring",
    kind: "centers",
    name: { ar: "مركز القدس للتقوية", en: "Jerusalem Tutoring Center" },
    category: "support_centers",
    cityKey: "city_jerusalem",
    rating: 4.5,
    reviewsCount: 152,
    priceMin: 350,
    priceMax: 750,
    stageKeys: ["dir_stage_academic", "dir_stage_6_18"],
    coverIndex: 4,
    phone: "+970599101800",
    whatsapp: "970599101800",
  },
];

export const KINDERGARTEN_LISTINGS: DirectoryListing[] = [
  {
    id: "dir-kg-baraem",
    kind: "kindergartens",
    name: { ar: "روضة براعم المستقبل", en: "Future Buds Kindergarten" },
    category: "private_kindergartens",
    cityKey: "city_nablus",
    rating: 4.8,
    reviewsCount: 156,
    priceMin: 800,
    priceMax: 1200,
    stageKeys: ["dir_stage_2_5"],
    coverIndex: 0,
    phone: "+970599200100",
    whatsapp: "970599200100",
  },
  {
    id: "dir-kg-stars",
    kind: "kindergartens",
    name: { ar: "روضة النجوم الصغيرة", en: "Little Stars Kindergarten" },
    category: "private_kindergartens",
    cityKey: "city_hebron",
    rating: 4.6,
    reviewsCount: 142,
    priceMin: 700,
    priceMax: 1000,
    stageKeys: ["dir_stage_2_5"],
    coverIndex: 1,
    phone: "+970599200200",
    whatsapp: "970599200200",
  },
  {
    id: "dir-kg-amal",
    kind: "kindergartens",
    name: { ar: "روضة الأمل", en: "Al-Amal Kindergarten" },
    category: "gov_kindergartens",
    cityKey: "city_bethlehem",
    rating: 4.5,
    reviewsCount: 98,
    priceMin: 500,
    priceMax: 800,
    stageKeys: ["dir_stage_3_6"],
    coverIndex: 2,
    phone: "+970599200300",
    whatsapp: "970599200300",
  },
  {
    id: "dir-kg-futuregen",
    kind: "kindergartens",
    name: { ar: "روضة جيل المستقبل", en: "Future Generation Kindergarten" },
    category: "private_kindergartens",
    cityKey: "city_nablus",
    rating: 4.7,
    reviewsCount: 121,
    priceMin: 750,
    priceMax: 1100,
    stageKeys: ["dir_stage_2_5"],
    coverIndex: 3,
    phone: "+970599200400",
    whatsapp: "970599200400",
  },
  {
    id: "dir-kg-noor",
    kind: "kindergartens",
    name: { ar: "روضة النور", en: "Al-Noor Kindergarten" },
    category: "islamic_kindergartens",
    cityKey: "city_jenin",
    rating: 4.6,
    reviewsCount: 87,
    priceMin: 600,
    priceMax: 900,
    stageKeys: ["dir_stage_3_6"],
    coverIndex: 4,
    phone: "+970599200500",
    whatsapp: "970599200500",
  },
  {
    id: "dir-kg-farah",
    kind: "kindergartens",
    name: { ar: "روضة الفرح", en: "Al-Farah Kindergarten" },
    category: "private_kindergartens",
    cityKey: "city_jericho",
    rating: 4.4,
    reviewsCount: 73,
    priceMin: 550,
    priceMax: 800,
    stageKeys: ["dir_stage_3_6"],
    coverIndex: 5,
    phone: "+970599200600",
    whatsapp: "970599200600",
  },
  {
    id: "dir-kg-rayyan",
    kind: "kindergartens",
    name: { ar: "روضة الريان", en: "Al-Rayyan Kindergarten" },
    category: "private_kindergartens",
    cityKey: "city_tulkarm",
    rating: 4.5,
    reviewsCount: 65,
    priceMin: 650,
    priceMax: 950,
    stageKeys: ["dir_stage_2_5"],
    coverIndex: 0,
    phone: "+970599200700",
    whatsapp: "970599200700",
  },
  {
    id: "dir-kg-mustaqbal",
    kind: "kindergartens",
    name: { ar: "روضة المستقبل", en: "Al-Mustaqbal Kindergarten" },
    category: "gov_kindergartens",
    cityKey: "city_qalqilya",
    rating: 4.6,
    reviewsCount: 54,
    priceMin: 500,
    priceMax: 800,
    stageKeys: ["dir_stage_2_5"],
    coverIndex: 1,
    phone: "+970599200800",
    whatsapp: "970599200800",
  },
  {
    id: "dir-kg-ibdaa",
    kind: "kindergartens",
    name: { ar: "روضة الإبداع", en: "Al-Ibda Kindergarten" },
    category: "private_kindergartens",
    cityKey: "city_salfit",
    rating: 4.6,
    reviewsCount: 112,
    priceMin: 750,
    priceMax: 1000,
    stageKeys: ["dir_stage_2_5"],
    coverIndex: 2,
    phone: "+970599200900",
    whatsapp: "970599200900",
  },
  {
    id: "dir-kg-flowers",
    kind: "kindergartens",
    name: { ar: "روضة الزهور", en: "Flowers Kindergarten" },
    category: "mixed_kindergartens",
    cityKey: "city_ramallah",
    rating: 4.7,
    reviewsCount: 134,
    priceMin: 700,
    priceMax: 1000,
    stageKeys: ["dir_stage_3_6"],
    coverIndex: 3,
    phone: "+970599201000",
    whatsapp: "970599201000",
  },
  {
    id: "dir-kg-risingsun",
    kind: "kindergartens",
    name: { ar: "روضة الشمس المشرقة", en: "Rising Sun Kindergarten" },
    category: "private_kindergartens",
    cityKey: "city_gaza",
    rating: 4.5,
    reviewsCount: 119,
    priceMin: 600,
    priceMax: 900,
    stageKeys: ["dir_stage_3_6"],
    coverIndex: 4,
    phone: "+970599201100",
    whatsapp: "970599201100",
  },
  {
    id: "dir-kg-quran",
    kind: "kindergartens",
    name: { ar: "روضة القرآن الكريم", en: "Quran Kindergarten" },
    category: "islamic_kindergartens",
    cityKey: "city_khanYounis",
    rating: 4.6,
    reviewsCount: 105,
    priceMin: 550,
    priceMax: 850,
    stageKeys: ["dir_stage_3_6"],
    coverIndex: 5,
    phone: "+970599201200",
    whatsapp: "970599201200",
  },
  {
    id: "dir-kg-littlelang",
    kind: "kindergartens",
    name: { ar: "روضة اللغات الصغيرة", en: "Little Languages Kindergarten" },
    category: "language_kindergartens",
    cityKey: "city_jerusalem",
    rating: 4.4,
    reviewsCount: 92,
    priceMin: 750,
    priceMax: 1100,
    stageKeys: ["dir_stage_2_5"],
    coverIndex: 0,
    phone: "+970599201300",
    whatsapp: "970599201300",
  },
  {
    id: "dir-kg-smile",
    kind: "kindergartens",
    name: { ar: "روضة البسمة", en: "Smile Kindergarten" },
    category: "gov_kindergartens",
    cityKey: "city_deirAlBalah",
    rating: 4.3,
    reviewsCount: 78,
    priceMin: 500,
    priceMax: 750,
    stageKeys: ["dir_stage_3_6"],
    coverIndex: 1,
    phone: "+970599201400",
    whatsapp: "970599201400",
  },
  {
    id: "dir-kg-firststeps",
    kind: "kindergartens",
    name: { ar: "روضة الخطوات الأولى", en: "First Steps Kindergarten" },
    category: "mixed_kindergartens",
    cityKey: "city_jabalia",
    rating: 4.6,
    reviewsCount: 84,
    priceMin: 600,
    priceMax: 900,
    stageKeys: ["dir_stage_2_5"],
    coverIndex: 2,
    phone: "+970599201500",
    whatsapp: "970599201500",
  },
  {
    id: "dir-kg-wafa",
    kind: "kindergartens",
    name: { ar: "روضة الوفاء", en: "Al-Wafa Kindergarten" },
    category: "featured_kindergartens",
    cityKey: "city_rafah",
    rating: 4.8,
    reviewsCount: 66,
    priceMin: 700,
    priceMax: 1000,
    stageKeys: ["dir_stage_5_6"],
    coverIndex: 3,
    phone: "+970599201600",
    whatsapp: "970599201600",
  },
  {
    id: "dir-kg-breeze",
    kind: "kindergartens",
    name: { ar: "روضة نسيم الصباح", en: "Morning Breeze Kindergarten" },
    category: "private_kindergartens",
    cityKey: "city_nablus",
    rating: 4.5,
    reviewsCount: 61,
    priceMin: 650,
    priceMax: 950,
    stageKeys: ["dir_stage_3_6"],
    coverIndex: 4,
    phone: "+970599201700",
    whatsapp: "970599201700",
  },
  {
    id: "dir-kg-happykids",
    kind: "kindergartens",
    name: { ar: "روضة الأطفال السعيدة", en: "Happy Kids Kindergarten" },
    category: "featured_kindergartens",
    cityKey: "city_hebron",
    rating: 4.7,
    reviewsCount: 58,
    priceMin: 800,
    priceMax: 1200,
    stageKeys: ["dir_stage_2_5"],
    coverIndex: 5,
    phone: "+970599201800",
    whatsapp: "970599201800",
  },
];

/* ------------------------------------------------------------------ */
/* Lookups                                                            */
/* ------------------------------------------------------------------ */

export const listingsFor = (kind: DirectoryKind): DirectoryListing[] =>
  kind === "centers" ? CENTER_LISTINGS : KINDERGARTEN_LISTINGS;

export const categoriesFor = (kind: DirectoryKind): DirectoryCategory[] =>
  kind === "centers" ? CENTER_CATEGORIES : KINDERGARTEN_CATEGORIES;

export const stagesFor = (kind: DirectoryKind): DictionaryKey[] =>
  kind === "centers" ? CENTER_STAGES : KINDERGARTEN_STAGES;

export function categoryById(
  kind: DirectoryKind,
  id: string
): DirectoryCategory | undefined {
  return categoriesFor(kind).find((category) => category.id === id);
}

/** Per-directory route + hero copy wiring, so pages stay thin. */
export const KIND_META: Record<
  DirectoryKind,
  {
    href: string;
    badgeKey: DictionaryKey;
    heroMainKey: DictionaryKey;
    heroLeadKey: DictionaryKey;
    heroSearchKey: DictionaryKey;
    heroAltKey: DictionaryKey;
    navKey: DictionaryKey;
    /** Localised `<title>` for the route, re-applied when the language flips. */
    docTitleKey: DictionaryKey;
    resultsUnitKey: DictionaryKey;
    filterTypeKey: DictionaryKey;
    filterRegionKey: DictionaryKey;
    filterStageKey: DictionaryKey;
    filterPriceKey: DictionaryKey;
    filterAllStagesKey: DictionaryKey;
    why3Key: DictionaryKey;
    why4Key: DictionaryKey;
    newsletterLeadKey: DictionaryKey;
    contactKey: DictionaryKey;
  }
> = {
  centers: {
    href: "/explore/centers",
    badgeKey: "dir_centersBadge",
    heroMainKey: "dir_centersHeroMain",
    heroLeadKey: "dir_centersHeroLead",
    heroSearchKey: "dir_centersHeroSearch",
    heroAltKey: "dir_centersHeroAlt",
    navKey: "nav_centers",
    docTitleKey: "dir_centersDocTitle",
    resultsUnitKey: "dir_resultsCentersUnit",
    filterTypeKey: "dir_filterType",
    filterRegionKey: "dir_filterRegion",
    filterStageKey: "dir_filterStage",
    filterPriceKey: "dir_filterPrice",
    filterAllStagesKey: "dir_filterAllStages",
    why3Key: "dir_why3",
    why4Key: "dir_why4",
    newsletterLeadKey: "dir_newsletterLead",
    contactKey: "dir_cardContactCenter",
  },
  kindergartens: {
    href: "/explore/kindergartens",
    badgeKey: "dir_kindergartensBadge",
    heroMainKey: "dir_kindergartensHeroMain",
    heroLeadKey: "dir_kindergartensHeroLead",
    heroSearchKey: "dir_kindergartensHeroSearch",
    heroAltKey: "dir_kindergartensHeroAlt",
    navKey: "nav_kindergartens",
    docTitleKey: "dir_kindergartensDocTitle",
    resultsUnitKey: "dir_resultsKindergartensUnit",
    filterTypeKey: "dir_filterTypeKindergarten",
    filterRegionKey: "dir_filterGovernorate",
    filterStageKey: "dir_filterAgeStage",
    filterPriceKey: "dir_filterMonthlyPrice",
    filterAllStagesKey: "dir_filterAllAges",
    why3Key: "dir_whyKg3",
    why4Key: "dir_whyKg4",
    newsletterLeadKey: "dir_newsletterLeadKg",
    contactKey: "dir_cardContactKindergarten",
  },
};
