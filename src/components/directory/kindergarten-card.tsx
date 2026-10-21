"use client";

import { forwardRef } from "react";

import { DirectoryCard } from "./directory-card";
import type { DirectoryListing } from "@/lib/data/directory";

/**
 * Kindergarten card.
 *
 * Thin named wrapper around the shared `DirectoryCard`; see `center-card.tsx`
 * for why the two directories keep a named component each — and for why the
 * ref has to be forwarded through this layer (AnimatePresence's popLayout).
 */
export const KindergartenCard = forwardRef<
  HTMLElement,
  { kindergarten: DirectoryListing; index?: number }
>(function KindergartenCard({ kindergarten, index = 0 }, ref) {
  return <DirectoryCard ref={ref} listing={kindergarten} index={index} />;
});

KindergartenCard.displayName = "KindergartenCard";
