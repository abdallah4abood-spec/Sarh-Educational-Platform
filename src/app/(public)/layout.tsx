import type { ReactNode } from "react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

/**
 * Shared chrome for every public route — the landing page, the course
 * directory, the Discovery Hub, the center profiles and the info pages.
 *
 * It renders the one `<SiteHeader />` and the one `<SiteFooter />` the whole
 * platform uses, so navigation, portals and contact details can never drift
 * between pages. `id="site-main"` is the target of the header's skip link and
 * lets in-page anchors land below the sticky bar.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-sarh-bgLight dark:bg-sarh-bgDark">
      <SiteHeader />
      {/*
       * `tabIndex={-1}` makes the skip link actually *move* focus here
       * instead of only scrolling: activating `#site-main` puts the
       * sequential-focus starting point inside the content, so the next Tab
       * continues from the article rather than back at the top of the
       * header. `outline-none` suppresses the UA ring browsers may draw on a
       * programmatically-focused region (the global `:focus-visible` rule
       * already excludes `tabindex="-1"` targets).
       */}
      <main id="site-main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
