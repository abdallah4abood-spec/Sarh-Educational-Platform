"use client";

import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowUp,
  AtSign,
  Camera,
  LogIn,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  PlayCircle,
  ShieldCheck,
  Users,
  WifiOff,
} from "lucide-react";

import { getLenis } from "@/components/providers/smooth-scroll-provider";
import { mailtoHref, siteConfig, telHref, whatsappHref } from "@/lib/config/site";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useLanguage } from "@/lib/i18n/language-provider";
import { ROLE_HOME, ROLE_LABEL } from "@/lib/roles";

/**
 * The single footer for the whole platform.
 *
 * It merges what used to be two separate footers (the platform one and the
 * /learn microsite one) into the superset: brand block, the platform links
 * including the landing anchors, the role-aware portals column, the
 * DB-backed contact block, legal links, the accreditation note and the
 * offline badge.
 *
 * Every entry is a real route or a real anchor — there is no `href="#"` filler.
 * Social channels come from `NEXT_PUBLIC_SOCIAL_*` and are simply absent when
 * unset, and each one is labelled, so the icon is never the only cue.
 */
export function SiteFooter() {
  const { t, lang } = useLanguage();
  const { data: session, status } = useSession();
  // DB-backed contact block; falls back to siteConfig while offline.
  const { settings } = useSiteSettings();
  const year = new Date().getFullYear();
  const emailHref = mailtoHref(settings.supportEmail);

  const user = session?.user;
  const role = user?.role;
  const authenticated = status === "authenticated" && Boolean(role);

  const platformLinks = [
    { href: "/", label: t("nav_home") },
    { href: "/explore/centers", label: t("nav_centers") },
    { href: "/explore/kindergartens", label: t("nav_kindergartens") },
    { href: "/#why", label: t("nav_why") },
    { href: "/about", label: t("nav_about") },
    { href: "/faq", label: t("nav_faq") },
    { href: "/contact", label: t("nav_contact") },
  ];

  const legalLinks = [
    { href: "/privacy", label: t("privacyPolicy") },
    { href: "/terms", label: t("termsOfService") },
    { href: "/faq", label: t("nav_faq") },
  ];

  // Only render what is configured — an unset handle means the channel is absent
  // rather than a dead link. lucide-react ships no brand marks, so each entry is
  // labelled with visible text.
  const socials = [
    { href: siteConfig.socialInstagram, label: "Instagram", Icon: Camera },
    { href: siteConfig.socialFacebook, label: "Facebook", Icon: Users },
    { href: siteConfig.socialYoutube, label: "YouTube", Icon: PlayCircle },
  ].filter((social) => social.href.trim().length > 0);

  const columnClass =
    // No uppercase/tracking: letter-spacing breaks Arabic's cursive joins.
    "text-sm font-semibold text-sarh-navy dark:text-white";
  /*
   * `inline-flex min-h-6 items-center` lifts every footer link to a 24px tap
   * target. As plain inline text the line box was 20px tall and the 8px list
   * gap left neighbouring targets overlapping a 24px circle, which is the one
   * WCAG 2.2 (2.5.8) check a footer link list tends to fail on mobile.
   */
  const linkClass =
    "inline-flex min-h-6 items-center text-sm text-sarh-inkMute transition-colors hover:text-sarh-tealInk dark:text-slate-400 dark:hover:text-sarh-teal";

  /** Back to top: Lenis when it owns the scroll, the browser otherwise. */
  const scrollToTop = () => {
    const lenis = getLenis();
    if (lenis) {
      lenis.scrollTo(0, { duration: 1 });
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer className="border-t border-sarh-borderLight bg-sarh-cardLight/70 dark:border-sarh-borderDark dark:bg-sarh-cardDark/70">
      <div className="mx-auto max-w-6xl px-6 pb-10 pt-12">
        {/* ---- Brand + tagline + support channels ---- */}
        <div className="mb-10 flex flex-col gap-5 border-b border-sarh-borderLight pb-8 dark:border-sarh-borderDark lg:flex-row lg:items-start lg:justify-between">
          <div className="flex max-w-xl flex-col gap-3">
            <div className="flex items-center gap-3">
              <Image
                src={lang === "ar" ? "/brand/logo_RTL.svg" : "/brand/logo_LTR.svg"}
                alt=""
                width={32}
                height={46}
                unoptimized
                className="h-11 w-auto"
              />
              <p className="text-lg font-bold text-sarh-navy dark:text-white">
                {t("brand")}
              </p>
            </div>
            <p className="text-sm leading-7 text-sarh-inkMute dark:text-slate-400">
              {t("brandTagline")}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-sarh-inkMute dark:text-slate-400">
              {t("nav_contact")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {/* Always-available channels first: WhatsApp and email, both real. */}
              <a
                href={whatsappHref(settings.supportWhatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("contactWhatsapp")}
                className="flex items-center gap-2 rounded-lg border border-sarh-borderLight px-3 py-2 text-xs font-semibold text-sarh-navy transition-colors hover:border-sarh-teal hover:text-sarh-teal dark:border-sarh-borderDark dark:text-slate-200"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                {t("contactWhatsapp")}
              </a>
              {emailHref ? (
                <a
                  href={emailHref}
                  aria-label={settings.supportEmail}
                  className="flex items-center gap-2 rounded-lg border border-sarh-borderLight px-3 py-2 text-xs font-semibold text-sarh-navy transition-colors hover:border-sarh-teal hover:text-sarh-teal dark:border-sarh-borderDark dark:text-slate-200"
                >
                  <AtSign className="h-4 w-4" aria-hidden="true" />
                  {settings.supportEmail}
                </a>
              ) : null}
              {socials.map(({ href, label, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-sarh-borderLight px-3 py-2 text-xs font-semibold text-sarh-navy transition-colors hover:border-sarh-teal hover:text-sarh-teal dark:border-sarh-borderDark dark:text-slate-200"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* ---- Link columns ---- */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <nav aria-label={t("quickLinks")} className="space-y-3">
            <h2 className={columnClass}>{t("quickLinks")}</h2>
            <ul className="space-y-2">
              {platformLinks.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className={linkClass}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Portals — role-aware for members, sign-in prompt for guests */}
          <div className="space-y-3">
            <h2 className={columnClass}>{t("portalSection")}</h2>

            {authenticated && role ? (
              <ul className="space-y-2">
                <li>
                  <Link
                    href={ROLE_HOME[role]}
                    /*
                     * `min-h-6` holds the 24px tap target the other footer
                     * links get from `linkClass`; the dot is decoration, so it
                     * is hidden from assistive tech rather than read back as
                     * a stray "●" inside the role name.
                     */
                    className="inline-flex min-h-6 items-center gap-2 text-sm font-medium text-sarh-tealInk transition-colors hover:underline dark:text-sarh-teal"
                  >
                    <span
                      aria-hidden="true"
                      className="grid h-5 w-5 place-items-center rounded bg-sarh-teal/15 text-[10px] font-bold"
                    >
                      ●
                    </span>
                    {ROLE_LABEL[role]}
                  </Link>
                </li>
                <li>
                  <Link href="/explore/centers" className={linkClass}>
                    {t("nav_centers")}
                  </Link>
                </li>
              </ul>
            ) : (
              <>
                <p className="text-sm leading-7 text-sarh-inkMute dark:text-slate-400">
                  {t("portalGuestHint")}
                </p>
                <ul className="space-y-2">
                  <li>
                    <Link href="/parent/feed" className={linkClass}>
                      {t("nav_parent")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/institution/ai-studio" className={linkClass}>
                      {t("nav_institution")}
                    </Link>
                  </li>
                </ul>
                <Link
                  href="/auth/signin"
                  className="inline-flex items-center gap-2 rounded-lg border border-sarh-borderLight px-3 py-2 text-sm font-semibold text-sarh-navy transition-colors hover:border-sarh-teal hover:text-sarh-teal dark:border-sarh-borderDark dark:text-slate-200"
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  {t("login")}
                </Link>
              </>
            )}
          </div>

          {/* Contact block */}
          <div className="space-y-3">
            <h2 className={columnClass}>{t("nav_contact")}</h2>
            <ul className="space-y-2">
              <li className="flex items-start gap-2 text-sm text-sarh-inkMute dark:text-slate-400">
                <MapPin
                  className="mt-0.5 h-4 w-4 shrink-0 text-sarh-gold"
                  aria-hidden="true"
                />
                {settings.siteLocation || t("contactLocationValue")}
              </li>
              <li className="flex items-center gap-2 text-sm text-sarh-inkMute dark:text-slate-400">
                <Phone className="h-4 w-4 shrink-0 text-sarh-gold" aria-hidden="true" />
                {/* dir=ltr keeps the number readable inside an RTL line. */}
                {/* `min-h-6` = the 24px tap target, like the rest of the footer. */}
                <a
                  href={telHref(settings.supportPhone)}
                  dir="ltr"
                  className="inline-flex min-h-6 items-center hover:text-sarh-teal"
                >
                  {settings.supportPhone}
                </a>
              </li>
              {emailHref ? (
                <li className="flex items-center gap-2 text-sm text-sarh-inkMute dark:text-slate-400">
                  <Mail className="h-4 w-4 shrink-0 text-sarh-gold" aria-hidden="true" />
                <a
                  href={emailHref}
                  dir="ltr"
                  className="inline-flex min-h-6 items-center hover:text-sarh-teal"
                >
                  {settings.supportEmail}
                </a>
                </li>
              ) : null}
            </ul>
          </div>

          {/* Legal */}
          <nav aria-label={t("legalLabel")} className="space-y-3">
            <h2 className={columnClass}>{t("legalLabel")}</h2>
            <ul className="space-y-2">
              {legalLinks.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className={linkClass}>
                    {label}
                  </Link>
                </li>
              ))}
              {!authenticated ? (
                <li>
                  <Link href="/auth/signup" className={linkClass}>
                    {t("signUp")}
                  </Link>
                </li>
              ) : null}
            </ul>
          </nav>
        </div>

        {/* ---- Accreditation ---- */}
        <div className="mt-10 flex flex-col gap-3 rounded-2xl border border-sarh-borderLight bg-sarh-teal/[0.05] p-5 dark:border-sarh-borderDark sm:flex-row sm:items-start">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sarh-teal/15 text-sarh-tealInk dark:text-sarh-teal">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-sarh-navy dark:text-white">
              {t("footerAccreditationTitle")}
              <span className="sarh-badge bg-sarh-teal/10 text-sarh-tealInk ring-1 ring-inset ring-sarh-teal/30 dark:text-sarh-teal">
                {t("footerVerifiedData")}
              </span>
            </p>
            <p className="mt-1.5 text-sm leading-7 text-sarh-inkMute dark:text-slate-400">
              {t("footerAccreditationBody")}
            </p>
          </div>
        </div>

        {/* ---- Bottom bar ---- */}
        <div className="mt-8 flex flex-col items-center gap-3 border-t border-sarh-borderLight pt-5 text-center text-xs text-sarh-inkMute dark:border-sarh-borderDark dark:text-slate-400 sm:flex-row sm:justify-between sm:text-start">
          <p>
            © {year} {t("brand")} — {t("brandTagline")}
          </p>
          <div className="flex items-center gap-4">
            <p className="flex items-center gap-1.5">
              <WifiOff className="h-3.5 w-3.5 text-sarh-gold" aria-hidden="true" />
              {t("offlineReady")}
            </p>
            <button
              type="button"
              onClick={scrollToTop}
              className="inline-flex min-h-6 items-center gap-1.5 font-semibold text-sarh-inkMute transition-colors hover:text-sarh-tealInk dark:text-slate-400 dark:hover:text-sarh-teal"
            >
              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
              {t("footerBackToTop")}
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
