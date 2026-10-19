"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

import { LanguageProvider } from "@/lib/i18n/language-provider";

import { SmoothScrollProvider } from "./smooth-scroll-provider";

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Client-side providers shared by every SARH route:
 *  - next-themes → Light/Dark toggling through the `.dark` class.
 *  - next-auth   → session context for the RBAC-aware UI.
 *  - Language    → Arabic-first AR/EN dictionary + document dir switching.
 *  - SmoothScroll→ Lenis inertial scrolling wired into GSAP ScrollTrigger.
 *
 * `attribute="class"` is required so `darkMode: "class"` in
 * tailwind.config.js matches the theme set on <html>.
 *
 * Light is pinned as the product default (`defaultTheme="light"` with
 * `enableSystem={false}`): the Sarh identity is a bright desk under morning
 * daylight, so a visitor whose OS happens to be dark must still land on the
 * light theme. Dark mode remains fully available — it is simply opt-in through
 * the header toggle, and the choice is remembered in localStorage.
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <SessionProvider>
        <LanguageProvider>
          <SmoothScrollProvider>{children}</SmoothScrollProvider>
        </LanguageProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
