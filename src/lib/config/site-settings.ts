import { isDatabaseReachable } from "@/lib/data/centers-db";
import { prisma } from "@/lib/prisma";
import {
  SITE_SETTING_FIELDS,
  SITE_SETTING_KEYS,
  siteSettingsFromConfig,
  type SiteSettingKey,
  type SiteSettings,
} from "@/lib/config/site";

/**
 * Database-backed platform settings with a static fallback.
 *
 * Reads are intentionally forgiving: an unreachable PostgreSQL (offline dev,
 * cold container, migration in flight) must never break the public footer or
 * the contact page, so every failure collapses onto `siteConfig`.
 */

export { SITE_SETTING_FIELDS, SITE_SETTING_KEYS };
export type { SiteSettingKey, SiteSettings };

/** Where each value actually came from — surfaced by GET /api/settings. */
export type SiteSettingsSource = "db" | "partial" | "fallback";

export interface SiteSettingsResult {
  settings: SiteSettings;
  /** How many of the four keys were read from a database row. */
  dbRowCount: number;
  /** False when PostgreSQL could not be queried at all. */
  dbAvailable: boolean;
  source: SiteSettingsSource;
}

/** Values served when the database has no row for a key. */
export function siteSettingsDefaults(): SiteSettings {
  return siteSettingsFromConfig();
}

/**
 * Reads every setting, falling back per key. Never throws.
 *
 * `source` is derived from what the database actually returned — not from
 * comparing values — so seeding a row that happens to equal the env default
 * still reports `db`.
 */
export async function loadSiteSettings(): Promise<SiteSettingsResult> {
  const settings = siteSettingsDefaults();
  let dbRowCount = 0;
  let dbAvailable = false;

  /*
   * Probe the port before querying.
   *
   * "Never throws" was not enough: with Postgres simply absent (offline dev, a
   * container that has not come up) Prisma does not reject — it waits out the
   * driver's TCP connect timeout, which measured ~130 seconds per request. The
   * footer and the contact band both read these settings, so every public page
   * render stalled on it before falling back to values we already had in hand.
   *
   * The 700 ms probe is the same one `centers-db.ts` uses for the directory, so
   * both halves of the app now degrade to their bundled defaults on the same
   * schedule instead of one of them hanging for two minutes.
   */
  if (!(await isDatabaseReachable())) {
    return { settings, dbRowCount: 0, dbAvailable: false, source: "fallback" };
  }

  try {
    const rows = await prisma.siteSetting.findMany({
      where: { key: { in: [...SITE_SETTING_KEYS] } },
      select: { key: true, value: true },
    });
    dbAvailable = true;

    for (const row of rows) {
      if (!row.value.trim()) continue;
      const field = SITE_SETTING_FIELDS.find((item) => item.key === row.key);
      if (!field) continue;
      settings[field.field] = row.value;
      dbRowCount += 1;
    }
  } catch (error) {
    console.warn("[settings] falling back to siteConfig:", error);
  }

  const source: SiteSettingsSource =
    dbRowCount === SITE_SETTING_KEYS.length
      ? "db"
      : dbRowCount > 0
        ? "partial"
        : "fallback";

  return { settings, dbRowCount, dbAvailable, source };
}

/** Convenience wrapper for callers that only need the values. */
export async function getSiteSettings(): Promise<SiteSettings> {
  return (await loadSiteSettings()).settings;
}

/**
 * Persists a partial update. One upsert per key inside a transaction so a
 * failure can never leave half of the contact block edited.
 */
export async function saveSiteSettings(
  patch: Partial<SiteSettings>
): Promise<SiteSettings> {
  const operations = SITE_SETTING_FIELDS.flatMap(({ key, field }) => {
    const value = patch[field];
    if (typeof value !== "string" || !value.trim()) return [];
    const trimmed = value.trim();
    return [
      prisma.siteSetting.upsert({
        where: { key },
        update: { value: trimmed },
        create: { key, value: trimmed },
      }),
    ];
  });

  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }

  return getSiteSettings();
}
