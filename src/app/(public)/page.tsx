import type { Metadata } from "next";

import { HomeContent } from "./home-content";

export const metadata: Metadata = {
  // `absolute` because the landing page is the brand's front door and this
  // phrase already opens with the wordmark. The root layout's `%s | صَرْح`
  // template would otherwise append it a second time and the tab read
  // "صَرْح | يجمع أهالي غزة … | صَرْح".
  title: { absolute: "صَرْح | يجمع أهالي غزة مع أفضل المراكز التعليمية" },
  description:
    "صَرْح منصة فلسطينية تربط الأهالي برواضي الطفولة المبكرة ومراكز التحضير والتوجيهي: بحث حسب المنطقة والسعر، حجز مقعد، متابعة يومية، حضور يعمل بدون إنترنت، وأدوات ذكاء اصطناعي للمعلمين.",
  alternates: { canonical: "/" },
};

/**
 * Marketing landing page (Design.md Prompt 3, Eduwave-inspired structure).
 *
 * A thin Server Component keeps `metadata` server-rendered for SEO, while
 * `<HomeContent />` is a Client Component so every string flips instantly with
 * the AR/EN toggle — the ten sections are otherwise fully static markup.
 */
export default function HomePage() {
  return <HomeContent />;
}
