import type { Metadata } from "next";

import { DirectoryView } from "@/components/directory/directory-view";
import { getDirectoryListings } from "@/lib/data/centers-db";

/**
 * Rendered per request: the listing set is the institutions table, which an
 * admin changes at any time. Prerendering it at build time would also make the
 * build depend on a live database.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "المراكز التعليمية والمدارس",
  description:
    "دليل المراكز التعليمية في فلسطين: بحث حسب المنطقة ونوع المركز والمرحلة الدراسية ونطاق السعر، مع ملف كامل لكل مركز ووسيلة تواصل مباشرة مع إدارته.",
  alternates: { canonical: "/explore/centers" },
};

/**
 * Learning centres & schools directory (`/explore/centers`).
 *
 * Split out of the old single `/explore` hub so centres and kindergartens each
 * own their own route, taxonomy, filters and hero art. This Server Component
 * loads the institution rows — the same source the profile page reads, so every
 * card links to an id that resolves — and hands the client shell a `kind` plus
 * its listings.
 */
export default async function CentersPage() {
  const listings = await getDirectoryListings("centers");

  return <DirectoryView kind="centers" listings={listings} />;
}
