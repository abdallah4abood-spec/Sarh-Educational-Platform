import {
  Baby,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  UserCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { PortalId } from "@/lib/roles";

/**
 * Sidebar navigation per portal.
 *
 * The chrome learns what a tier may reach from here and nowhere else — the
 * dashboard never invents a link. Every `href` resolves to a real route, and
 * only to routes inside that tier's own prefix: the middleware owns the
 * authoritative guard (see `src/lib/roles.ts`), the sidebar merely reflects it,
 * so a filtered-out tier can never be teased by a link it cannot follow.
 *
 * Labels are Arabic-first like the rest of the portal screens; the shell's
 * breadcrumb and switcher use the localized labels from the portal registry.
 */

export interface PortalNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface PortalQuickLink {
  href: string;
  label: string;
}

export const PORTAL_NAV: Record<PortalId, PortalNavItem[]> = {
  parent: [
    { href: "/parent", label: "الرئيسية", icon: LayoutDashboard },
    { href: "/parent/feed", label: "متابعة اليوم", icon: Baby },
    { href: "/parent/children", label: "أبنائي", icon: Users },
    { href: "/parent/assistant", label: "المساعد الذكي", icon: Sparkles },
    { href: "/parent/settings", label: "الإعدادات", icon: Settings },
  ],
  teacher: [
    { href: "/teacher", label: "لوحة المعلم", icon: LayoutDashboard },
    { href: "/teacher/schedule", label: "جدولي اليومي", icon: CalendarDays },
    { href: "/teacher/classes", label: "الفصول الدراسية", icon: BookOpen },
    { href: "/teacher/attendance", label: "الحضور والغياب", icon: UserCheck },
    { href: "/teacher/ai-studio", label: "مساعد الذكاء الاصطناعي", icon: Sparkles },
    { href: "/teacher/settings", label: "الإعدادات", icon: Settings },
  ],
  supervisor: [
    { href: "/supervisor", label: "لوحة الإشراف", icon: LayoutDashboard },
    { href: "/supervisor/plans", label: "مراجعة الخطط", icon: ClipboardList },
    { href: "/supervisor/evaluations", label: "تقييم الأداء", icon: BarChart3 },
    { href: "/supervisor/teachers", label: "المعلمون في نطاقي", icon: Users },
    { href: "/supervisor/settings", label: "الإعدادات", icon: Settings },
  ],
  institution: [
    { href: "/institution", label: "لوحة المؤسسة", icon: LayoutDashboard },
    { href: "/institution/staff", label: "الطاقم التعليمي", icon: Users },
    { href: "/institution/enrollments", label: "التسجيلات والعمولات", icon: Wallet },
    {
      href: "/institution/ai-studio",
      label: "استوديو المعلم والذكاء الاصطناعي",
      icon: Sparkles,
    },
    { href: "/institution/profile", label: "ملف المركز في الدليل", icon: Store },
    { href: "/institution/settings", label: "الإعدادات", icon: Settings },
  ],
  admin: [
    { href: "/admin", label: "لوحة التحكم", icon: LayoutDashboard },
    { href: "/admin/institutions", label: "إدارة المؤسسات", icon: Building2 },
    { href: "/admin/trust", label: "طلبات التوثيق", icon: ShieldCheck },
    { href: "/admin/users", label: "المستخدمون", icon: Users },
    { href: "/admin/finance", label: "المدفوعات والإيصالات", icon: Wallet },
    { href: "/admin/settings", label: "إعدادات المنصة", icon: Settings },
  ],
};

/** Footer quick links — public routes every portal links back to. */
export const PORTAL_QUICK_LINKS: PortalQuickLink[] = [
  { href: "/explore/centers", label: "المراكز التعليمية" },
  { href: "/explore/kindergartens", label: "الروضات" },
  { href: "/teachers-academy", label: "أكاديمية المعلمين" },
  { href: "/about", label: "من نحن" },
  { href: "/#contact", label: "تواصل معنا" },
];

/**
 * Notification centre contents, one short feed per tier. Static by design: the
 * portals are offline-first shells, and a live badge feed arrives with the
 * notification service — until then the bell stays honest and opens the same
 * three items instead of an empty popover.
 */
export interface PortalNotification {
  id: string;
  title: string;
  body: string;
  /** HH:MM or a word like «أمس». */
  at: string;
  href: string;
}

export const PORTAL_NOTIFICATIONS: Record<PortalId, PortalNotification[]> = {
  parent: [
    {
      id: "pn-p1",
      title: "رسالة جديدة من روضة المستقبل",
      body: "تقرير اليوم جاهز للمراجعة.",
      at: "10:20",
      href: "/parent/feed",
    },
    {
      id: "pn-p2",
      title: "موعد قادم بعد يومين",
      body: "زيارة صفية لأحمد — الصف الأول الإبتدائي.",
      at: "09:05",
      href: "/parent/children",
    },
    {
      id: "pn-p3",
      title: "تم اعتماد إيصال الدفع",
      body: "أصبح الدفع مرصوداً في حساب المدرسة.",
      at: "أمس",
      href: "/parent/settings",
    },
  ],
  teacher: [
    {
      id: "pn-t1",
      title: "حان وقت حصة الرياضيات",
      body: "الصف الأول أ — قاعة ٢، تبدأ 09:15.",
      at: "09:10",
      href: "/teacher/schedule",
    },
    {
      id: "pn-t2",
      title: "٧ واجبات بانتظار التصحيح",
      body: "وحدة الكسور — الصف الثاني ب.",
      at: "08:40",
      href: "/teacher/classes",
    },
    {
      id: "pn-t3",
      title: "تم حفظ الحضور دون إنترنت",
      body: "سيُرسل السجل للخادم عند عودة الاتصال.",
      at: "08:05",
      href: "/teacher/attendance",
    },
  ],
  supervisor: [
    {
      id: "pn-s1",
      title: "٣ خطط بانتظار المراجعة",
      body: "أسبوع 12–18 تشرين الأول.",
      at: "09:40",
      href: "/supervisor/plans",
    },
    {
      id: "pn-s2",
      title: "طلب زيارة صفية",
      body: "روضة الأمل — وحدة دورة الماء.",
      at: "08:10",
      href: "/supervisor/evaluations",
    },
  ],
  institution: [
    {
      id: "pn-i1",
      title: "إيصالان بانتظار الاعتماد",
      body: "عمولات التسجيل لهذا الأسبوع.",
      at: "09:30",
      href: "/institution/enrollments",
    },
    {
      id: "pn-i2",
      title: "ملف المركز ناقص بندان",
      body: "نطاق الرسوم وشهادة الترخيص.",
      at: "08:45",
      href: "/institution/profile",
    },
    {
      id: "pn-i3",
      title: "دعوة معلّم معلّقة",
      body: "أ. منى سالم لم تقبل الدعوة بعد.",
      at: "أمس",
      href: "/institution/staff",
    },
  ],
  admin: [
    {
      id: "pn-a1",
      title: "٣ إيصالات قيد المراجعة",
      body: "مطابقة OCR جاهزة للمراجعة اليدوية.",
      at: "09:50",
      href: "/admin/finance",
    },
    {
      id: "pn-a2",
      title: "٧ طلبات توثيق مؤسسات",
      body: "بانتظار اعتماد الإدارة.",
      at: "09:15",
      href: "/admin/trust",
    },
    {
      id: "pn-a3",
      title: "حساب غير مفعّل",
      body: "عبدالله أبو عبود لم يفتح رابط التأكيد.",
      at: "أمس",
      href: "/admin/users",
    },
  ],
};

/** Unread badge counts (derived from the feed length when it is bigger). */
export const PORTAL_UNREAD: Record<PortalId, number> = {
  parent: 4,
  teacher: 3,
  supervisor: 2,
  institution: 5,
  admin: 9,
};

/**
 * Where the topbar search sends a visitor: the tier's primary *list* screen.
 * Every one of these honours `?q=`, so the box never lies about being a
 * search — including on the overview pages, which forward to the list.
 */
export const PORTAL_SEARCH_TARGET: Record<PortalId, string> = {
  parent: "/parent/children",
  teacher: "/teacher/classes",
  supervisor: "/supervisor/plans",
  institution: "/institution/staff",
  admin: "/admin/users",
};

/** The support card pinned to the bottom of every sidebar. */
export const PORTAL_SUPPORT: Record<
  PortalId,
  { title: string; body: string; cta: string; href: string }
> = {
  parent: {
    title: "تحتاج مساعدة؟",
    body: "فريق دعم صَرْح متاح لمساعدتك في متابعة أبنائك والرسوم.",
    cta: "تواصل معنا",
    href: "/#contact",
  },
  teacher: {
    title: "دعم المعلمين",
    body: "نحن هنا للاستماع إلى طلباتك التعليمية وللتنسيق مع إدارة المركز.",
    cta: "تواصل معنا",
    href: "/#contact",
  },
  supervisor: {
    title: "دعم الإشراف",
    body: "أدوات التقارير والزيارات الصفية تُجهَّز حسب نطاق إشرافك.",
    cta: "اطلب تقريراً",
    href: "/#contact",
  },
  institution: {
    title: "نجاح مؤسستك",
    body: "شهادات الجودة وملفات المعلمين تُحدَّث بالتنسيق مع إدارة المنصة.",
    cta: "تطوير الملف",
    href: "/#contact",
  },
  admin: {
    title: "متابعة المنصة",
    body: "لوحة المراقبة تعرض حالة الخدمات وقاعدة البيانات لحظياً.",
    cta: "حالة الخدمات",
    href: "/admin/settings",
  },
};
