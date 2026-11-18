import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, type LocaleCode } from "./locales";

interface LocaleState {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
}

export const LocaleContext = createContext<LocaleState>({ locale: DEFAULT_LOCALE, setLocale: () => {} });

// Current locale and a setter, for the language picker.
export const useLocale = (): LocaleState => useContext(LocaleContext);
