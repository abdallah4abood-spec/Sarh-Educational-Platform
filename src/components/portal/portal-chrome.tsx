"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  ChevronDown,
  ExternalLink,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  Repeat2,
  Search,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import type { Role } from "@prisma/client";

import {
  PORTAL_NAV,
  PORTAL_NOTIFICATIONS,
  PORTAL_QUICK_LINKS,
  PORTAL_SEARCH_TARGET,
  PORTAL_SUPPORT,
  PORTAL_UNREAD,
} from "@/components/portal/nav-config";
import { useLanguage } from "@/lib/i18n/language-provider";
import {
  ROLE_HOME,
  ROLE_LABEL,
  effectiveRoles,
  portalById,
  portalsForRoles,
  type PortalId,
} from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * Dashboard chrome shared by all five portals (Pillar 2 — shared shell
 * pattern, functional segregation inside it).
 *
 * One component renders the sidebar, the sticky topbar, the role switcher, the
 * notification centre, the sign-out control, the mobile drawer and the footer
 * for every tier. What changes between portals is *data* — the nav items, the
 * search target, the support card and the notification feed — all of it read
 * from the registry in `nav-config.ts` / `roles.ts`. That is what keeps five
 * dashboards from drifting into five inconsistent products, while the routines
 * behind them stay strictly separated.
 */

interface PortalChromeProps {
  portalId: PortalId;
  /** Server-rendered identity, so the topbar never flashes empty. */
  user: { name: string; email: string; role: Role };
  children: ReactNode;
}

export function PortalChrome({ portalId, user, children }: PortalChromeProps) {
  const { t, lang } = useLanguage();
  const portal = portalById(portalId);
  const nav = PORTAL_NAV[portalId];
  const support = PORTAL_SUPPORT[portalId];
  const notifications = PORTAL_NOTIFICATIONS[portalId];
  const unread = PORTAL_UNREAD[portalId];

  const router = useRouter();
  const pathname = usePathname();
  const { data: session, update } = useSession();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [switching, setSwitching] = useState<Role | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const roles = effectiveRoles(
    session?.user?.role ?? user.role,
    session?.user?.roles
  );
  const activeRole = session?.user?.activeRole ?? user.role;
  const switchable = portalsForRoles(roles);
  const displayName = session?.user?.name ?? user.name;
  const displayEmail = session?.user?.email ?? user.email;
  const initials = (displayName || displayEmail || "ص").trim().charAt(0);

  const isActive = (href: string) =>
    href === portal.home
      ? pathname === portal.home
      : pathname === href || pathname.startsWith(`${href}/`);

  // Every panel closes when the route changes: a drawer that survives
  // navigation would cover the page it just opened.
  useEffect(() => {
    setDrawerOpen(false);
    setMenuOpen(false);
    setNotifOpen(false);
  }, [pathname]);

  // Escape + click-away for the two popovers and the mobile drawer.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      setNotifOpen(false);
      setDrawerOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, []);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = query.trim();
    const target = PORTAL_SEARCH_TARGET[portalId];
    router.push(term ? `${target}?q=${encodeURIComponent(term)}` : target);
  };

  /**
   * Seamless role switching (Pillar 1).
   *
   * The chosen tier is written into the JWT by the NextAuth `update` trigger —
   * and the callback only accepts a tier the account already holds, so the
   * switcher can never widen anyone's rights. The new cookie is in place before
   * we navigate to that tier's dashboard.
   */
  const switchRole = async (role: Role) => {
    if (role === activeRole) {
      router.push(ROLE_HOME[role]);
      return;
    }
    setSwitching(role);
    try {
      await update({ activeRole: role });
      router.push(ROLE_HOME[role]);
      router.refresh();
    } finally {
      setSwitching(null);
    }
  };

  const handleSignOut = async () => {
    // The parent/teacher portals keep an offline queue in IndexedDB; signing
    // out is where the user expects that locally-stored copy to be cleared,
    // so the shell asks the browser to drop it before ending the session.
    try {
      window.localStorage.removeItem("sarh-active-draft");
    } catch {
      /* storage can be disabled — the session still ends */
    }
    await signOut({ callbackUrl: "/" });
  };

  /* ---------------------------------------------------------------- */
  /* Sidebar                                                          */
  /* ---------------------------------------------------------------- */

  const sidebar = (
    <div className="flex h-full flex-col gap-4 overflow-y-auto bg-sarh-cardLight p-4 dark:bg-sarh-cardDark">
      {/* Brand */}
      <Link
        href="/"
        className="flex items-center justify-between gap-2 rounded-xl px-1 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal"
        aria-label="صَرْح — الموقع العام"
      >
        <Image
          src={lang === "ar" ? "/brand/logo_RTL.svg" : "/brand/logo_LTR.svg"}
          alt="صَرْح"
          width={104}
          height={40}
          className="h-10 w-auto"
          priority
        />
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-muted lg:hidden"
          aria-label={t("portalCloseMenu")}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </Link>

      <p className="px-2 text-[11px] font-bold text-slate-400 dark:text-slate-500">
        {portal.caption}
      </p>

      {/* Primary navigation */}
      <nav aria-label={t("portalNavLabel")} className="flex-1">
        <ul className="space-y-1">
          {nav.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                    active
                      ? "bg-sarh-teal/12 text-sarh-teal ring-1 ring-inset ring-sarh-teal/25"
                      : "text-sarh-navy hover:bg-muted hover:text-sarh-teal dark:text-slate-300"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      active ? "text-sarh-teal" : "text-slate-400"
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Support card */}
      <div className="sarh-note-beige rounded-2xl p-3.5">
        <p className="text-sm font-bold text-sarh-navy">{support.title}</p>
        <p className="mt-1 text-[11px] leading-5 text-slate-600 dark:text-slate-300">
          {support.body}
        </p>
        <Link
          href={support.href}
          className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-bold text-sarh-teal hover:underline"
        >
          {support.cta}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      {/* Sign-out — present in every dashboard (sidebar) */}
      <div className="space-y-1 border-t border-sarh-borderLight pt-3 dark:border-sarh-borderDark">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-500 transition-colors hover:bg-muted hover:text-sarh-teal dark:text-slate-400"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {t("portalViewSite")}
        </Link>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-red-400"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {t("logout")}
        </button>
        <p className="px-3 pb-1 text-[10px] text-slate-400 dark:text-slate-500">
          {t("portalLogoutHint")}
        </p>
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /* Topbar                                                           */
  /* ---------------------------------------------------------------- */

  const topbar = (
    <header className="sticky top-0 z-40 border-b border-sarh-borderLight bg-white/90 backdrop-blur-md dark:border-sarh-borderDark dark:bg-sarh-bgDark/90">
      <div className="flex items-center gap-2 px-3 py-2.5 sm:px-5">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-sarh-borderLight text-sarh-navy transition-colors hover:border-sarh-teal hover:text-sarh-teal lg:hidden dark:border-sarh-borderDark dark:text-slate-200"
          aria-label={t("portalOpenMenu")}
          aria-expanded={drawerOpen}
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </button>

        <form
          role="search"
          onSubmit={handleSearch}
          className="relative min-w-0 flex-1 sm:max-w-xl"
        >
          <Search
            className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-sarh-teal"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("portalSearchPlaceholder")}
            aria-label={t("portalSearchLabel")}
            className="h-10 w-full rounded-xl border border-sarh-borderLight bg-sarh-bgLight/70 ps-9 pe-3 text-sm text-sarh-navy outline-none transition-colors placeholder:text-slate-400 focus:border-sarh-teal focus:ring-2 focus:ring-sarh-teal/25 dark:border-sarh-borderDark dark:bg-sarh-cardDark dark:text-slate-100"
          />
        </form>

        <div className="flex items-center gap-1.5">
          {/* Notifications */}
          <div ref={notifRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setNotifOpen((open) => !open);
              }}
              aria-haspopup="menu"
              aria-expanded={notifOpen}
              aria-label={`${t("portalNotifications")} — ${unread} ${t("portalNotificationsCount")}`}
              className="relative grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-muted hover:text-sarh-teal dark:text-slate-400"
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              {unread > 0 ? (
                <span className="absolute -end-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-sarh-gold px-1 font-mono text-[10px] font-bold text-white">
                  {unread}
                </span>
              ) : null}
            </button>

            <AnimatePresence>
              {notifOpen ? (
                <motion.div
                  role="menu"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="absolute end-0 top-11 z-50 w-80 overflow-hidden rounded-2xl border border-sarh-borderLight bg-sarh-cardLight shadow-soft-lg dark:border-sarh-borderDark dark:bg-sarh-cardDark"
                >
                  <p className="border-b border-sarh-borderLight px-4 py-3 text-sm font-bold text-sarh-navy dark:border-sarh-borderDark dark:text-white">
                    {t("portalNotifications")}
                  </p>
                  <ul>
                    {notifications.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          className="block border-b border-sarh-borderLight px-4 py-3 transition-colors last:border-0 hover:bg-sarh-teal/5 dark:border-sarh-borderDark"
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-sarh-navy dark:text-slate-100">
                              {item.title}
                            </span>
                            <span className="shrink-0 font-mono text-[10px] text-slate-400">
                              {item.at}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                            {item.body}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <Link
            href={`${portal.prefix}/settings`}
            aria-label={t("portalSettings")}
            className="hidden h-9 w-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-muted hover:text-sarh-teal sm:grid dark:text-slate-400"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
          </Link>

          <Link
            href="/contact"
            aria-label={t("portalHelp")}
            className="hidden h-9 w-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-muted hover:text-sarh-teal sm:grid dark:text-slate-400"
          >
            <HelpCircle className="h-4 w-4" aria-hidden="true" />
          </Link>

          {/* Identity + role switcher + sign-out */}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setNotifOpen(false);
                setMenuOpen((open) => !open);
              }}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex h-10 items-center gap-2 rounded-full py-1 pe-2 ps-1 text-sarh-navy transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal dark:text-slate-100"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-sarh-teal text-sm font-bold text-white">
                {initials}
              </span>
              <span className="hidden text-start lg:block">
                <span className="block max-w-[9rem] truncate text-xs font-bold">
                  {displayName}
                </span>
                <span className="block text-[10px] text-slate-400">
                  {ROLE_LABEL[activeRole]}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  menuOpen && "rotate-180"
                )}
                aria-hidden="true"
              />
            </button>

            <AnimatePresence>
              {menuOpen ? (
                <motion.div
                  role="menu"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="absolute end-0 top-12 z-50 w-72 overflow-hidden rounded-2xl border border-sarh-borderLight bg-sarh-cardLight shadow-soft-lg dark:border-sarh-borderDark dark:bg-sarh-cardDark"
                >
                  <div className="border-b border-sarh-borderLight p-4 dark:border-sarh-borderDark">
                    <p className="truncate text-sm font-bold text-sarh-navy dark:text-white">
                      {displayName}
                    </p>
                    <p dir="ltr" className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {displayEmail}
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-sarh-teal/10 px-2.5 py-1 text-[11px] font-semibold text-sarh-teal ring-1 ring-inset ring-sarh-teal/30">
                      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                      {ROLE_LABEL[activeRole]}
                    </span>
                  </div>

                  {/* Role switcher — only for accounts with more than one tier */}
                  {switchable.length > 1 ? (
                    <div className="border-b border-sarh-borderLight p-2 dark:border-sarh-borderDark">
                      <p className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        <Repeat2 className="h-3.5 w-3.5 text-sarh-gold" aria-hidden="true" />
                        {t("portalSwitchRole")}
                      </p>
                      <ul>
                        {switchable.map((option) => {
                          const current = option.role === activeRole;
                          return (
                            <li key={option.id}>
                              <button
                                type="button"
                                role="menuitem"
                                disabled={switching !== null}
                                onClick={() => void switchRole(option.role)}
                                aria-current={current ? "true" : undefined}
                                className={cn(
                                  "w-full rounded-lg px-2 py-2 text-start transition-colors disabled:opacity-60",
                                  current
                                    ? "bg-sarh-teal/10"
                                    : "hover:bg-muted"
                                )}
                              >
                                <span className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-bold text-sarh-navy dark:text-slate-100">
                                    {option.label}
                                  </span>
                                  <span className="text-[10px] font-semibold text-sarh-teal">
                                    {current
                                      ? t("portalCurrentRole")
                                      : switching === option.role
                                        ? "…"
                                        : ROLE_LABEL[option.role]}
                                  </span>
                                </span>
                                <span className="mt-0.5 block text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                                  {option.purpose}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      <p className="px-2 pb-1 text-[10px] leading-4 text-slate-400 dark:text-slate-500">
                        {t("portalSwitchHint")}
                      </p>
                    </div>
                  ) : null}

                  <Link
                    href={portal.home}
                    role="menuitem"
                    className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-sarh-navy transition-colors hover:bg-sarh-teal/10 hover:text-sarh-teal dark:text-slate-200"
                  >
                    <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                    {portal.label}
                  </Link>

                  <Link
                    href={`${portal.prefix}/settings`}
                    role="menuitem"
                    className="flex items-center gap-2 border-t border-sarh-borderLight px-4 py-3 text-sm font-medium text-sarh-navy transition-colors hover:bg-sarh-teal/10 hover:text-sarh-teal dark:border-sarh-borderDark dark:text-slate-200"
                  >
                    <Settings className="h-4 w-4" aria-hidden="true" />
                    {t("portalSettings")}
                  </Link>

                  {/* Sign-out — present in every dashboard (account menu) */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleSignOut()}
                    className="flex w-full items-center gap-2 border-t border-sarh-borderLight px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/10 dark:border-sarh-borderDark dark:text-red-400"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    {t("logout")}
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );

  /* ---------------------------------------------------------------- */
  /* Footer                                                           */
  /* ---------------------------------------------------------------- */

  const footer = (
    <footer className="mt-10 border-t border-sarh-borderLight px-4 py-6 sm:px-6 dark:border-sarh-borderDark">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-center gap-3">
          <Image
            src={lang === "ar" ? "/brand/logo_RTL.svg" : "/brand/logo_LTR.svg"}
            alt="صَرْح"
            width={88}
            height={34}
            className="h-8 w-auto"
          />
          <p className="max-w-xs text-xs leading-6 text-slate-500 dark:text-slate-400">
            {t("portalFooterTagline")}
          </p>
        </div>

        <nav aria-label={t("portalQuickLinks")}>
          <p className="mb-2 text-[11px] font-bold text-sarh-navy dark:text-slate-200">
            {t("portalQuickLinks")}
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {PORTAL_QUICK_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-xs text-slate-500 transition-colors hover:text-sarh-teal dark:text-slate-400"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          © 2026 صَرْح — منصة التعليم والخدمات الأسرية
        </p>
      </div>
    </footer>
  );

  return (
    <div className="flex min-h-screen bg-sarh-bgLight dark:bg-sarh-bgDark">
      {/* Static sidebar (>= lg). First in DOM → the right edge in RTL. */}
      <aside className="sticky top-0 hidden h-screen w-[268px] shrink-0 border-s border-sarh-borderLight lg:block dark:border-sarh-borderDark">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-sarh-navy/40 backdrop-blur-sm lg:hidden"
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="fixed inset-y-0 end-0 z-50 w-[280px] border-s border-sarh-borderLight shadow-soft-lg lg:hidden dark:border-sarh-borderDark"
              aria-label={t("portalNavLabel")}
            >
              {sidebar}
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        {topbar}
        {/* `id` is the skip-link/anchor target used by the portals. */}
        <main id="portal-main" className="min-w-0 flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
        {footer}
      </div>

      {/*
       * Floating contact affordance, pinned to the start edge.
       *
       * On `lg` the sidebar owns that edge (268px wide), so `start-5` used to
       * park this pill on top of the sidebar's footer and its support card.
       * The `lg:start-[288px]` offset clears the rail by one 20px gutter; below
       * `lg` the rail is a drawer, so the pill stays at the plain `start-5`.
       */}
      <Link
        href="/contact"
        className="fixed bottom-5 start-5 z-30 hidden items-center gap-2 rounded-full bg-sarh-navy px-4 py-2.5 text-xs font-bold text-white shadow-soft-lg transition-transform hover:-translate-y-0.5 sm:inline-flex lg:start-[288px]"
      >
        <HelpCircle className="h-4 w-4 text-sarh-gold" aria-hidden="true" />
        {t("portalContactCta")}
      </Link>
    </div>
  );
}
