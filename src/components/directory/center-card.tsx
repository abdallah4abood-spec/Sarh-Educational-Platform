"use client";

import { forwardRef } from "react";

import { DirectoryCard } from "./directory-card";
import type { DirectoryListing } from "@/lib/data/directory";

/**
 * Learning-centre / school card.
 *
 * Thin named wrapper around the shared `DirectoryCard` — kept as its own module
 * so the centres directory and the kindergartens directory each read as an
 * explicit, self-documenting component at the call site.
 *
 * The ref must be forwarded too: `AnimatePresence mode="popLayout"` attaches one
 * to whichever card it is animating out. Without this wrapper forwarding it, the
 * chain stops here and React logs "Function components cannot be given refs".
 */
export const CenterCard = forwardRef<
  HTMLElement,
  { center: DirectoryListing; index?: number }
>(function CenterCard({ center, index = 0 }, ref) {
  return <DirectoryCard ref={ref} listing={center} index={index} />;
});

CenterCard.displayName = "CenterCard";
