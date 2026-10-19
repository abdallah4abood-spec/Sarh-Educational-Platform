"use client";

import { DirectoryCard } from "./directory-card";
import type { DirectoryListing } from "@/lib/data/directory";

/**
 * Kindergarten card.
 *
 * Thin named wrapper around the shared `DirectoryCard`; see `center-card.tsx`
 * for why the two directories keep a named component each.
 */
export function KindergartenCard({
  kindergarten,
  index = 0,
}: {
  kindergarten: DirectoryListing;
  index?: number;
}) {
  return <DirectoryCard listing={kindergarten} index={index} />;
}
