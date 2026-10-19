"use client";

import { useEffect } from "react";

import { useLanguage } from "@/lib/i18n/language-provider";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

/**
 * Keeps the document title in step with the language toggle.
 *
 * Next.js `metadata` is computed on the server, so the `<title>` it emits is
 * frozen in the language the request was made in — switching AR→EN left an
 * Arabic tab title above an entirely English page, which was the last piece of
 * the interface the toggle did not reach.
 *
 * The server-rendered title is deliberately left in place (it is what crawlers
 * and link previews read, in the locale the document was served as); this only
 * re-writes it on the client once the reader is actually looking at the tab.
 *
 * Reuses the root layout's `%s | brand` shape rather than hard-coding the
 * suffix, so the wordmark stays localised ("صَرْح" / "SARH") exactly like the
 * header and footer do.
 */
export function DocumentTitle({ titleKey }: { titleKey: DictionaryKey }) {
  const { t, lang } = useLanguage();

  useEffect(() => {
    document.title = `${t(titleKey)} | ${t("brand")}`;
  }, [t, titleKey, lang]);

  return null;
}
