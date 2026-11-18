import { useEffect, useMemo, useState, type ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { LocaleContext } from "./LocaleContext";
import { DEFAULT_LOCALE, LOCALES, MESSAGES, type LocaleCode } from "./locales";

const STORAGE_KEY = "locale";

// Read the saved locale; storage can be blocked, so fall back to the default.
const loadLocale = (): LocaleCode => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return LOCALES.find((l) => l.code === saved)?.code ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(loadLocale);

  const setLocale = (next: LocaleCode) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable: the choice just won't persist.
    }
  };

  // Keep the document language in sync so screen readers pick the right voice.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale }), [locale]);

  return (
    <LocaleContext.Provider value={value}>
      <IntlProvider locale={locale} messages={MESSAGES[locale]} defaultLocale={DEFAULT_LOCALE}>
        {children}
      </IntlProvider>
    </LocaleContext.Provider>
  );
}
