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
  title: "دليل الروضات",
  description:
    "دليل الروضات في فلسطين: بحث حسب المحافظة والمرحلة العمرية والسعر الشهري، مع ملف كامل لكل روضة ووسيلة تواصل مباشرة مع إدارتها.",
  alternates: { canonical: "/explore/kindergartens" },
};

/**
 * Kindergartens directory (`/explore/kindergartens`).
 *
 * The sibling of `/explore/centers`: same server-thin + client-shell shape,
 * its own kindergarten taxonomy, its own age-stage filter and its own hero
 * illustration. Like the centres route it renders the real institution rows, so
 * a card's id is always a row the profile page can load.
 */
export default async function KindergartensPage() {
  const listings = await getDirectoryListings("kindergartens");

  return <DirectoryView kind="kindergartens" listings={listings} />;
}
