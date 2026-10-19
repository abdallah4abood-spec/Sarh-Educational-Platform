import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Landmark } from "lucide-react";

import { SettingsForm } from "./settings-form";

export const metadata: Metadata = {
  title: "إعدادات المنصة والتواصل",
  description:
    "تحكم في بيانات التواصل الظاهرة في الموقع: الهاتف، واتساب، البريد الإلكتروني، وموقع المنصة — محفوظة في قاعدة البيانات مع بديل من متغيرات البيئة.",
};

/**
 * Admin → Platform & contact settings (SUPER_ADMIN only, guarded by
 * `middleware.ts`). Values are persisted as `SiteSetting` rows and consumed by
 * the public footer, the contact page and `/api/settings`.
 */
export default function AdminSettingsPage() {
  return (
    <div className="mx-auto min-h-screen w-full max-w-4xl px-4 pb-20 pt-6">
      <nav className="mb-4">
        <Link
          href="/admin/finance"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-sarh-teal transition-colors hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          المركز المالي
        </Link>
      </nav>

      <header className="mb-6">
        <p className="flex items-center gap-1.5 text-xs font-bold text-sarh-teal">
          <span>صَرْح</span>
          <span className="text-slate-400">/</span>
          <span className="text-slate-500 dark:text-slate-400">الإدارة</span>
          <span className="text-slate-400">/</span>
          <span className="text-slate-500 dark:text-slate-400">الإعدادات</span>
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-sarh-navy dark:text-white">
              إعدادات المنصة والتواصل
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              هذه القيم تظهر في تذييل الموقع وفي صفحة «تواصل معنا» مباشرة بعد
              الحفظ.
            </p>
          </div>
          <span className="flex items-center gap-2 rounded-full bg-sarh-navy/10 px-4 py-1.5 text-xs font-bold text-sarh-navy ring-1 ring-inset ring-sarh-navy/25 dark:bg-white/10 dark:text-white dark:ring-white/20">
            <Landmark className="h-4 w-4" aria-hidden="true" />
            لوحة الإدارة
          </span>
        </div>
      </header>

      <SettingsForm />
    </div>
  );
}
