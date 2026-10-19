import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthRouteFallback } from "@/components/auth/auth-route-fallback";
import SigninForm from "./signin-form";

export const metadata: Metadata = {
  // No "| صَرْح" here: the root layout's title template already appends it,
  // and repeating it produced "تسجيل الدخول | صَرْح | صَرْح" in the tab.
  title: "تسجيل الدخول",
  description:
    "سجّل الدخول إلى منصة صَرْح بحساب ولي الأمر أو المركز التعليمي أو المعلم، وتابع الحضور والأنشطة والرسوم.",
};

/**
 * Sign-in route. The form reads `callbackUrl`, `verified` and `unverified`
 * from the query string, so it is mounted inside Suspense — required by
 * Next.js for `useSearchParams()` during static prerendering.
 */
export default function SigninPage() {
  return (
    <Suspense fallback={<AuthRouteFallback />}>
      <SigninForm />
    </Suspense>
  );
}
