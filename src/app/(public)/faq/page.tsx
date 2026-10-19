import type { Metadata } from "next";

import { FaqContent } from "./faq-content";

export const metadata: Metadata = {
  title: "الأسئلة الشائعة",
  description:
    "أجوبة عن الحجز، العمل بدون إنترنت، طرق الدفع (جوال باي والتحويل البنكي)، متابعة الحضور، وإضافة مركز تعليمي إلى دليل صَرْح.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  return <FaqContent />;
}
