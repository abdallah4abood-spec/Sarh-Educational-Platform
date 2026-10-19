import type { Metadata } from "next";

import { DirectoryView } from "@/components/directory/directory-view";

export const metadata: Metadata = {
  title: "المراكز التعليمية والمدارس",
  description:
    "دليل شامل للمراكز التعليمية والمدارس الخاصة في فلسطين: بحث حسب المنطقة ونوع المركز والمرحلة الدراسية والتقييم ونطاق السعر، مع تقييمات حقيقية من أولياء الأمور.",
  alternates: { canonical: "/explore/centers" },
};

/**
 * Learning centres & schools directory (`/explore/centers`).
 *
 * Split out of the old single `/explore` hub so centres and kindergartens each
 * own their own route, taxonomy, filters and hero art. The page is a thin
 * Server Component: it only pins metadata for SEO and hands the client shell a
 * `kind`, keeping the (large) interactive tree out of the server bundle.
 */
export default function CentersPage() {
  return <DirectoryView kind="centers" />;
}
