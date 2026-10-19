/**
 * SARH — central site configuration.
 *
 * This module is isomorphic on purpose: it is imported by client components
 * (the footer, the contact page) and by server code (the settings API), so it
 * must only read `NEXT_PUBLIC_*` values, which Next.js inlines into both
 * bundles. Values are read at call time inside the getters so a test or a
 * server runtime can still override `process.env` before reading.
 *
 * These values are the *fallback* for the database-backed `SiteSetting` rows
 * edited from /admin/settings — see `src/lib/config/site-settings.ts`.
 */

/** Editable, database-backed platform settings (see /admin/settings). */
export interface SiteSettings {
  supportPhone: string;
  supportWhatsapp: string;
  supportEmail: string;
  siteLocation: string;
}

/** Keys of the editable `SiteSetting` rows. */
export const SITE_SETTING_KEYS = [
  "support_phone",
  "support_whatsapp",
  "support_email",
  "site_location",
] as const;

export type SiteSettingKey = (typeof SITE_SETTING_KEYS)[number];

/**
 * Field metadata shared by the admin form and the server validator. It lives
 * here (not in `site-settings.ts`) so client components can import it without
 * pulling Prisma into the browser bundle.
 */
export const SITE_SETTING_FIELDS: {
  key: SiteSettingKey;
  field: keyof SiteSettings;
  labelKey: "settingPhone" | "settingWhatsapp" | "settingEmail" | "settingLocation";
  inputType: "tel" | "email" | "text";
  placeholder: string;
}[] = [
  {
    key: "support_phone",
    field: "supportPhone",
    labelKey: "settingPhone",
    inputType: "tel",
    placeholder: "+970 599 000 000",
  },
  {
    key: "support_whatsapp",
    field: "supportWhatsapp",
    labelKey: "settingWhatsapp",
    inputType: "tel",
    placeholder: "+970 599 000 000",
  },
  {
    key: "support_email",
    field: "supportEmail",
    labelKey: "settingEmail",
    inputType: "email",
    placeholder: "hello@sarh.ps",
  },
  {
    key: "site_location",
    field: "siteLocation",
    labelKey: "settingLocation",
    inputType: "text",
    placeholder: "غزة، فلسطين",
  },
];

export interface SiteConfig {
  name: string;
  /** Human-readable support phone, e.g. `+970 599 000 000`. */
  supportPhone: string;
  /** Same number, WhatsApp-enabled. */
  supportWhatsapp: string;
  supportEmail: string;
  location: string;
  /** Absolute origin used for links inside emails and OAuth callbacks. */
  appUrl: string;
  /** FastAPI AI microservice (Phase 3). */
  fastApiUrl: string;
  /**
   * Optional intro video for the /learn hero. Empty string → the video modal
   * shows a localized notice instead of a broken player.
   */
  introVideoUrl: string;
  /**
   * Optional public social profiles. An empty string means "not configured",
   * and the /learn footer omits that icon instead of rendering a dead link.
   */
  socialInstagram: string;
  socialFacebook: string;
  socialYoutube: string;
}

const FALLBACK = {
  supportPhone: "+970 599 000 000",
  supportWhatsapp: "+970 599 000 000",
  supportEmail: "hello@sarh.ps",
  location: "غزة، فلسطين",
} as const;

export const siteConfig: SiteConfig = {
  name: "صَرْح",
  get supportPhone() {
    return process.env.NEXT_PUBLIC_SUPPORT_PHONE || FALLBACK.supportPhone;
  },
  get supportWhatsapp() {
    return process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || FALLBACK.supportWhatsapp;
  },
  get supportEmail() {
    return process.env.NEXT_PUBLIC_SUPPORT_EMAIL || FALLBACK.supportEmail;
  },
  get location() {
    return process.env.NEXT_PUBLIC_SITE_LOCATION || FALLBACK.location;
  },
  get appUrl() {
    return (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000"
    );
  },
  get fastApiUrl() {
    return process.env.NEXT_PUBLIC_FASTAPI_URL || "http://localhost:8000";
  },
  get introVideoUrl() {
    return process.env.NEXT_PUBLIC_INTRO_VIDEO_URL || "";
  },
  get socialInstagram() {
    return process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM || "";
  },
  get socialFacebook() {
    return process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK || "";
  },
  get socialYoutube() {
    return process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE || "";
  },
};

/**
 * The `siteConfig` values in `SiteSettings` shape — served whenever the
 * database row is missing or unreachable, and used as the first paint value
 * before `/api/settings` answers.
 */
export function siteSettingsFromConfig(): SiteSettings {
  return {
    supportPhone: siteConfig.supportPhone,
    supportWhatsapp: siteConfig.supportWhatsapp,
    supportEmail: siteConfig.supportEmail,
    siteLocation: siteConfig.location,
  };
}

/** Digits-only form of a phone number — required by `wa.me` and `tel:`. */
export function phoneDigits(value: string): string {
  return value.replace(/[^\d]/g, "");
}

/** `https://wa.me/970599000000` for a display-formatted phone number. */
export function whatsappHref(value: string): string {
  return `https://wa.me/${phoneDigits(value)}`;
}

/** `tel:+970599000000` for a display-formatted phone number. */
export function telHref(value: string): string {
  return `tel:+${phoneDigits(value)}`;
}

/** `mailto:` link that tolerates a blank stored value. */
export function mailtoHref(value: string): string | null {
  return value.trim() ? `mailto:${value.trim()}` : null;
}
