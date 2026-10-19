import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthRouteFallback } from "@/components/auth/auth-route-fallback";
import ResetPasswordForm from "./reset-password-form";

export const metadata: Metadata = {
  // The root layout's title template appends the brand; naming it here too
  // rendered "تعيين كلمة مرور جديدة | صَرْح | صَرْح".
  title: "تعيين كلمة مرور جديدة",
  description:
    "عيّن كلمة مرور جديدة لحسابك في منصة صَرْح عبر الرابط الآمن المرسل إلى بريدك الإلكتروني.",
};

/**
 * Reset route. The form reads the one-time `token` from the query string, so
 * it is mounted inside Suspense — required by Next.js for `useSearchParams()`
 * during static prerendering.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthRouteFallback />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
