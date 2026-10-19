import type { Metadata } from "next";

import { RetryButton } from "./retry-button";

export const metadata: Metadata = {
  title: "غير متصل بالإنترنت",
  robots: { index: false, follow: false },
};

/**
 * Offline fallback document served by the SARH service worker
 * (next-pwa `fallbacks.document`) when a navigation cannot reach the
 * network and has no cached page.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-sarh-bgDark p-6">
      <section className="sarh-card w-full max-w-md p-8 text-center">
        <div
          className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-sarh-gold/20 text-3xl"
          aria-hidden="true"
        >
          ✈️
        </div>
        <h1 className="mb-2 text-2xl font-bold text-sarh-navy dark:text-white">
          لا يوجد اتصال بالإنترنت
        </h1>
        <p className="mb-6 text-sm leading-7 text-slate-600 dark:text-slate-300">
          تعمل منصة صَرْح الآن وضع عدم الاتصال. البيانات المسجّلة محفوظة
          محلياً على جهازك وستتم مزامنتها تلقائياً عند عودة الشبكة.
        </p>
        <RetryButton />
        <p className="mt-4 text-xs text-slate-400">
          يعمل بدون إنترنت — تم الحفظ محلياً
        </p>
      </section>
    </main>
  );
}
