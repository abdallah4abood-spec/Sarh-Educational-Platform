"use client";

import { useCallback, useEffect, useState } from "react";

import { siteSettingsFromConfig, type SiteSettings } from "@/lib/config/site";

/**
 * Read the platform contact settings from `/api/settings`, falling back to
 * `siteConfig` (the NEXT_PUBLIC_* environment values).
 *
 * Two-phase on purpose:
 *   1. first paint uses the env fallback → the footer/contact block is never
 *      empty and never blocks on the network (offline-first requirement);
 *   2. once the API answers, the DB values replace them.
 *
 * The module-level promise dedupes the request, so a page rendering both the
 * footer and the contact block still issues exactly one GET, and a failed
 * request is not retried in a tight loop.
 */

let inflight: Promise<SiteSettings | null> | null = null;

async function requestSettings(): Promise<SiteSettings | null> {
  try {
    const response = await fetch("/api/settings", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as {
      success?: boolean;
      settings?: Partial<SiteSettings>;
    };
    if (!payload.success || !payload.settings) return null;

    const fallback = siteSettingsFromConfig();
    return {
      supportPhone: payload.settings.supportPhone || fallback.supportPhone,
      supportWhatsapp: payload.settings.supportWhatsapp || fallback.supportWhatsapp,
      supportEmail: payload.settings.supportEmail || fallback.supportEmail,
      siteLocation: payload.settings.siteLocation || fallback.siteLocation,
    };
  } catch {
    // Offline or the API is down → keep the env fallback.
    return null;
  }
}

export interface UseSiteSettingsResult {
  settings: SiteSettings;
  /** True while the first request is in flight. */
  loading: boolean;
  /** False when the API answered — useful to show an "offline defaults" hint. */
  synced: boolean;
  refresh: () => Promise<void>;
}

export function useSiteSettings(): UseSiteSettingsResult {
  const [settings, setSettings] = useState<SiteSettings>(siteSettingsFromConfig);
  const [loading, setLoading] = useState(true);
  const [synced, setSynced] = useState(false);

  const load = useCallback(async (force = false) => {
    if (force) inflight = null;

    const request = inflight ?? (inflight = requestSettings());
    const result = await request;

    if (result) {
      setSettings(result);
      setSynced(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    settings,
    loading,
    synced,
    refresh: () => load(true),
  };
}
