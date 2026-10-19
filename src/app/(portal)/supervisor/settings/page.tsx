import type { Metadata } from "next";

import { SettingsPanel } from "@/components/portal/settings-panel";

export const metadata: Metadata = {
  title: "إعدادات الإشراف",
  description:
    "بيانات حساب المشرف وصلاحياته وإشعاراته داخل بوابة الإشراف، مع رابط تغيير كلمة المرور.",
};

/** Supervisor → Settings (shared, session-backed panel). */
export default function SupervisorSettingsPage() {
  return (
    <SettingsPanel
      portalId="supervisor"
      lead="بيانات حسابك وصلاحياتك وإشعارات الإشراف — تُقرأ مباشرة من قاعدة بيانات صَرْح."
    />
  );
}
