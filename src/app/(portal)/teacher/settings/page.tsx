import type { Metadata } from "next";

import { SettingsPanel } from "@/components/portal/settings-panel";

export const metadata: Metadata = {
  title: "إعدادات المعلم",
  description:
    "بيانات حساب المعلم وصلاحياته وإشعاراته داخل بوابة المعلمين، مع رابط تغيير كلمة المرور.",
};

/** Teacher → Settings (shared, session-backed panel). */
export default function TeacherSettingsPage() {
  return <SettingsPanel portalId="teacher" />;
}
