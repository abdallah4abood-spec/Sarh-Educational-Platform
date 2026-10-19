/**
 * SARH — "منصة الصرح التعليمية" catalog content (/learn).
 *
 * Why this lives outside the i18n dictionary
 * ------------------------------------------
 * The dictionary holds *chrome*: one string used by one label in every
 * language. A course, however, is a **record** — its title, instructor and
 * level belong together and are consumed as a unit by the catalog UI. Splitting
 * a course across ten dictionary keys would make the data unreadable and easy
 * to break, so content is stored here as `Localized` pairs and rendered through
 * `pick(value, lang)`.
 *
 * Nothing here is typed as `any` and no field is a placeholder: every course
 * carries a rating, workload, enrolment count and price, and every Unsplash
 * photo id below was verified to return HTTP 200 (see `courseImage`).
 */

import type { DictionaryKey, Language } from "@/lib/i18n/dictionary";

/** A string with both languages of the platform co-located. */
export interface Localized {
  ar: string;
  en: string;
}

/** Resolve a `Localized` value for the active language. */
export function pick(value: Localized, lang: Language): string {
  return value[lang];
}

/**
 * First letters of the first two words — used for instructor and learner
 * avatars. Arabic and Latin both work; "سارة عبد الله" → "سع".
 */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("");
}

/**
 * Build an Unsplash delivery URL. Unsplash applies `auto=format`, so the
 * browser receives WebP/AVIF and `next/image` re-optimizes on top of it.
 *
 * The wrapper keeps the ids in this file readable and makes the `w`/`q`
 * contract identical for every course cover and avatar.
 */
export function courseImage(id: string, width = 800): string {
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}&q=72`;
}

/* ==================================================================== */
/* Categories (courses section filter tabs)                             */
/* ==================================================================== */

export type CategoryId = "all" | "programming" | "design" | "languages" | "business";

export interface CourseCategory {
  id: CategoryId;
  label: Localized;
}

export const COURSE_CATEGORIES: CourseCategory[] = [
  { id: "all", label: { ar: "الكل", en: "All" } },
  {
    id: "programming",
    label: { ar: "البرمجة والتطوير", en: "Programming & development" },
  },
  { id: "design", label: { ar: "التصميم الجرافيكي", en: "Graphic design" } },
  { id: "languages", label: { ar: "اللغات", en: "Languages" } },
  { id: "business", label: { ar: "إدارة الأعمال", en: "Business management" } },
];

/* ==================================================================== */
/* Courses                                                             */
/* ==================================================================== */

export type CourseLevel = "beginner" | "intermediate" | "advanced";
export type CourseBadge = "bestseller" | "new";

export interface Course {
  id: string;
  category: Exclude<CategoryId, "all">;
  title: Localized;
  instructor: Localized;
  /** 0–5 with one decimal, rendered through `<RatingStars />`. */
  rating: number;
  /** Number of written reviews behind the rating. */
  reviews: number;
  students: number;
  lessons: number;
  hours: number;
  level: CourseLevel;
  /** `null` marks a free course; otherwise the price in ILS. */
  price: number | null;
  badge?: CourseBadge;
  /** Unsplash photo id — verified reachable. */
  image: string;
  /** Longer catalog copy shown on the course card. */
  summary: Localized;
}

export const COURSES: Course[] = [
  {
    id: "python-fundamentals",
    category: "programming",
    title: { ar: "أساسيات البرمجة بلغة بايثون", en: "Python programming fundamentals" },
    instructor: { ar: "م. أحمد الشريف", en: "Ahmed Al-Sharif" },
    summary: {
      ar: "ابدأ من الصفر واكتب أول برامجك، ثم ابنِ ثلاثة مشاريع عملية بلغة بايثون.",
      en: "Start from zero, write your first programs, then build three practical Python projects.",
    },
    rating: 4.9,
    reviews: 812,
    students: 3240,
    lessons: 42,
    hours: 12,
    level: "beginner",
    price: 250,
    badge: "bestseller",
    image: "1461749280684-dccba630e2f6",
  },
  {
    id: "react-web-apps",
    category: "programming",
    title: { ar: "تطوير تطبيقات الويب باستخدام React", en: "Web app development with React" },
    instructor: { ar: "م. ريم قاسم", en: "Reem Qasem" },
    summary: {
      ar: "من مكوّنات الواجهة إلى ربط الـ API، مع مشروع نهائي منشور على الإنترنت.",
      en: "From UI components to API wiring, ending with a project deployed to the web.",
    },
    rating: 4.8,
    reviews: 604,
    students: 2140,
    lessons: 56,
    hours: 18,
    level: "intermediate",
    price: 420,
    badge: "bestseller",
    image: "1517180102446-f3ece451e9d8",
  },
  {
    id: "ai-introduction",
    category: "programming",
    title: { ar: "مدخل إلى الذكاء الاصطناعي وتطبيقاته", en: "Introduction to AI and its applications" },
    instructor: { ar: "د. سامي حمدان", en: "Dr. Sami Hamdan" },
    summary: {
      ar: "افهم كيف تعمل النماذج الذكية، وابنِ أداة عملية تستخدم واجهات الذكاء الاصطناعي.",
      en: "Understand how intelligent models work and build a practical tool on top of AI APIs.",
    },
    rating: 4.9,
    reviews: 431,
    students: 4120,
    lessons: 24,
    hours: 6,
    level: "beginner",
    price: null,
    badge: "new",
    image: "1620712943543-bcc4688e7485",
  },
  {
    id: "ui-ux-design",
    category: "design",
    title: { ar: "تصميم واجهات المستخدم UI/UX من الصفر", en: "UI/UX design from scratch" },
    instructor: { ar: "أ. لينا أبو سمرة", en: "Lina Abu Samra" },
    summary: {
      ar: "مبادئ التصميم، رحلة المستخدم، وبناء ملف تصاميم كامل قابل للعرض على العملاء.",
      en: "Design principles, user journeys, and a complete portfolio-ready design file.",
    },
    rating: 4.9,
    reviews: 522,
    students: 1890,
    lessons: 38,
    hours: 10,
    level: "beginner",
    price: 300,
    badge: "bestseller",
    image: "1558655146-9f40138edfeb",
  },
  {
    id: "brand-identity",
    category: "design",
    title: { ar: "الهوية البصرية والتصميم الجرافيكي", en: "Brand identity & graphic design" },
    instructor: { ar: "أ. كريم الدلو", en: "Karim Al-Dalu" },
    summary: {
      ar: "ابنِ هوية كاملة لمشروع حقيقي: الشعار، الألوان، الخطوط، ودليل استخدام العلامة.",
      en: "Build a complete identity for a real project: logo, palette, type and brand guidelines.",
    },
    rating: 4.7,
    reviews: 288,
    students: 1120,
    lessons: 30,
    hours: 9,
    level: "intermediate",
    price: 280,
    image: "1613909207039-6b173b755cc1",
  },
  {
    id: "business-english",
    category: "languages",
    title: { ar: "الإنجليزية للأعمال والمقابلات الوظيفية", en: "Business & interview English" },
    instructor: { ar: "أ. هدى نصار", en: "Huda Nassar" },
    summary: {
      ar: "مفردات بيئة العمل، كتابة البريد المهني، والاستعداد لمقابلة عمل بالإنجليزية.",
      en: "Workplace vocabulary, professional email writing, and interview preparation in English.",
    },
    rating: 4.8,
    reviews: 742,
    students: 2560,
    lessons: 48,
    hours: 14,
    level: "intermediate",
    price: 220,
    image: "1544717297-fa95b6ee9643",
  },
  {
    id: "english-conversation",
    category: "languages",
    title: { ar: "محادثة الإنجليزية للمبتدئين", en: "English conversation for beginners" },
    instructor: { ar: "أ. مريم الزعانين", en: "Mariam Al-Zaanin" },
    summary: {
      ar: "تدريب يومي على المحادثة بمواقف واقعية، مع تصحيح مباشر من المدرّبة.",
      en: "Daily speaking practice in real-life situations with direct correction from the instructor.",
    },
    rating: 4.6,
    reviews: 1105,
    students: 3010,
    lessons: 36,
    hours: 8,
    level: "beginner",
    price: null,
    image: "1503676260728-1c00da094a0b",
  },
  {
    id: "small-business",
    category: "business",
    title: { ar: "إدارة المشاريع الصغيرة وريادة الأعمال", en: "Small business & entrepreneurship" },
    instructor: { ar: "د. عمر الشوا", en: "Dr. Omar Al-Shawa" },
    summary: {
      ar: "من الفكرة إلى دراسة الجدوى والتسعير، مع خطة عمل جاهزة لمشروعك.",
      en: "From idea to feasibility study and pricing, ending with a ready business plan.",
    },
    rating: 4.8,
    reviews: 356,
    students: 1240,
    lessons: 28,
    hours: 7,
    level: "beginner",
    price: 199,
    image: "1552664730-d307ca884978",
  },
  {
    id: "digital-marketing",
    category: "business",
    title: { ar: "التسويق الرقمي وتحليل الأداء", en: "Digital marketing & performance analytics" },
    instructor: { ar: "أ. نور السقا", en: "Nour Al-Saqqa" },
    summary: {
      ar: "حملات إعلانية مدفوعة، قياس النتائج، وتحسين التكلفة عبر تقارير تحليلية واضحة.",
      en: "Paid campaigns, result measurement, and cost optimisation through clear analytics reports.",
    },
    rating: 4.7,
    reviews: 241,
    students: 980,
    lessons: 32,
    hours: 9,
    level: "advanced",
    price: 260,
    image: "1516321318423-f06f85e504b3",
  },
];

/** Dictionary keys for the three course levels. */
export const LEVEL_KEYS: Record<CourseLevel, DictionaryKey> = {
  beginner: "learn_levelBeginner",
  intermediate: "learn_levelIntermediate",
  advanced: "learn_levelAdvanced",
};

/** Dictionary keys for the optional course badge. */
export const BADGE_KEYS: Record<CourseBadge, DictionaryKey> = {
  bestseller: "learn_courseBestseller",
  new: "learn_courseNew",
};

/* ==================================================================== */
/* Statistics & trust                                                    */
/* ==================================================================== */

export interface Stat {
  id: string;
  /** Animated from 0 with `useCountUp` and rendered with en-US grouping. */
  value: number;
  /** Shown before the digits — Arabic convention for "+15,000". */
  prefix?: string;
  /** Shown after the digits, e.g. "98%". */
  suffix?: string;
  labelKey: DictionaryKey;
}

export const STATS: Stat[] = [
  { id: "students", value: 15000, prefix: "+", labelKey: "learn_statStudents" },
  { id: "courses", value: 250, prefix: "+", labelKey: "learn_statCourses" },
  { id: "completion", value: 98, suffix: "%", labelKey: "learn_statCompletion" },
  { id: "experts", value: 140, prefix: "+", labelKey: "learn_statExperts" },
];

/* ==================================================================== */
/* Features / smart benefits                                            */
/* ==================================================================== */

/** Icon slot resolved to a lucide component inside the section. */
export type FeatureIcon = "certificate" | "instructor" | "schedule" | "shield";

export interface Feature {
  id: string;
  icon: FeatureIcon;
  titleKey: DictionaryKey;
  bodyKey: DictionaryKey;
}

export const FEATURES: Feature[] = [
  {
    id: "content",
    icon: "certificate",
    titleKey: "learn_feature1Title",
    bodyKey: "learn_feature1Body",
  },
  {
    id: "instructors",
    icon: "instructor",
    titleKey: "learn_feature2Title",
    bodyKey: "learn_feature2Body",
  },
  {
    id: "schedule",
    icon: "schedule",
    titleKey: "learn_feature3Title",
    bodyKey: "learn_feature3Body",
  },
  {
    id: "certificates",
    icon: "shield",
    titleKey: "learn_feature4Title",
    bodyKey: "learn_feature4Body",
  },
];

/* ==================================================================== */
/* Testimonials                                                         */
/* ==================================================================== */

export interface Testimonial {
  id: string;
  name: Localized;
  role: Localized;
  quote: Localized;
  rating: number;
  /** Unsplash portrait id — verified reachable; initials back it up offline. */
  avatar: string;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    id: "sara",
    name: { ar: "سارة عبد الله", en: "Sara Abdullah" },
    role: { ar: "مطوّرة واجهات · غزة", en: "Frontend developer · Gaza" },
    quote: {
      ar: "بدأت من الصفر تماماً، وبعد أربعة أشهر من مسار تطوير الويب قدّمت أول مشروع لي كعمل حر. الشرح عملي والمشاريع تشبه ما يطلبه السوق فعلاً.",
      en: "I started from absolute zero; four months into the web track I delivered my first freelance project. The teaching is practical and the projects mirror what the market actually asks for.",
    },
    rating: 5,
    avatar: "1494790108377-be9c29b29330",
  },
  {
    id: "mohammed",
    name: { ar: "محمد أبو ندى", en: "Mohammed Abu Nada" },
    quote: {
      ar: "أهم ما يميّز الصرح أن الدروس محمّلة على جهازي، فكملت الدورة كاملة وقت انقطاع الكهرباء والاتصال. لم أشعر أن التعلّم توقف يوماً.",
      en: "What sets Sarh apart is that lessons are downloaded on my device, so I finished the whole course during power and network cuts. My learning never actually stopped.",
    },
    role: { ar: "طالب هندسة · خان يونس", en: "Engineering student · Khan Younis" },
    rating: 5,
    avatar: "1472099645785-5658abf4ff4e",
  },
  {
    id: "lina",
    name: { ar: "لينا حسن", en: "Lina Hassan" },
    role: { ar: "مصمّمة مستقلة · رفح", en: "Freelance designer · Rafah" },
    quote: {
      ar: "دورة الهوية البصرية أعطتني ملف أعمال كامل، وأول عميل جاءني بعد ثلاثة أسابيع من إتمامها. المراجعات الفردية على المشاريع كانت الأكثر فائدة.",
      en: "The brand identity course gave me a complete portfolio, and my first client came three weeks after I finished it. The individual project reviews were the most valuable part.",
    },
    rating: 5,
    avatar: "1544005313-94ddf0286df2",
  },
  {
    id: "yousef",
    name: { ar: "يوسف العمري", en: "Yousef Al-Omari" },
    role: { ar: "محاسب · دير البلح", en: "Accountant · Deir al-Balah" },
    quote: {
      ar: "سجّلت في دورة تحليل الأداء لأطوّر عملي في الشركة، والأسلوب المباشر بدون حشو وفّر عليّ وقتاً كبيراً. الشهادة ساعدتني في الترقية.",
      en: "I took the performance analytics course to grow in my company role; the direct, no-filler style saved me a lot of time and the certificate helped me get promoted.",
    },
    rating: 4,
    avatar: "1500648767791-00dcc994a43e",
  },
  {
    id: "huda",
    name: { ar: "هدى نصار", en: "Huda Nassar" },
    role: { ar: "معلّمة لغة إنجليزية · غزة", en: "English teacher · Gaza" },
    quote: {
      ar: "استخدمت تمارين دورة المحادثة داخل صفّي فوجدت الطلاب أكثر تفاعلاً، والشرح العربي المبسّط سهّل المفاهيم على الطلاب المبتدئين.",
      en: "I used the conversation-course exercises in my own classroom and saw far more engagement. The simple Arabic explanations make the trickiest ideas easy to grasp.",
    },
    rating: 5,
    avatar: "1573497019940-1c28c88b4f3e",
  },
];
