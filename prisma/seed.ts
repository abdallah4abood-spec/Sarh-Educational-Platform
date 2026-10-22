import {
  PrismaClient,
  type AnnouncementKind,
  type ActivityType,
  type InstitutionType,
  type PaymentStatus,
  type PlanStatus,
  type Role,
  type SignalKind,
  type StaffRole,
  type StaffStatus,
  type TrustStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** Cost 12 matches the hashing used by /api/auth/signup and verify in src/lib/auth.ts. */
const BCRYPT_ROUNDS = 12;

/**
 * Demo password for every seeded account. Kept in one place so the accounts
 * can never drift apart from each other.
 */
const DEMO_PASSWORD = "Parent123!";

/* ------------------------------------------------------------------ */
/* Deterministic identity                                             */
/* ------------------------------------------------------------------ */

/**
 * Every row this script owns carries an id with this prefix.
 *
 * That single convention is what makes the seed both *idempotent* and
 * *non-destructive*: re-running it deletes exactly the rows it created last
 * time (`id startsWith "seed-"`) and rebuilds them, so the demo graph can never
 * drift or double up — while anything a real user created (a signup, a log, an
 * invoice) has a different id and is never in scope. Users are the one
 * exception: they are upserted by email so their ids survive, because the rows
 * that point at them (and their NextAuth sessions) must keep resolving.
 */
const PREFIX = "seed-";
const id = (kind: string, n: number | string) => `${PREFIX}${kind}-${n}`;

/** Seeded row ids, collected so the cleanup pass can be exact. */
const seededIds: Record<string, string[]> = {};

function track(kind: string, ids: string[]) {
  seededIds[kind] = ids;
}

/* ------------------------------------------------------------------ */
/* Calendar helpers (Palestinian school week: Sunday → Thursday)       */
/* ------------------------------------------------------------------ */

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(8, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Friday (5) and Saturday (6) are the weekend; nothing is logged then. */
function isSchoolDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 5 && day !== 6;
}

/** The last `count` school days, oldest first. */
function recentSchoolDays(anchor: Date, count: number): Date[] {
  const days: Date[] = [];
  let cursor = startOfDay(anchor);
  while (days.length < count) {
    if (isSchoolDay(cursor)) days.unshift(new Date(cursor));
    cursor = addDays(cursor, -1);
  }
  return days;
}

/* ------------------------------------------------------------------ */
/* Fixture tables                                                      */
/* ------------------------------------------------------------------ */

interface AccountFixture {
  email: string;
  fullName: string;
  phoneNumber: string;
  role: Role;
  roles?: Role[];
}

const ACCOUNTS: AccountFixture[] = [
  {
    email: "parent@sarh.ps",
    fullName: "ولي الأمر التجريبي",
    phoneNumber: "+970599000000",
    role: "PARENT",
  },
  {
    email: "parent2@sarh.ps",
    fullName: "أم كريم — سارة محمود",
    phoneNumber: "+970599000010",
    role: "PARENT",
  },
  {
    email: "teacher@sarh.ps",
    fullName: "المعلمة التجريبية",
    phoneNumber: "+970599000002",
    role: "TEACHER",
    // A teacher who also reviews her peers' plans — exercises the navbar role
    // switcher (معلم ⇄ مشرف) without a second sign-in.
    roles: ["SUPERVISOR"],
  },
  {
    email: "teacher2@sarh.ps",
    fullName: "الأستاذ محمود درويش",
    phoneNumber: "+970599000012",
    role: "TEACHER",
  },
  {
    email: "teacher3@sarh.ps",
    fullName: "الأستاذة هدى سلامة",
    phoneNumber: "+970599000013",
    role: "TEACHER",
  },
  {
    email: "supervisor@sarh.ps",
    fullName: "المشرفة التعليمية",
    phoneNumber: "+970599000003",
    role: "SUPERVISOR",
  },
  {
    email: "center@sarh.ps",
    fullName: "مركز النور للتحضير والتوجيهي",
    phoneNumber: "+970599000004",
    role: "INSTITUTION_TEACHER",
  },
  {
    email: "center2@sarh.ps",
    fullName: "أكاديمية الأفق التعليمية",
    phoneNumber: "+970599000014",
    role: "INSTITUTION_TEACHER",
  },
  {
    email: "admin@sarh.ps",
    fullName: "Super Admin",
    phoneNumber: "+970599000001",
    role: "SUPER_ADMIN",
  },
];

interface InstitutionFixture {
  /** Local key used by the other fixtures; not a database id. */
  key: string;
  name: string;
  type: InstitutionType;
  address: string;
  zone: string;
  description: string;
  rating: number;
  phone: string;
  email: string;
  trustStatus: TrustStatus;
  trustNote?: string;
  ownerEmail: string;
}

const INSTITUTIONS: InstitutionFixture[] = [
  {
    key: "noor-center",
    name: "مركز النور للتحضير والتوجيهي",
    type: "EDUCATIONAL_CENTER",
    address: "شارع الوحدة، الرمال",
    zone: "غزة",
    description:
      "مركز متخصص في التحضير للتوجيهي ومراجعة المناهج العلمية والأدبية، بمتابعة أسبوعية للأهالي.",
    rating: 4.8,
    phone: "+970592405090",
    email: "hello@sarh.ps",
    trustStatus: "VERIFIED",
    ownerEmail: "center@sarh.ps",
  },
  {
    key: "baraem",
    name: "روضة براعم النور",
    type: "KINDERGARTEN",
    address: "شارع الجلاء، مقابل الحديقة العامة",
    zone: "غزة",
    description:
      "روضة للطفولة المبكرة (5–7 سنوات) تعتمد اللعب التربوي والتأسيس اللغوي والعددي.",
    rating: 4.7,
    phone: "+970592405091",
    email: "baraem@sarh.ps",
    trustStatus: "VERIFIED",
    ownerEmail: "center@sarh.ps",
  },
  {
    key: "ufuq",
    name: "أكاديمية الأفق التعليمية",
    type: "EDUCATIONAL_CENTER",
    address: "شارع البحر، وسط البلد",
    zone: "خان يونس",
    description:
      "أكاديمية مراجعة وتقوية لطلبة الصفوف من السابع حتى الثاني عشر، وحصص لغات متخصصة.",
    rating: 4.5,
    phone: "+970592405092",
    email: "ufuq@sarh.ps",
    trustStatus: "PENDING",
    ownerEmail: "center2@sarh.ps",
  },
  {
    key: "zohour",
    name: "روضة الزهور النموذجية",
    type: "KINDERGARTEN",
    address: "شارع المنتزه، البلوك الثالث",
    zone: "دير البلح",
    description:
      "روضة نموذجية بحديقة داخلية وقاعات واسعة، مع برنامج تأسيس للأطفال قبل المدرسة.",
    rating: 4.6,
    phone: "+970592405093",
    email: "zohour@sarh.ps",
    trustStatus: "PENDING",
    ownerEmail: "center2@sarh.ps",
  },
  {
    key: "riyada",
    name: "مركز الريادة للتوجيهي",
    type: "EDUCATIONAL_CENTER",
    address: "شارع الرئيسي، حي تل السلطان",
    zone: "رفح",
    description: "مركز تجميعي لتوجيهي العلمي والأدبي مع بنوك أسئلة واختبارات محاكية.",
    rating: 4.4,
    phone: "+970592405094",
    email: "riyada@sarh.ps",
    trustStatus: "UNVERIFIED",
    ownerEmail: "center@sarh.ps",
  },
  {
    key: "nujum",
    name: "روضة النجوم الصغيرة",
    type: "KINDERGARTEN",
    address: "شارع المدارس",
    zone: "غزة",
    description: "روضة أهلية صغيرة الحجم.",
    rating: 4.1,
    phone: "+970592405095",
    email: "nujum@sarh.ps",
    trustStatus: "REJECTED",
    trustNote: "لم تُرفع صورة الترخيص الرسمي ولا السجل التجاري الخاص بالروضة.",
    ownerEmail: "center2@sarh.ps",
  },
];

interface StudentFixture {
  key: string;
  fullName: string;
  /** Age at the reference date, used to derive a realistic date of birth. */
  age: number;
  parentEmail: string;
  institutionKey: string;
  gradeLevel: string;
}

const STUDENTS: StudentFixture[] = [
  { key: "sara", fullName: "سارة أحمد", age: 6, parentEmail: "parent@sarh.ps", institutionKey: "baraem", gradeLevel: "KG 2" },
  { key: "yousef", fullName: "يوسف أحمد", age: 13, parentEmail: "parent@sarh.ps", institutionKey: "noor-center", gradeLevel: "الصف الثامن" },
  { key: "leen", fullName: "لين محمد", age: 10, parentEmail: "parent@sarh.ps", institutionKey: "noor-center", gradeLevel: "الصف الخامس" },
  { key: "omar", fullName: "عمر خالد", age: 11, parentEmail: "parent@sarh.ps", institutionKey: "ufuq", gradeLevel: "الصف السادس" },
  { key: "adam", fullName: "آدم زياد", age: 15, parentEmail: "parent@sarh.ps", institutionKey: "riyada", gradeLevel: "الصف الحادي عشر" },
  { key: "karim", fullName: "كريم محمود", age: 8, parentEmail: "parent2@sarh.ps", institutionKey: "noor-center", gradeLevel: "الصف الثالث" },
  { key: "maryam", fullName: "مريم محمود", age: 14, parentEmail: "parent2@sarh.ps", institutionKey: "ufuq", gradeLevel: "الصف التاسع" },
  { key: "jana", fullName: "جنى سامي", age: 5, parentEmail: "parent2@sarh.ps", institutionKey: "zohour", gradeLevel: "KG 1" },
];

interface ClassFixture {
  key: string;
  name: string;
  subject: string;
  gradeLevel: string;
  institutionKey: string;
  teacherEmail: string;
  room: string;
  capacity: number;
  planProgress: number;
}

const CLASSES: ClassFixture[] = [
  { key: "c-math-10", name: "رياضيات — التوجيهي العلمي", subject: "الرياضيات", gradeLevel: "الصف الثاني عشر", institutionKey: "noor-center", teacherEmail: "teacher@sarh.ps", room: "قاعة أ", capacity: 24, planProgress: 78 },
  { key: "c-phys-11", name: "فيزياء — الحادي عشر", subject: "الفيزياء", gradeLevel: "الصف الحادي عشر", institutionKey: "noor-center", teacherEmail: "teacher@sarh.ps", room: "قاعة ب", capacity: 20, planProgress: 64 },
  { key: "c-arabic-8", name: "لغة عربية — الثامن", subject: "اللغة العربية", gradeLevel: "الصف الثامن", institutionKey: "noor-center", teacherEmail: "teacher2@sarh.ps", room: "قاعة ج", capacity: 22, planProgress: 55 },
  { key: "c-engl-5", name: "لغة إنجليزية — الخامس", subject: "اللغة الإنجليزية", gradeLevel: "الصف الخامس", institutionKey: "noor-center", teacherEmail: "teacher3@sarh.ps", room: "قاعة د", capacity: 18, planProgress: 82 },
  { key: "c-sci-3", name: "علوم — الثالث", subject: "العلوم", gradeLevel: "الصف الثالث", institutionKey: "noor-center", teacherEmail: "teacher2@sarh.ps", room: "قاعة هـ", capacity: 20, planProgress: 47 },
  { key: "c-kg2", name: "تأسيس لغوي — KG2", subject: "التأسيس اللغوي", gradeLevel: "KG 2", institutionKey: "baraem", teacherEmail: "teacher3@sarh.ps", room: "قاعة الفراشات", capacity: 16, planProgress: 70 },
  { key: "c-mat-9", name: "رياضيات — التاسع", subject: "الرياضيات", gradeLevel: "الصف التاسع", institutionKey: "ufuq", teacherEmail: "teacher2@sarh.ps", room: "قاعة 1", capacity: 25, planProgress: 61 },
  { key: "c-eng-6", name: "إنجليزي — السادس", subject: "اللغة الإنجليزية", gradeLevel: "الصف السادس", institutionKey: "ufuq", teacherEmail: "teacher3@sarh.ps", room: "قاعة 2", capacity: 20, planProgress: 58 },
  { key: "c-arab-11", name: "عربي — الحادي عشر", subject: "اللغة العربية", gradeLevel: "الصف الحادي عشر", institutionKey: "riyada", teacherEmail: "teacher@sarh.ps", room: "قاعة كبرى", capacity: 30, planProgress: 44 },
  { key: "c-kg1", name: "أنشطة حسية — KG1", subject: "الأنشطة الحسية", gradeLevel: "KG 1", institutionKey: "zohour", teacherEmail: "teacher3@sarh.ps", room: "قاعة الشمس", capacity: 14, planProgress: 66 },
];

/** Which student sits in which class (drives rosters and per-class attendance). */
const CLASS_MEMBERSHIP: Record<string, string[]> = {
  "c-math-10": ["adam"],
  "c-phys-11": ["adam"],
  "c-arabic-8": ["yousef"],
  "c-engl-5": ["leen"],
  "c-sci-3": ["karim"],
  "c-kg2": ["sara"],
  "c-mat-9": ["maryam"],
  "c-eng-6": ["omar"],
  "c-arab-11": ["adam"],
  "c-kg1": ["jana"],
};

const SUBJECTS = ["الرياضيات", "اللغة العربية", "اللغة الإنجليزية", "العلوم"];

const SUBJECT_FOCUS: Record<string, string> = {
  "الرياضيات": "حل المعادلات التربيعية وتحليل النتائج",
  "اللغة العربية": "تحليل النصوص الشعرية وقواعد الإعراب",
  "اللغة الإنجليزية": "الزمن الماضي البسيط والمفردات الوظيفية",
  "العلوم": "دورة الماء وأثرها على البيئة المحلية",
  "الفيزياء": "قوانين نيوتن وتطبيقاتها العملية",
  "التأسيس اللغوي": "التمييز بين الحروف المتشابهة رسماً",
  "الأنشطة الحسية": "التصنيف حسب اللون والحجم",
};

const MEALS = ["أرز بخضار ودجاج", "شوربة عدس وخبز", "مكرونة بالجبن وسلطة", "فول وبيض", "سمك مشوي وأرز"];
const PICKUP = ["الأم", "الأب", "الجد", "الخالة"];

/** The day's programme as a teacher records it — drives the parent feed timeline. */
const DAY_PLAN_CENTER = [
  "08:00 — طابور صباحي وتوزيع الجدول",
  "08:30 — الحصة الأولى: شرح وتطبيق مباشر",
  "10:00 — استراحة ونشاط حر",
  "11:00 — الحصة الثانية: تدريبات فردية",
  "12:00 — حصة تقوية للطلبة المتعثرين",
];
const DAY_PLAN_KG = [
  "08:00 — استقبال الأطفال ونشاط تمهيدي",
  "08:45 — حلقة الصباح: الحروف والأرقام",
  "10:00 — وجبة خفيفة ولعب حر",
  "11:00 — نشاط فني أو حركي",
  "12:00 — قراءة قصة وتهيئة للعودة",
];

/** Homework templates; the `done` flag is derived per child, not stored twice. */
const HOMEWORK_TEMPLATES = [
  { title: "حل تمارين الوحدة الحالية", subject: "الرياضيات" },
  { title: "قراءة نص وكتابة ملخص قصير", subject: "اللغة العربية" },
  { title: "حفظ عشر كلمات جديدة واستخدامها", subject: "اللغة الإنجليزية" },
  { title: "رسم دورة الماء وتسمية مراحلها", subject: "العلوم" },
  { title: "تدريب على كتابة الحروف الموصولة", subject: "التأسيس اللغوي" },
];

const REVIEW_NOTES = [
  "الخطة متوافقة مع الأهداف، يُفضّل إضافة نشاط تقويمي في آخر الحصة.",
  "أضف أهدافاً قابلة للقياس لكل فقرة، وأعد رفع الخطة.",
  "ممتاز — الأنشطة التفاعلية مناسبة لمستوى الصف وتم اعتمادها.",
  "ينقصها تحديد الواجب المنزلي وتوزيع الزمن داخل الحصة.",
];

const EVAL_NOTES = [
  "إدارة صف قوية وتفاعل واضح من الطلبة، مع حاجة لتنويع أساليب التقويم.",
  "تحضير متميز وتوظيف جيد للتكنولوجيا داخل الحصة.",
  "ننصح بزيادة الأنشطة العملية ودعم الطلبة المتعثرين داخل الحصة.",
];

const SIGNALS: { kind: SignalKind; title: string; detail: string; institutionKey?: string }[] = [
  { kind: "ALERT", title: "تأخر رفع خطة الأسبوع القادم", detail: "ثلاث خطط ما زالت بانتظار الرفع في مركز النور.", institutionKey: "noor-center" },
  { kind: "ACHIEVEMENT", title: "ارتفاع حضور الصف الثامن إلى 96%", detail: "تحسّن ملحوظ خلال آخر أربعة أسابيع.", institutionKey: "noor-center" },
  { kind: "INFO", title: "ورشة تقويم تكميلي", detail: "تنطلق ورشة المشرفين يوم الأحد القادم الساعة العاشرة.", institutionKey: "ufuq" },
  { kind: "ALERT", title: "انخفاض جودة الواجبات في مادة الفيزياء", detail: "متوسط درجات الواجبات أقل من 60%.", institutionKey: "noor-center" },
  { kind: "ACHIEVEMENT", title: "اعتماد ثلاث خطط دراسية بدون تعديل", detail: "خطة الرياضيات للصف الحادي عشر اعتُمدت من أول مراجعة." },
  { kind: "INFO", title: "تحديث دليل الإشراف", detail: "أضيفت معايير جديدة لتقييم إدارة الصف." },
];

const ANNOUNCEMENTS: { kind: AnnouncementKind; title: string; body: string; institutionKey?: string; daysAgo: number }[] = [
  { kind: "HOLIDAY", title: "عطلة عيد الفطر", body: "تتوقف الحصص من الأحد حتى الجمعة القادمة بمناسبة عيد الفطر المبارك.", daysAgo: 1 },
  { kind: "SCHEDULE", title: "تغيير توقيت حصص الثامن", body: "تبدأ حصص الصف الثامن من الساعة الثامنة صباحاً بدلاً من التاسعة ابتداءً من يوم غد.", institutionKey: "noor-center", daysAgo: 2 },
  { kind: "MEETING", title: "لقاء أولياء الأمور الشهري", body: "لقاء أولياء الأمور لمناقشة نتائج الربع الأول، الساعة الرابعة عصراً في قاعة الجتماعات.", institutionKey: "noor-center", daysAgo: 3 },
  { kind: "SCHEDULE", title: "برنامج التأسيس اللغوي", body: "يبدأ برنامج التأسيس اللغوي لأطفال KG2 بمعدل ثلاث حصص أسبوعياً.", institutionKey: "baraem", daysAgo: 5 },
  { kind: "MEETING", title: "اجتماع الأهالي — دير البلح", body: "اجتماع تعريفي ببرنامج الروضة للعام الدراسي الجديد.", institutionKey: "zohour", daysAgo: 6 },
  { kind: "HOLIDAY", title: "تعليق الحصص المسائية", body: "تُعلَّق الحصص المسائية ليوم واحد لأعمال الصيانة في الأكاديمية.", institutionKey: "ufuq", daysAgo: 8 },
];

/* ------------------------------------------------------------------ */
/* Site settings (unchanged behaviour)                                 */
/* ------------------------------------------------------------------ */

const SITE_SETTINGS: { key: string; value: string }[] = [
  { key: "support_phone", value: "+970 592 405 090" },
  { key: "support_whatsapp", value: "+970 592 405 090" },
  { key: "support_email", value: "hello@sarh.ps" },
  { key: "site_location", value: "غزة، فلسطين" },
];

const isProduction = process.env.NODE_ENV === "production";
const forced = process.env.SEED_FORCE === "1";

/**
 * Non-destructive: only creates the rows that are missing, never rewrites an
 * admin-edited value.
 */
async function seedSiteSettings(): Promise<number> {
  const { count } = await prisma.siteSetting.createMany({
    data: SITE_SETTINGS,
    skipDuplicates: true,
  });
  return count;
}

/* ------------------------------------------------------------------ */
/* Seed phases                                                         */
/* ------------------------------------------------------------------ */

async function seedAccounts(passwordHash: string, verifiedAt: Date) {
  const byEmail = new Map<string, { id: string; role: Role; roles: Role[] }>();

  for (const account of ACCOUNTS) {
    const user = await prisma.user.upsert({
      where: { email: account.email },
      // Re-seeding repairs the password so a stale hash can never block login.
      update: {
        passwordHash,
        fullName: account.fullName,
        role: account.role,
        roles: account.roles ?? [],
        phoneNumber: account.phoneNumber,
        emailVerified: verifiedAt,
      },
      create: {
        email: account.email,
        fullName: account.fullName,
        phoneNumber: account.phoneNumber,
        role: account.role,
        roles: account.roles ?? [],
        passwordHash,
        emailVerified: verifiedAt,
        termsAcceptedAt: verifiedAt,
      },
      select: { id: true, email: true, role: true, roles: true },
    });

    byEmail.set(user.email, { id: user.id, role: user.role, roles: user.roles });
    const tiers = [user.role, ...user.roles].join("+");
    console.log(`      ${tiers.padEnd(26)} ${user.email}`);
  }

  return byEmail;
}

/**
 * Removes every row this script created on a previous run, children first so
 * no foreign key is ever violated. Anything without the `seed-` prefix — i.e.
 * everything a real user made — is structurally out of reach here.
 */
async function clearSeedRows() {
  await prisma.dailyLog.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.subjectPerformance.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.enrollment.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.message.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.announcement.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.qualitySignal.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.teacherEvaluation.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.lessonPlan.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.timetableSlot.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.staffMember.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.schoolClass.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.directoryChecklistItem.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.paymentTransaction.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.activityEvent.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.quiz.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.student.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.institution.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

async function main() {
  // Fail fast (and loudly) when PostgreSQL is not reachable, instead of
  // printing a success message for a half-written database.
  await prisma.$connect();

  const createdSettings = await seedSiteSettings();
  console.log(`✓ site settings ensured (${createdSettings} new row(s))`);

  if (isProduction && !forced) {
    // Production guard: demo accounts share one well-known password, so
    // re-seeding must never rotate credentials on a live database.
    console.log(
      "\nNODE_ENV=production — skipping demo data to protect live data." +
        "\nOnly missing site settings were created. Set SEED_FORCE=1 to override."
    );
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
  const verifiedAt = new Date();

  console.log("\n— accounts —");
  const users = await seedAccounts(passwordHash, verifiedAt);
  const user = (email: string) => {
    const found = users.get(email);
    if (!found) throw new Error(`seed fixture references unknown account: ${email}`);
    return found;
  };

  console.log("\n— clearing previous seed rows —");
  await clearSeedRows();

  /* ---- Institutions ---------------------------------------------- */
  const institutionIds = INSTITUTIONS.map((_, index) => id("inst", index + 1));
  track("institution", institutionIds);

  await prisma.institution.createMany({
    data: INSTITUTIONS.map((fixture, index) => ({
      id: institutionIds[index],
      name: fixture.name,
      type: fixture.type,
      address: fixture.address,
      zone: fixture.zone,
      description: fixture.description,
      rating: fixture.rating,
      phone: fixture.phone,
      email: fixture.email,
      trustStatus: fixture.trustStatus,
      trustNote: fixture.trustNote ?? null,
      trustRequestedAt:
        fixture.trustStatus === "PENDING" || fixture.trustStatus === "VERIFIED"
          ? addDays(verifiedAt, -(index + 2))
          : null,
      ownerId: user(fixture.ownerEmail).id,
    })),
  });
  const institutionId = (key: string) => {
    const index = INSTITUTIONS.findIndex((entry) => entry.key === key);
    if (index === -1) throw new Error(`unknown institution fixture: ${key}`);
    return institutionIds[index];
  };
  console.log(`✓ institutions (${INSTITUTIONS.length})`);

  /* ---- Directory checklist --------------------------------------- */
  const CHECKLIST: { key: string; label: string }[] = [
    { key: "license", label: "الترخيص الرسمي من وزارة التربية" },
    { key: "photos", label: "صور حقيقية للمرافق والقاعات" },
    { key: "staff", label: "بيانات الطاقم التعليمي ومؤهلاته" },
    { key: "pricing", label: "قائمة الرسوم والخدمات المعلنة" },
    { key: "location", label: "الموقع الجغرافي وساعات العمل" },
    { key: "contact", label: "بيانات تواصل مُتحقَّق منها" },
  ];
  await prisma.directoryChecklistItem.createMany({
    data: INSTITUTIONS.flatMap((fixture, instIndex) =>
      CHECKLIST.map((item, itemIndex) => ({
        id: id("check", `${instIndex + 1}-${itemIndex + 1}`),
        institutionId: institutionIds[instIndex],
        key: item.key,
        label: item.label,
        // A verified centre has a complete profile; others have gaps, which is
        // exactly what /institution/profile reports as outstanding.
        done:
          fixture.trustStatus === "VERIFIED"
            ? true
            : itemIndex < (fixture.trustStatus === "PENDING" ? 4 : 2),
      }))
    ),
  });
  console.log(`✓ directory checklist (${INSTITUTIONS.length * CHECKLIST.length})`);

  /* ---- Staff ------------------------------------------------------ */
  const STAFF: {
    institutionKey: string;
    email: string;
    title: string;
    role: StaffRole;
    subjects: string[];
    status: StaffStatus;
  }[] = [
    { institutionKey: "noor-center", email: "center@sarh.ps", title: "مدير المركز", role: "CENTER_ADMIN", subjects: [], status: "ACTIVE" },
    { institutionKey: "noor-center", email: "teacher@sarh.ps", title: "معلمة رياضيات وفيزياء", role: "TEACHER", subjects: ["الرياضيات", "الفيزياء"], status: "ACTIVE" },
    { institutionKey: "noor-center", email: "teacher2@sarh.ps", title: "معلم لغة عربية", role: "TEACHER", subjects: ["اللغة العربية", "العلوم"], status: "ACTIVE" },
    { institutionKey: "noor-center", email: "teacher3@sarh.ps", title: "معلمة لغة إنجليزية", role: "TEACHER", subjects: ["اللغة الإنجليزية"], status: "ON_LEAVE" },
    // The supervisor holds a membership in the centre they oversee, so the
    // supervision scope resolves to real institutions instead of falling back
    // to platform-wide — the demo exercises the isolation it ships.
    { institutionKey: "noor-center", email: "supervisor@sarh.ps", title: "مشرفة تربوية", role: "SUPERVISOR", subjects: [], status: "ACTIVE" },
    { institutionKey: "baraem", email: "center@sarh.ps", title: "مديرة الروضة", role: "CENTER_ADMIN", subjects: [], status: "ACTIVE" },
    { institutionKey: "baraem", email: "teacher3@sarh.ps", title: "معلمة تأسيس", role: "TEACHER", subjects: ["التأسيس اللغوي"], status: "ACTIVE" },
    { institutionKey: "ufuq", email: "center2@sarh.ps", title: "مدير الأكاديمية", role: "CENTER_ADMIN", subjects: [], status: "ACTIVE" },
    { institutionKey: "ufuq", email: "teacher2@sarh.ps", title: "معلم رياضيات", role: "TEACHER", subjects: ["الرياضيات"], status: "ACTIVE" },
    { institutionKey: "ufuq", email: "teacher3@sarh.ps", title: "معلمة إنجليزي", role: "TEACHER", subjects: ["اللغة الإنجليزية"], status: "ACTIVE" },
    { institutionKey: "zohour", email: "center2@sarh.ps", title: "مديرة الروضة", role: "CENTER_ADMIN", subjects: [], status: "ACTIVE" },
    { institutionKey: "zohour", email: "teacher3@sarh.ps", title: "معلمة أنشطة", role: "TEACHER", subjects: ["الأنشطة الحسية"], status: "INACTIVE" },
    { institutionKey: "riyada", email: "center@sarh.ps", title: "مدير المركز", role: "CENTER_ADMIN", subjects: [], status: "ACTIVE" },
    { institutionKey: "riyada", email: "teacher@sarh.ps", title: "معلمة لغة عربية", role: "TEACHER", subjects: ["اللغة العربية"], status: "ACTIVE" },
  ];
  await prisma.staffMember.createMany({
    data: STAFF.map((row, index) => ({
      id: id("staff", index + 1),
      userId: user(row.email).id,
      institutionId: institutionId(row.institutionKey),
      title: row.title,
      role: row.role,
      subjects: row.subjects,
      status: row.status,
      joinedAt: addDays(verifiedAt, -(60 + index * 7)),
    })),
  });
  console.log(`✓ staff members (${STAFF.length})`);

  /* ---- Classes ---------------------------------------------------- */
  const classIds = CLASSES.map((_, index) => id("cls", index + 1));
  await prisma.schoolClass.createMany({
    data: CLASSES.map((fixture, index) => ({
      id: classIds[index],
      name: fixture.name,
      subject: fixture.subject,
      gradeLevel: fixture.gradeLevel,
      capacity: fixture.capacity,
      institutionId: institutionId(fixture.institutionKey),
      teacherId: user(fixture.teacherEmail).id,
      planProgress: fixture.planProgress,
      room: fixture.room,
    })),
  });
  const classId = (key: string) => {
    const index = CLASSES.findIndex((entry) => entry.key === key);
    if (index === -1) throw new Error(`unknown class fixture: ${key}`);
    return classIds[index];
  };
  console.log(`✓ classes (${CLASSES.length})`);

  /* ---- Timetable (the demo teacher's week) ------------------------ */
  const TEACHER_DAY: { startsAt: string; endsAt: string; classKey: string }[] = [
    { startsAt: "08:00", endsAt: "08:45", classKey: "c-math-10" },
    { startsAt: "09:00", endsAt: "09:45", classKey: "c-phys-11" },
    { startsAt: "10:00", endsAt: "10:45", classKey: "c-math-10" },
    { startsAt: "11:00", endsAt: "11:45", classKey: "c-arab-11" },
    { startsAt: "12:00", endsAt: "12:45", classKey: "c-phys-11" },
  ];
  const slots = [0, 1, 2, 3, 4].flatMap((weekday) =>
    TEACHER_DAY.map((slot, slotIndex) => ({
      id: id("slot", `${weekday}-${slotIndex}`),
      teacherId: user("teacher@sarh.ps").id,
      classId: classId(slot.classKey),
      weekday,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      subject: CLASSES.find((entry) => entry.key === slot.classKey)!.subject,
      room: CLASSES.find((entry) => entry.key === slot.classKey)!.room,
    }))
  );
  await prisma.timetableSlot.createMany({ data: slots });
  console.log(`✓ timetable slots (${slots.length})`);

  /* ---- Students --------------------------------------------------- */
  const studentIds = STUDENTS.map((_, index) => id("stu", index + 1));
  const now = new Date();
  await prisma.student.createMany({
    data: STUDENTS.map((fixture, index) => ({
      id: studentIds[index],
      fullName: fixture.fullName,
      dateOfBirth: new Date(
        Date.UTC(now.getUTCFullYear() - fixture.age, (index % 12) + 1, ((index * 3) % 27) + 1)
      ),
      parentId: user(fixture.parentEmail).id,
    })),
  });
  const studentId = (key: string) => {
    const index = STUDENTS.findIndex((entry) => entry.key === key);
    if (index === -1) throw new Error(`unknown student fixture: ${key}`);
    return studentIds[index];
  };
  console.log(`✓ students (${STUDENTS.length})`);

  /* ---- Enrollments ------------------------------------------------ */
  const ENROLLMENT_STATUS: PaymentStatus[] = ["VERIFIED", "VERIFIED", "PENDING", "VERIFIED", "PENDING", "VERIFIED", "REJECTED", "VERIFIED", "PENDING", "VERIFIED"];
  const enrollments = STUDENTS.map((fixture, index) => ({
    id: id("enr", index + 1),
    studentId: studentIds[index],
    institutionId: institutionId(fixture.institutionKey),
    gradeLevel: fixture.gradeLevel,
    classId: classId(Object.entries(CLASS_MEMBERSHIP).find(([, members]) => members.includes(fixture.key))![0]),
    commissionFee: 45 + (index % 4) * 15,
    status: ENROLLMENT_STATUS[index % ENROLLMENT_STATUS.length],
  }));
  await prisma.enrollment.createMany({ data: enrollments });
  console.log(`✓ enrollments (${enrollments.length})`);

  /* ---- Daily logs (last 30 school days per child) ------------------ */
  const schoolDays = recentSchoolDays(now, 20);
  const logs: {
    id: string;
    studentId: string;
    institutionId: string;
    date: Date;
    attendance: boolean;
    lateMinutes: number;
    meals: string;
    activityPhotos: string[];
    pickupPerson: string;
    aiSummary: string;
    gradesJson: Record<string, number>;
    dayPlan: string[];
    homework: { title: string; subject: string; done: boolean }[];
    teacherNote: string;
  }[] = [];

  STUDENTS.forEach((fixture, studentIndex) => {
    schoolDays.forEach((day, dayIndex) => {
      // Deterministic, realistic variance: ~1 absence and ~1 late arrival per
      // fortnight, so the attendance meters and alerts have something to show.
      const seedValue = (studentIndex * 7 + dayIndex * 13) % 23;
      const attendance = seedValue !== 5;
      const lateMinutes = attendance && seedValue === 9 ? 15 : 0;
      const grade = 62 + ((studentIndex * 11 + dayIndex * 7) % 36);

      logs.push({
        id: id("log", `${studentIndex + 1}-${dayIndex + 1}`),
        studentId: studentIds[studentIndex],
        institutionId: institutionId(fixture.institutionKey),
        date: new Date(day.getTime() + 8 * 60 * 60 * 1000),
        attendance,
        lateMinutes,
        meals: MEALS[(studentIndex + dayIndex) % MEALS.length],
        // Real, servable URLs (copies of the bundled activity shots live in
        // `public/feed/`), so a row read out of PostgreSQL renders the same
        // photo grid the bundled fixtures used to.
        activityPhotos: attendance
          ? [
              `/feed/activity-${((studentIndex + dayIndex) % 3) + 1}.webp`,
              ...(dayIndex % 3 === 0
                ? [`/feed/activity-${((studentIndex + dayIndex + 1) % 3) + 1}.webp`]
                : []),
            ]
          : [],
        pickupPerson: PICKUP[(studentIndex + dayIndex) % PICKUP.length],
        aiSummary: attendance
          ? `شارك ${fixture.fullName} في نشاط ${SUBJECTS[dayIndex % SUBJECTS.length]} وأنجز المهام المطلوبة بدرجة ${grade}.`
          : `لم يحضر ${fixture.fullName} هذا اليوم، وتم إرسال تنبيه لولي الأمر.`,
        gradesJson: { [SUBJECTS[dayIndex % SUBJECTS.length]]: grade },
        // The kindergarten programme is the real one for KG children; the
        // centres' programme for everyone else.
        dayPlan: INSTITUTIONS.find((entry) => entry.key === fixture.institutionKey)!.type === "KINDERGARTEN"
          ? DAY_PLAN_KG
          : DAY_PLAN_CENTER,
        homework: [0, 1, 2].map((offset) => {
          const template = HOMEWORK_TEMPLATES[(studentIndex + dayIndex + offset) % HOMEWORK_TEMPLATES.length];
          return {
            title: template.title,
            subject: template.subject,
            // Most work is handed in; one item per child is still outstanding,
            // which is what the dashboard's "tasks to follow up" counter counts.
            done: (studentIndex + dayIndex + offset) % 6 !== 0,
          };
        }),
        teacherNote: attendance
          ? (dayIndex % 4 === 0 ? "مشاركة ممتازة في النقاش الصفي." : "")
          : "بانتظار توضيح سبب الغياب من ولي الأمر.",
      });
    });
  });

  // createMany in chunks keeps the statement well under the parameter limit.
  for (let i = 0; i < logs.length; i += 200) {
    await prisma.dailyLog.createMany({ data: logs.slice(i, i + 200) });
  }
  console.log(`✓ daily logs (${logs.length})`);

  /* ---- Subject performance --------------------------------------- */
  const performance = STUDENTS.flatMap((fixture, studentIndex) =>
    SUBJECTS.map((subject, subjectIndex) => ({
      id: id("perf", `${studentIndex + 1}-${subjectIndex + 1}`),
      studentId: studentIds[studentIndex],
      subject,
      term: "الفصل الأول 2026",
      score: 68 + ((studentIndex * 9 + subjectIndex * 5) % 31),
      classAverage: 72 + ((studentIndex + subjectIndex) % 8),
    }))
  );
  await prisma.subjectPerformance.createMany({ data: performance });
  console.log(`✓ subject performance rows (${performance.length})`);

  /* ---- Lesson plans ---------------------------------------------- */
  const PLAN_STATUS: PlanStatus[] = ["APPROVED", "PENDING", "REVISION", "PENDING", "APPROVED", "PENDING", "APPROVED", "REVISION", "PENDING", "APPROVED", "PENDING", "APPROVED"];
  const plans = PLAN_STATUS.map((status, index) => {
    const fixture = CLASSES[index % CLASSES.length];
    const subject = fixture.subject;
    return {
      id: id("plan", index + 1),
      title: `${subject} — ${fixture.gradeLevel}`,
      subject,
      gradeLevel: fixture.gradeLevel,
      objectives: SUBJECT_FOCUS[subject] ?? `تحقيق أهداف ${subject} للوحدة الحالية`,
      scheduledFor: addDays(now, index - 5),
      status,
      authorId: user(fixture.teacherEmail).id,
      institutionId: institutionId(fixture.institutionKey),
      classId: classIds[index % CLASSES.length],
      reviewerId: status === "PENDING" ? null : user("supervisor@sarh.ps").id,
      reviewNote: status === "PENDING" ? null : REVIEW_NOTES[index % REVIEW_NOTES.length],
      reviewedAt: status === "PENDING" ? null : addDays(now, -1 - (index % 4)),
      // Deterministic spread across the range the AI pre-check reports, so the
      // supervisor queue has both ready and thin plans to sort through.
      completeness: 58 + ((index * 7) % 42),
    };
  });
  await prisma.lessonPlan.createMany({ data: plans });
  console.log(`✓ lesson plans (${plans.length})`);

  /* ---- Teacher evaluations --------------------------------------- */
  const teacherEmails = ["teacher@sarh.ps", "teacher2@sarh.ps", "teacher3@sarh.ps"];
  const evaluations = teacherEmails.flatMap((email, index) => [
    {
      id: id("eval", `${index + 1}-a`),
      teacherId: user(email).id,
      supervisorId: user("supervisor@sarh.ps").id,
      periodLabel: "الفصل الأول 2026",
      classroomVisits: 3 + index,
      score: 78 + index * 6,
      notes: EVAL_NOTES[index % EVAL_NOTES.length],
      createdAt: addDays(now, -(7 + index * 3)),
    },
    {
      id: id("eval", `${index + 1}-b`),
      teacherId: user(email).id,
      supervisorId: user("supervisor@sarh.ps").id,
      periodLabel: "الفصل الثاني 2026",
      classroomVisits: 1 + index,
      score: 74 + index * 5,
      notes: EVAL_NOTES[(index + 1) % EVAL_NOTES.length],
      createdAt: addDays(now, -(2 + index)),
    },
  ]);
  await prisma.teacherEvaluation.createMany({ data: evaluations });
  console.log(`✓ teacher evaluations (${evaluations.length})`);

  /* ---- Quality signals ------------------------------------------- */
  const signals = SIGNALS.map((fixture, index) => ({
    id: id("signal", index + 1),
    kind: fixture.kind,
    title: fixture.title,
    detail: fixture.detail,
    scopeOwnerId: user("supervisor@sarh.ps").id,
    institutionId: fixture.institutionKey ? institutionId(fixture.institutionKey) : null,
    subjectUserId: null,
    createdAt: addDays(now, -(index + 1)),
  }));
  await prisma.qualitySignal.createMany({ data: signals });
  console.log(`✓ quality signals (${signals.length})`);

  /* ---- Quizzes ---------------------------------------------------- */
  const QUIZ_TEMPLATES: { subject: string; lesson: string; difficulty: string; questionsJson: Record<string, unknown> }[] = [
    {
      subject: "الرياضيات",
      lesson: "المعادلات التربيعية",
      difficulty: "متوسط",
      questionsJson: {
        questions: [
          { q: "ما جذور المعادلة x² − 5x + 6 = 0؟", choices: ["2 و 3", "1 و 6", "−2 و −3", "5 و 6"], answer: 0 },
          { q: "ما مميز المعادلة x² + 2x + 1 = 0؟", choices: ["0", "4", "−4", "1"], answer: 0 },
          { q: "أي القيم تحقق x² = 16؟", choices: ["4 و −4", "4 فقط", "8 و −8", "16 فقط"], answer: 0 },
        ],
      },
    },
    {
      subject: "اللغة العربية",
      lesson: "كان وأخواتها",
      difficulty: "سهل",
      questionsJson: {
        questions: [
          { q: "«كان» فعل ناسخ يرفع المبتدأ ويُنصب…", choices: ["الخبر", "الفاعل", "المفعول", "الحال"], answer: 0 },
          { q: "أي الأفعال ناسخ؟", choices: ["أصبح", "كتب", "قرأ", "خرج"], answer: 0 },
        ],
      },
    },
    {
      subject: "العلوم",
      lesson: "دورة الماء",
      difficulty: "متوسط",
      questionsJson: {
        questions: [
          { q: "ما اسم تحوّل الماء من الحالة السائلة إلى الغازية؟", choices: ["التبخر", "التكاثف", "التجمد", "الترسيب"], answer: 0 },
          { q: "تشكّل السحب مثال على…", choices: ["التكاثف", "التبخر", "التسامي", "الانصهار"], answer: 0 },
        ],
      },
    },
  ];
  // The array is typed explicitly rather than inferred, because `authorId` is
  // null for the platform templates and a string for the teacher-authored one.
  const quizzes: {
    id: string;
    subject: string;
    lesson: string;
    difficulty: string;
    questionsJson: { questions: { q: string; choices: string[]; answer: number }[] };
    authorId: string | null;
    createdAt: Date;
  }[] = QUIZ_TEMPLATES.map((template, index) => ({
    id: id("quiz", index + 1),
    subject: template.subject,
    lesson: template.lesson,
    difficulty: template.difficulty,
    questionsJson: template.questionsJson as {
      questions: { q: string; choices: string[]; answer: number }[];
    },
    authorId: null,
    createdAt: addDays(now, -(index + 1)),
  }));
  quizzes.push({
    id: id("quiz", 10),
    subject: "الفيزياء",
    lesson: "قوانين نيوتن",
    difficulty: "صعب",
    questionsJson: QUIZ_TEMPLATES[2].questionsJson as {
      questions: { q: string; choices: string[]; answer: number }[];
    },
    authorId: user("teacher@sarh.ps").id,
    createdAt: addDays(now, -1),
  });
  await prisma.quiz.createMany({ data: quizzes });
  console.log(`✓ quizzes (${quizzes.length})`);

  /* ---- Announcements --------------------------------------------- */
  const announcements = ANNOUNCEMENTS.map((fixture, index) => ({
    id: id("ann", index + 1),
    kind: fixture.kind,
    title: fixture.title,
    body: fixture.body,
    institutionId: fixture.institutionKey ? institutionId(fixture.institutionKey) : null,
    publishedAt: addDays(now, -fixture.daysAgo),
  }));
  await prisma.announcement.createMany({ data: announcements });
  console.log(`✓ announcements (${announcements.length})`);

  /* ---- Direct messages ------------------------------------------- */
  const MESSAGES: { from: string; to: string; subject: string; body: string; read: boolean; daysAgo: number }[] = [
    {
      from: "center@sarh.ps",
      to: "parent@sarh.ps",
      subject: "تقرير الأسبوع",
      body: "أنجز يوسف واجبات الأسبوع كاملة، وننصح بتثبيت جدول مراجعة يومي قبل الاختبار.",
      read: false,
      daysAgo: 1,
    },
    {
      from: "teacher@sarh.ps",
      to: "parent@sarh.ps",
      subject: "خطة مراجعة الفيزياء",
      body: "أرفقت خطة مراجعة الفصل الثاني، ونحتاج تأكيد حضور حصة التقوية يوم الثلاثاء.",
      read: false,
      daysAgo: 2,
    },
    {
      from: "center2@sarh.ps",
      to: "parent2@sarh.ps",
      subject: "موعد لقاء الأهالي",
      body: "نذكّركم بلقاء الأهالي يوم الخميس الساعة الرابعة عصراً في قاعة الاجتماعات.",
      read: true,
      daysAgo: 4,
    },
    {
      from: "parent2@sarh.ps",
      to: "center2@sarh.ps",
      subject: "استفسار عن الرسوم",
      body: "هل يمكن تقسيط الرسوم على دفعتين؟",
      read: true,
      daysAgo: 6,
    },
  ];
  await prisma.message.createMany({
    data: MESSAGES.map((row, index) => ({
      id: id("msg", index + 1),
      fromUserId: user(row.from).id,
      toUserId: user(row.to).id,
      subject: row.subject,
      body: row.body,
      readAt: row.read ? addDays(now, -row.daysAgo + 1) : null,
      createdAt: addDays(now, -row.daysAgo),
    })),
  });
  console.log(`✓ messages (${MESSAGES.length})`);

  /* ---- Payment transactions -------------------------------------- */
  const RECEIPTS: { email: string; institutionKey: string; amount: number; status: PaymentStatus; daysAgo: number; note?: string }[] = [
    { email: "parent@sarh.ps", institutionKey: "noor-center", amount: 850, status: "VERIFIED", daysAgo: 12, note: "تم التحقق من مطابقة المبلغ" },
    { email: "parent@sarh.ps", institutionKey: "noor-center", amount: 620, status: "PENDING", daysAgo: 1 },
    { email: "parent2@sarh.ps", institutionKey: "ufuq", amount: 540, status: "PENDING", daysAgo: 2 },
    { email: "parent2@sarh.ps", institutionKey: "zohour", amount: 700, status: "VERIFIED", daysAgo: 9, note: "إيصال واضح ومطابق" },
    { email: "parent@sarh.ps", institutionKey: "riyada", amount: 300, status: "REJECTED", daysAgo: 5, note: "مبلغ الإيصال لا يطابق الرسوم المعلنة" },
    { email: "parent2@sarh.ps", institutionKey: "noor-center", amount: 1150, status: "PENDING", daysAgo: 1 },
    { email: "center@sarh.ps", institutionKey: "noor-center", amount: 2200, status: "VERIFIED", daysAgo: 20, note: "عمولة الربع الأول" },
    { email: "center2@sarh.ps", institutionKey: "ufuq", amount: 1750, status: "VERIFIED", daysAgo: 18, note: "عمولة الربع الأول" },
    { email: "parent@sarh.ps", institutionKey: "baraem", amount: 480, status: "VERIFIED", daysAgo: 7, note: "رسوم برنامج التأسيس" },
    { email: "parent2@sarh.ps", institutionKey: "ufuq", amount: 960, status: "REJECTED", daysAgo: 15, note: "صورة الإيصال غير مقروءة" },
    { email: "parent@sarh.ps", institutionKey: "noor-center", amount: 540, status: "PENDING", daysAgo: 3 },
    { email: "center@sarh.ps", institutionKey: "riyada", amount: 900, status: "PENDING", daysAgo: 4 },
  ];
  await prisma.paymentTransaction.createMany({
    data: RECEIPTS.map((row, index) => ({
      id: id("pay", index + 1),
      userId: user(row.email).id,
      institutionId: institutionId(row.institutionKey),
      // A real, servable path (the receipt images are served from
      // `public/finance/`), so the OCR workspace can actually load the file
      // it is asking a reviewer to adjudicate.
      receiptUrl: `/finance/receipt-${(index % 3) + 1}.webp`,
      amount: row.amount,
      status: row.status,
      ocrData: {
        extractedAmount: row.status === "REJECTED" ? row.amount - 120 : row.amount,
        confidence: row.status === "VERIFIED" ? 0.97 : 0.82,
        currency: "ILS",
        receiptDate: addDays(now, -row.daysAgo).toISOString().slice(0, 10),
        merchant: INSTITUTIONS.find((entry) => entry.key === row.institutionKey)!.name,
      },
      reviewNote: row.note ?? null,
      reviewedAt: row.status === "PENDING" ? null : addDays(now, -row.daysAgo + 1),
      createdAt: addDays(now, -row.daysAgo),
    })),
  });
  console.log(`✓ payment transactions (${RECEIPTS.length})`);

  /* ---- Activity feed --------------------------------------------- */
  const activity: {
    id: string;
    type: ActivityType;
    label: string;
    amount: number | null;
    actorId: string | null;
    institutionId: string | null;
    createdAt: Date;
  }[] = [];
  const ACTIVITY_TYPES: ActivityType[] = ["SIGNUP", "ENROLLMENT", "PAYMENT", "VERIFICATION"];
  for (let day = 0; day < 60; day += 1) {
    const perDay = 1 + (day % 3);
    for (let event = 0; event < perDay; event += 1) {
      const type = ACTIVITY_TYPES[(day + event) % ACTIVITY_TYPES.length];
      const fixture = INSTITUTIONS[(day + event) % INSTITUTIONS.length];
      const when = addDays(now, -day);
      when.setHours(9 + event * 3, 15, 0, 0);
      activity.push({
        id: id("act", `${day + 1}-${event + 1}`),
        type,
        label:
          type === "SIGNUP"
            ? "حساب جديد على المنصة"
            : type === "ENROLLMENT"
              ? `تسجيل جديد في ${fixture.name}`
              : type === "PAYMENT"
                ? "إيصال دفع بانتظار المراجعة"
                : `طلب توثيق من ${fixture.name}`,
        amount: type === "PAYMENT" ? 300 + ((day * 37) % 900) : null,
        actorId: day % 2 === 0 ? user("parent@sarh.ps").id : null,
        institutionId: type === "SIGNUP" ? null : institutionId(fixture.key),
        createdAt: when,
      });
    }
  }
  for (let i = 0; i < activity.length; i += 200) {
    await prisma.activityEvent.createMany({ data: activity.slice(i, i + 200) });
  }
  console.log(`✓ activity events (${activity.length})`);

  console.log(`\nSeed complete — password for all accounts: ${DEMO_PASSWORD}`);
  console.log(
    `Totals: ${ACCOUNTS.length} accounts, ${INSTITUTIONS.length} institutions, ${STUDENTS.length} students, ` +
      `${logs.length} daily logs, ${plans.length} lesson plans, ${RECEIPTS.length} receipts.`
  );
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
