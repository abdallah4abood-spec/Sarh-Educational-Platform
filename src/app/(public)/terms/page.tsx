import type { Metadata } from "next";

import { InfoPage } from "@/components/info/info-page";

export const metadata: Metadata = {
  title: "شروط الاستخدام",
  description:
    "شروط استخدام منصة صَرْح لأولياء الأمور والمراكز التعليمية: الحجز، الدفع وإيصالات التحويل، ومتابعة الحضور والتقارير اليومية.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <InfoPage
      badgeKey="legalLabel"
      titleKey="termsTitle"
      leadKey="termsIntro"
      metaKey="termsUpdated"
      sections={[
        { titleKey: "termsAccountTitle", bodyKey: "termsAccountBody" },
        { titleKey: "termsParentsTitle", bodyKey: "termsParentsBody" },
        { titleKey: "termsInstitutionsTitle", bodyKey: "termsInstitutionsBody" },
        { titleKey: "termsPaymentsTitle", bodyKey: "termsPaymentsBody" },
        { titleKey: "termsChangesTitle", bodyKey: "termsChangesBody" },
      ]}
    />
  );
}
