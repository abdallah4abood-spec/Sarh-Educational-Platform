import type { Metadata } from "next";

import ForgotPasswordForm from "./forgot-password-form";

export const metadata: Metadata = {
  // The root layout's title template appends the brand; naming it here too
  // rendered "استعادة كلمة المرور | صَرْح | صَرْح".
  title: "استعادة كلمة المرور",
  description:
    "أدخل البريد الإلكتروني أو رقم الجوال المسجّل في منصة صَرْح لاستلام رابط آمن لتعيين كلمة مرور جديدة.",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
