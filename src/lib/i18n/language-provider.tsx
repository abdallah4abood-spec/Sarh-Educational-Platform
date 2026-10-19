"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  dictionaries,
  type DictionaryKey,
  type Language,
} from "@/lib/i18n/dictionary";

interface LanguageContextValue {
  lang: Language;
  dir: "rtl" | "ltr";
  t: (key: DictionaryKey) => string;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "sarh-lang";
const DIRECTIONS: Record<Language, "rtl" | "ltr"> = { ar: "rtl", en: "ltr" };

/** Applies `lang`/`dir` to the document so Tailwind logical utilities flip. */
function applyToDocument(lang: Language): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
  document.documentElement.dir = DIRECTIONS[lang];
}

/**
 * Arabic-first language context. Arabic/RTL is the default render value, and
 * a saved preference is re-applied after mount so hydration stays stable.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>("ar");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "ar" || saved === "en") {
        setLangState(saved);
        applyToDocument(saved);
      } else {
        applyToDocument("ar");
      }
    } catch {
      applyToDocument("ar");
    }
  }, []);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    applyToDocument(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage may be disabled — the in-memory language still applies */
    }
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      dir: DIRECTIONS[lang],
      t: (key: DictionaryKey) => dictionaries[lang][key] ?? dictionaries.ar[key],
      setLang,
      toggleLang: () => setLang(lang === "ar" ? "en" : "ar"),
    }),
    [lang, setLang]
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used inside <LanguageProvider>");
  }
  return context;
}
