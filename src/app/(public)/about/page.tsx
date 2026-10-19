import type { Metadata } from "next";

import { InfoPage } from "@/components/info/info-page";

export const metadata: Metadata = {
  title: "من نحن",
  description:
    "صَرْح منصة فلسطينية من غزة تربط الأهالي بأفضل روضات الطفولة المبكرة ومراكز التحضير والتوجيهي، بمتابعة يومية وتقنية تعمل بدون إنترنت.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <InfoPage
      badgeKey="brand"
      titleKey="aboutTitle"
      leadKey="aboutLead"
      sections={[
        { titleKey: "aboutMissionTitle", bodyKey: "aboutMissionBody" },
        { titleKey: "aboutVisionTitle", bodyKey: "aboutVisionBody" },
      ]}
      cards={[
        {
          icon: "offline",
          titleKey: "aboutValueOfflineTitle",
          bodyKey: "aboutValueOfflineBody",
        },
        {
          icon: "trust",
          titleKey: "aboutValueTrustTitle",
          bodyKey: "aboutValueTrustBody",
        },
        {
          icon: "local",
          titleKey: "aboutValueLocalTitle",
          bodyKey: "aboutValueLocalBody",
        },
        {
          icon: "ai",
          titleKey: "aboutValueAiTitle",
          bodyKey: "aboutValueAiBody",
        },
      ]}
      cardsTitleKey="aboutValuesTitle"
    />
  );
}
