import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthRouteFallback } from "@/components/auth/auth-route-fallback";
import SignupForm from "./signup-form";

export const metadata: Metadata = {
  // The root layout's title template appends the brand; naming it here too
  // rendered "إنشاء حساب جديد | صَرْح | صَرْح".
  title: "إنشاء حساب جديد",
  description:
    "أنشئ حساباً على منصة صَرْح كولي أمر أو مركز تعليمي أو معلم، وابدأ متابعة الحضور والأنشطة والرسوم والتقارير.",
};

/**
 * Sign-up route. The form reads `callbackUrl` from the query string, so it is
 * mounted inside Suspense — required by Next.js for `useSearchParams()` during
 * static prerendering.
 */
export default function SignupPage() {
  return (
    <Suspense fallback={<AuthRouteFallback />}>
      <SignupForm />
    </Suspense>
  );
}
