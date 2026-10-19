import type { Metadata } from "next";

import { ContactContent } from "./contact-form";

export const metadata: Metadata = {
  title: "تواصل معنا",
  description:
    "تواصل مع فريق منصة صَرْح: +970 599 000 000، hello@sarh.ps، غزة — فلسطين. نساعدك في الحجز، الحسابات، وإضافة مركزك إلى الدليل.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return <ContactContent />;
}
