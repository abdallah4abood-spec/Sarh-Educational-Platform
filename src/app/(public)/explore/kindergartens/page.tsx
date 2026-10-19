import type { Metadata } from "next";

import { DirectoryView } from "@/components/directory/directory-view";

export const metadata: Metadata = {
  title: "دليل الروضات",
  description:
    "دليل شامل للروضات المعتمدة في فلسطين: بحث حسب المحافظة ونوع الروضة والمرحلة العمرية والتقييم والسعر الشهري، مع تقييمات حقيقية من أولياء الأمور.",
  alternates: { canonical: "/explore/kindergartens" },
};

/**
 * Kindergartens directory (`/explore/kindergartens`).
 *
 * The sibling of `/explore/centers`: same server-thin + client-shell shape,
 * its own kindergarten taxonomy (public / private / Islamic / languages /
 * mixed / featured), its own age-stage filter and its own hero illustration.
 */
export default function KindergartensPage() {
  return <DirectoryView kind="kindergartens" />;
}
