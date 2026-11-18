import type { ReactNode } from "react";
import { I18nProvider } from "../../src/i18n/I18nProvider";

/** Wrap a component in the app's i18n provider, as main.tsx does. */
export const withI18n = (ui: ReactNode) => <I18nProvider>{ui}</I18nProvider>;
