import type { Metadata } from "next";

import { InfoPage } from "@/components/info/info-page";

export const metadata: Metadata = {
  title: "سياسة الخصوصية",
  description:
    "كيف تجمع منصة صَرْح بيانات الأهالي والطلاب، وكيف تحمي سجلات الحضور والصور اليومية، وسياسة التخزين المحلي عند العمل بدون إنترنت.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <InfoPage
      badgeKey="legalLabel"
      titleKey="privacyTitle"
      leadKey="privacyIntro"
      metaKey="privacyUpdated"
      sections={[
        { titleKey: "privacyCollectTitle", bodyKey: "privacyCollectBody" },
        { titleKey: "privacyStudentsTitle", bodyKey: "privacyStudentsBody" },
        { titleKey: "privacyOfflineTitle", bodyKey: "privacyOfflineBody" },
        { titleKey: "privacyShareTitle", bodyKey: "privacyShareBody" },
        { titleKey: "privacyRightsTitle", bodyKey: "privacyRightsBody" },
      ]}
    />
  );
}
