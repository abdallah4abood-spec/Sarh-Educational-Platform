"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  GraduationCap,
  Languages,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Sun,
  UserPlus,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { useSmoothScroll } from "@/components/providers/smooth-scroll-provider";
import { useActiveSection } from "@/hooks/useActiveSection";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { useLanguage } from "@/lib/i18n/language-provider";
import { ROLE_HOME, ROLE_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

interface SiteNavItem {
  /** Canonical target. Section links carry the `#id` so they work without JS. */
  href: string;
  labelKey: DictionaryKey;
  /** Set only for landing-page sections watched by the scroll-spy. */
  section?: string;
}

/**
 * The primary navigation, in the order the approved design specifies:
 *
 *   الرئيسية → المراكز التعليمية → الروضات → أكاديمية المعلمين → من نحن →
 *   تواصل معنا
 *
 * Centres and kindergartens are now two sibling entries rather than one mixed
 * "explore" label, because they are two separate routes with their own taxonomy
 * (`/explore/centers`, `/explore/kindergartens`). "أكاديمية المعلمين" stays
 * ahead of "من نحن" on purpose: it is the top of the teacher funnel and the
 * page that proves Sarh trains the staff parents are about to trust.
 *
 * "تواصل معنا" now points at the standalone `/contact` page from every route,
 * matching the footer, the portal quick links and the contact band's own CTA.
 * The home page's `#contact` band is still a real anchor — it is simply no
 * longer the destination of the global navigation, so a visitor always gets
 * the full form rather than a scroll that only works on one page.
 */
const NAV_ITEMS: SiteNavItem[] = [
  { href: "/", labelKey: "nav_home" },
  { href: "/explore/centers", labelKey: "nav_centers" },
  { href: "/explore/kindergartens", labelKey: "nav_kindergartens" },
  { href: "/teachers-academy", labelKey: "nav_academy" },
  { href: "/about", labelKey: "nav_about" },
  { href: "/contact", labelKey: "nav_contact" },
];

/**
 * Landing sections watched while the visitor is on the home page. Module-level
 * so the array identity stays stable for `useActiveSection`.
 */
const HOME_SECTION_IDS = ["home"] as const;

/** Portal entries. `adminOnly` hides the console from everyone but an admin. */
const PORTALS: {
  href: string;
  labelKey: DictionaryKey;
  Icon: LucideIcon;
  adminOnly?: boolean;
}[] = [
  { href: "/parent/feed", labelKey: "nav_parent", Icon: Users },
  {
    href: "/institution/ai-studio",
    labelKey: "nav_institution",
    Icon: GraduationCap,
  },
  {
    href: "/admin/finance",
    labelKey: "nav_admin",
    Icon: LayoutDashboard,
    adminOnly: true,
  },
];

/**
 * The one and only SARH top navigation.
 *
 * Shared by every public route through `(public)/layout.tsx`, so the header can
 * never drift between pages — the previous split (a platform navbar here, a
 * microsite header there) was what made the app feel like separate sites.
 *
 * It carries the three Phase-4 controls (AR/EN, Light/Dark, profile) plus a
 * portals menu whose entries are real routes: an unauthenticated visitor who
 * clicks "بوابة الأهالي" is answered by `middleware.ts` with a login redirect
 * that remembers where they were going — never a dead end.
 *
 * Section links (`/#why`) smooth-scroll in place when the section is already on
 * screen, and otherwise navigate first; the smooth-scroll provider scrolls to
 * the hash once the destination route has rendered.
 */
export function SiteHeader() {
  const { t, lang, toggleLang } = useLanguage();
  const { resolvedTheme, setTheme } = useTheme();
  const { data: session, status } = useSession();
  const { scrollToHash } = useSmoothScroll();
  const pathname = usePathname();
  const activeSection = useActiveSection(HOME_SECTION_IDS);

  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [portalsOpen, setPortalsOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const portalsRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Every menu closes when the route changes.
  useEffect(() => {
    setMobileOpen(false);
    setProfileOpen(false);
    setPortalsOpen(false);
  }, [pathname]);

  // Outside click / Escape closes whichever drop-down is open.
  useEffect(() => {
    if (!profileOpen && !portalsOpen) return;

    const onPointerDown = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (!profileRef.current?.contains(target)) setProfileOpen(false);
      if (!portalsRef.current?.contains(target)) setPortalsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
        setPortalsOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [profileOpen, portalsOpen]);

  const isDark = mounted && resolvedTheme === "dark";
  const user = session?.user;
  const role = user?.role;
  const authenticated = status === "authenticated" && Boolean(role);

  const visiblePortals = PORTALS.filter(
    (portal) => !portal.adminOnly || role === "SUPER_ADMIN"
  );

  const initials = (user?.name ?? user?.email ?? "؟")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("");

  /** Trailing-slash-safe match so `/explore?sector=x` still highlights. */
  const isRouteActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const isItemActive = (item: SiteNavItem) => {
    if (item.section) {
      return pathname === "/" && activeSection === item.section;
    }
    if (item.href === "/") {
      // "Home" stays highlighted until the reader reaches a section that has
      // its own nav entry.
      return pathname === "/" && (activeSection === "home" || !activeSection);
    }
    return isRouteActive(item.href);
  };

  const onNavigate = (
    event: MouseEvent<HTMLAnchorElement>,
    item: SiteNavItem
  ) => {
    setMobileOpen(false);
    if (!item.section) return;
    // Already on the home page → the section is in this document, so hand the
    // scroll to Lenis instead of letting the browser jump. From any other route
    // we let the <Link> navigate; the provider scrolls after the route commits.
    if (pathname === "/" && scrollToHash(`#${item.section}`)) {
      event.preventDefault();
    }
  };

  // The sun/moon glyph is painted in dark charcoal/navy: the header is a light
  // glass bar by default now, and a low-contrast grey icon would be the one
  // control nobody can find.
  const themeButton = (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={t("themeLabel")}
      title={t("themeLabel")}
      className="grid h-9 w-9 place-items-center rounded-lg text-sarh-navy transition-colors hover:bg-sarh-teal/10 hover:text-sarh-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal dark:text-slate-300"
    >
      {mounted ? (
        isDark ? (
          <Moon className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Sun className="h-5 w-5" aria-hidden="true" />
        )
      ) : (
        // Reserve the box before mount so the header never shifts.
        <span className="h-5 w-5" aria-hidden="true" />
      )}
    </button>
  );

  const languageButton = (
    <button
      type="button"
      onClick={toggleLang}
      aria-label={t("switchLanguage")}
      title={t("switchLanguage")}
      className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-sm font-semibold text-sarh-navy transition-colors hover:bg-sarh-teal/10 hover:text-sarh-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal dark:text-slate-300"
    >
      <Languages className="h-4 w-4" aria-hidden="true" />
      {lang === "ar" ? "EN" : "ع"}
    </button>
  );

  const portalLinks = (
    <ul className="py-1">
      {visiblePortals.map(({ href, labelKey, Icon }) => (
        <li key={href}>
          <Link
            href={href}
            role="menuitem"
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-sarh-navy transition-colors hover:bg-sarh-teal/10 hover:text-sarh-teal dark:text-slate-200"
          >
            <Icon className="h-4 w-4 text-sarh-teal" aria-hidden="true" />
            {t(labelKey)}
          </Link>
        </li>
      ))}
    </ul>
  );

  const renderProfile = (): ReactNode => {
    if (status === "loading") {
      return <span className="skeleton h-9 w-9 rounded-full" aria-hidden="true" />;
    }

    if (!user) {
      return (
        <div className="flex shrink-0 items-center gap-2">
          {/*
           * Both CTAs refuse to wrap. A 36px control with two lines of Arabic
           * inside is taller than the header and gets clipped by the bar's
           * bottom border — which is exactly what used to happen at 1440px.
           * The header gives this cluster enough room (see the nav width
           * comment) so `nowrap` can never push the row into overflow.
           */}
          <Link
            href="/auth/signin"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-sarh-borderLight px-2.5 text-sm font-semibold text-sarh-navy transition-colors hover:border-sarh-teal hover:text-sarh-tealInk focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-tealInk dark:border-sarh-borderDark dark:text-slate-200 dark:hover:text-sarh-teal"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            {t("login")}
          </Link>
          <Link
            href="/auth/signup"
            className="sarh-btn-primary h-9 shrink-0 whitespace-nowrap rounded-lg px-3 text-sm shadow-teal-glow"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {t("signUp")}
          </Link>
        </div>
      );
    }

    return (
      <div ref={profileRef} className="relative">
        <button
          type="button"
          onClick={() => {
            setPortalsOpen(false);
            setProfileOpen((open) => !open);
          }}
          aria-haspopup="menu"
          aria-expanded={profileOpen}
          aria-label={user.name ?? user.email ?? t("dashboard")}
          className="flex h-9 items-center gap-2 rounded-full py-1 ps-1 pe-2 text-sarh-navy transition-colors hover:bg-sarh-teal/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal dark:text-slate-100"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-sarh-teal text-xs font-bold text-white">
            {initials}
          </span>
          {/* Capped at 6rem: the signed-in name is the only nav control whose
              width an end user controls, and the bar is capped at `max-w-6xl`
              — an unbounded name would push the six links into an overflow.
              The full value lives in the button's aria-label and the menu. */}
          <span className="hidden max-w-[6rem] truncate text-sm font-semibold xl:inline">
            {user.name ?? user.email}
          </span>
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", profileOpen && "rotate-180")}
            aria-hidden="true"
          />
        </button>

        <AnimatePresence>
          {profileOpen ? (
            <motion.div
              role="menu"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="absolute end-0 top-12 z-50 w-60 overflow-hidden rounded-2xl border border-sarh-borderLight bg-sarh-cardLight shadow-soft-lg dark:border-sarh-borderDark dark:bg-sarh-cardDark"
            >
              <div className="border-b border-sarh-borderLight p-4 dark:border-sarh-borderDark">
                <p className="truncate text-sm font-bold text-sarh-navy dark:text-white">
                  {user.name ?? user.email}
                </p>
                {user.email ? (
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {user.email}
                  </p>
                ) : null}
                {role ? (
                  <span className="mt-2 inline-flex rounded-full bg-sarh-teal/10 px-2.5 py-1 text-[11px] font-semibold text-sarh-teal ring-1 ring-inset ring-sarh-teal/30">
                    {ROLE_LABEL[role]}
                  </span>
                ) : null}
              </div>

              {role ? (
                <Link
                  href={ROLE_HOME[role]}
                  role="menuitem"
                  className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-sarh-navy transition-colors hover:bg-sarh-teal/10 hover:text-sarh-teal dark:text-slate-200"
                >
                  <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                  {t("dashboard")}
                </Link>
              ) : null}

              <button
                type="button"
                role="menuitem"
                onClick={() => void signOut({ callbackUrl: "/" })}
                className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {t("logout")}
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  };

  const portalsMenu = (
    <div ref={portalsRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setProfileOpen(false);
          setPortalsOpen((open) => !open);
        }}
        aria-haspopup="menu"
        aria-expanded={portalsOpen}
        className={cn(
          "flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-tealInk",
          portalsOpen
            ? "bg-sarh-teal/10 text-sarh-teal"
            : "text-sarh-navy hover:bg-sarh-teal/10 hover:text-sarh-teal dark:text-slate-200"
        )}
      >
        <UserRound className="h-4 w-4" aria-hidden="true" />
        {t("nav_portals")}
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", portalsOpen && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {portalsOpen ? (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute end-0 top-12 z-50 w-60 overflow-hidden rounded-2xl border border-sarh-borderLight bg-sarh-cardLight shadow-soft-lg dark:border-sarh-borderDark dark:bg-sarh-cardDark"
          >
            {portalLinks}
            <div className="border-t border-sarh-borderLight dark:border-sarh-borderDark">
              <Link
                href={authenticated && role ? ROLE_HOME[role] : "/auth/signin"}
                role="menuitem"
                className="flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-sarh-teal transition-colors hover:bg-sarh-teal/10"
              >
                {authenticated ? (
                  <>
                    <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                    {t("dashboard")}
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" aria-hidden="true" />
                    {t("login")}
                  </>
                )}
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  const renderNavLink = (item: SiteNavItem, onExtra?: () => void) => {
    const active = isItemActive(item);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={(event) => {
          onNavigate(event, item);
          onExtra?.();
        }}
        aria-current={active ? "page" : undefined}
        /*
         * `whitespace-nowrap` is load-bearing. The bar is capped at
         * `max-w-6xl`, so the six labels, the brand and the five controls all
         * have to share ~1104px no matter how wide the monitor is. Readex Pro
         * is wider than the fallback face the layout was tuned against, and
         * without this the two longest labels ("المراكز التعليمية",
         * "أكاديمية المعلمين") each broke onto two lines inside a 64px bar.
         * Refusing to wrap turns an invisible overflow into a visible one
         * during development, and the label set below is sized to fit.
         */
        className={cn(
          "whitespace-nowrap rounded-lg px-2 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-tealInk",
          active
            ? "bg-sarh-teal/10 text-sarh-teal"
            : "text-sarh-navy hover:text-sarh-teal dark:text-slate-200"
        )}
      >
        {t(item.labelKey)}
      </Link>
    );
  };

  return (
    /*
     * `z-50` is load-bearing: the directory filter bar pins itself at
     * `sticky top-16 z-30` (directly under this 4rem bar), so the header must
     * out-rank it or the filter panel would slide over the navigation. The
     * background is an opaque-enough `bg-white/90` rather than a light glass
     * tint, so page content scrolling underneath never ghosts through it.
     */
    <header className="sticky top-0 z-50 border-b border-sarh-borderLight bg-white/90 backdrop-blur-md dark:border-sarh-borderDark dark:bg-sarh-bgDark/90">
      {/* Keyboard users land here first and can jump past the navigation. */}
      <a
        href="#site-main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-sarh-teal focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        {t("skipToContent")}
      </a>

      {/*
       * The bar is wider than the reading column on purpose.
       *
       * `max-w-6xl` (1152px) left 1104px for the brand, six links and five
       * controls, which need ~1273px in Arabic / ~1224px in English: 169px of
       * deficit, paid for by wrapping the action labels. `max-w-7xl` at `xl`
       * (the only widths that show this bar) gives 1232px, and the tightened
       * control padding above brings the cluster inside it with margin. Page
       * content keeps its 1152px column — only the navigation breathes wider,
       * as on apple.com, where the nav is not tied to the article measure.
       */}
      <nav
        aria-label={t("navLabel")}
        className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 xl:max-w-7xl"
      >
        {/* Brand — the glow ring reacts to hover/focus (interactive logo). */}
        <Link
          href="/"
          className="group relative flex shrink-0 items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-2 rounded-xl bg-sarh-teal/25 opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
          />
          <Image
            src={lang === "ar" ? "/brand/logo_RTL.svg" : "/brand/logo_LTR.svg"}
            alt=""
            width={32}
            height={46}
            unoptimized
            priority
            className="relative h-11 w-auto transition-transform duration-300 group-hover:scale-[1.04]"
          />
          <span className="relative hidden text-sm font-bold text-sarh-navy sm:block dark:text-white">
            {t("brand")}
          </span>
        </Link>

        {/* Desktop links — six destinations plus the portals menu and the auth
            buttons need real room, so the full bar only appears at `xl`; below
            that the categorised drawer takes over. */}
        <div className="hidden items-center gap-0 xl:flex">
          {NAV_ITEMS.map((item) => renderNavLink(item))}
        </div>

        {/*
         * Desktop controls — shrink-0 on purpose.
         *
         * The full cluster measures ~574px in Arabic and ~480px in English
         * with no wrapping. Allowing it to shrink is what silently broke the
         * labels: flexbox compressed the auth buttons below their min-content
         * width, so "إنشاء حساب جديد" wrapped to three lines inside a 36px
         * pill. It now keeps its natural width, and the bar is wide enough to
         * hold it (see the nav container below).
         */}
        <div className="hidden shrink-0 items-center gap-1 xl:flex">
          {languageButton}
          {themeButton}
          <span
            aria-hidden="true"
            className="mx-0.5 h-6 w-px bg-sarh-borderLight dark:bg-sarh-borderDark"
          />
          {portalsMenu}
          {renderProfile()}
        </div>

        {/* Mobile controls */}
        <div className="flex items-center gap-1 xl:hidden">
          {languageButton}
          {themeButton}
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={t("menu")}
            aria-expanded={mobileOpen}
            aria-controls="site-mobile-nav"
            className="grid h-9 w-9 place-items-center rounded-lg text-sarh-navy transition-colors hover:bg-sarh-teal/10 hover:text-sarh-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal dark:text-slate-300"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            id="site-mobile-nav"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="overflow-hidden border-t border-sarh-borderLight bg-sarh-cardLight/95 backdrop-blur-md xl:hidden dark:border-sarh-borderDark dark:bg-sarh-cardDark/95"
          >
            <div className="flex flex-col gap-1 p-4">
              {/* No `tracking-wide`: letter-spacing breaks Arabic's joins. */}
              <p className="px-3 pb-1 text-xs font-semibold text-sarh-inkMute dark:text-slate-400">
                {t("navLabel")}
              </p>
              {NAV_ITEMS.map((item) =>
                renderNavLink(item, () => setMobileOpen(false))
              )}

              <p className="mt-3 border-t border-sarh-borderLight px-3 pt-3 text-xs font-semibold text-sarh-inkMute dark:border-sarh-borderDark dark:text-slate-400">
                {t("nav_portals")}
              </p>
              {visiblePortals.map(({ href, labelKey, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-sarh-navy transition-colors hover:bg-sarh-teal/5 hover:text-sarh-teal dark:text-slate-200"
                >
                  <Icon className="h-4 w-4 text-sarh-teal" aria-hidden="true" />
                  {t(labelKey)}
                </Link>
              ))}

              <div className="mt-3 flex flex-col gap-2 border-t border-sarh-borderLight pt-3 dark:border-sarh-borderDark">
                {renderProfile()}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
