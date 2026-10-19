"use client";

import { CoursesSection } from "@/components/sections/courses-section";
import { HeroSection } from "@/components/sections/hero-section";
import { NewsletterSection } from "@/components/sections/newsletter-section";
import { StatsSection } from "@/components/sections/stats-section";

/**
 * The course directory page body.
 *
 * This is the former `/learn` experience, now a normal route inside the
 * platform: same header, same footer, same design tokens as every other page.
 * It composes the four sections that belong to the directory — the hero, the
 * trust figures, the filterable catalogue and the newsletter — so the page
 * opens with the promise, proves it, then lists the courses.
 *
 * The platform-level arguments (why SARH, student stories) live on the home
 * page and are linked from the navigation, so they are not repeated here.
 */
export function CoursesDirectory() {
  return (
    <>
      <HeroSection />
      <StatsSection />
      <CoursesSection />
      <NewsletterSection />
    </>
  );
}
