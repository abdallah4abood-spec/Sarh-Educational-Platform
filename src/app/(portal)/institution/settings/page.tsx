import type { Metadata } from "next";

import { SettingsPanel } from "@/components/portal/settings-panel";

export const metadata: Metadata = {
  title: "إعدادات المؤسسة",
  description:
    "بيانات حساب إدارة المركز وصلاحياته وإشعاراته داخل بوابة المؤسسة، مع رابط تغيير كلمة المرور.",
};

/** Institution → Settings (shared, session-backed panel). */
export default function InstitutionSettingsPage() {
  return (
    <SettingsPanel
      portalId="institution"
      lead="بيانات حساب إدارة المركز وصلاحياته وإشعارات المؤسسة — تُقرأ مباشرة من قاعدة بيانات صَرْح."
    />
  );
}
