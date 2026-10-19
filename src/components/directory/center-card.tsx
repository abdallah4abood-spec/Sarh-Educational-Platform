"use client";

import { DirectoryCard } from "./directory-card";
import type { DirectoryListing } from "@/lib/data/directory";

/**
 * Learning-centre / school card.
 *
 * Thin named wrapper around the shared `DirectoryCard` — kept as its own module
 * so the centres directory and the kindergartens directory each read as an
 * explicit, self-documenting component at the call site.
 */
export function CenterCard({
  center,
  index = 0,
}: {
  center: DirectoryListing;
  index?: number;
}) {
  return <DirectoryCard listing={center} index={index} />;
}
