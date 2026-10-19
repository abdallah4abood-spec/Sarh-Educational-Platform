import type { Metadata } from "next";

import { AcademyContent } from "./academy-content";

export const metadata: Metadata = {
  title: "أكاديمية المعلمين",
  description:
    "أكاديمية صَرْح للمعلمين والمشرفين: دبلومات ومسارات تدريبية معتمدة، ومساعد ذكاء اصطناعي للتخطيط والتصحيح والتقارير اليومية، وتدريب مبني على واقع مراكز غزة.",
  alternates: { canonical: "/teachers-academy" },
  openGraph: {
    type: "website",
    locale: "ar_AR",
    siteName: "صَرْح",
    title: "أكاديمية المعلمين | صَرْح",
    description:
      "انضم كمعلم إلى أكاديمية صَرْح: مسارات ودبلومات معتمدة وأدوات ذكاء اصطناعي تعمل بدون إنترنت.",
    url: "/teachers-academy",
  },
};

/**
 * Public teachers' academy landing page.
 *
 * Deliberately *not* behind `middleware.ts`: the whole point of the page is that
 * a new teacher can find it, read it, and only then decide to sign up. The CTA
 * adapts after sign-in (see `AcademyContent`), and the studio link it exposes is
 * protected separately by the `/teacher/**` portal guard.
 *
 * A thin Server Component keeps the metadata server-rendered for search, while
 * the content itself is a Client Component so the AR/EN switcher and the
 * session-aware buttons update instantly.
 */
export default function TeachersAcademyPage() {
  return <AcademyContent />;
}
