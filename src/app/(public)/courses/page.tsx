import type { Metadata } from "next";

import { CoursesDirectory } from "./courses-directory";

export const metadata: Metadata = {
  title: "دليل الدورات",
  description:
    "دليل دورات صَرْح المعتمدة: البرمجة والتطوير، التصميم الجرافيكي، اللغات، وإدارة الأعمال — مع المدربين والتقييمات وعدد الدروس والساعات، وفلترة فورية حسب المجال.",
  keywords: [
    "دورات تدريبية",
    "دورات برمجة",
    "تصميم جرافيكي",
    "تعلم اللغات",
    "إدارة الأعمال",
    "شهادة معتمدة",
    "دليل الدورات",
  ],
  alternates: { canonical: "/courses" },
  openGraph: {
    type: "website",
    locale: "ar_AR",
    siteName: "صَرْح",
    title: "دليل الدورات | صَرْح",
    description:
      "٢٥٠+ دورة معتمدة في البرمجة والتصميم واللغات وإدارة الأعمال، مع نخبة مدربين وشهادات إتمام موثقة.",
    images: ["/icons/icon-512.svg"],
  },
};

/**
 * Server Component on purpose: `metadata` stays server-rendered (crawlers get
 * the real Arabic title, description and canonical URL) while
 * `<CoursesDirectory />` is the client tree that flips language instantly.
 */
export default function CoursesPage() {
  return <CoursesDirectory />;
}
