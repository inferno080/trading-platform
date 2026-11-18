import enGB from "./messages/en-GB.json";
import enUS from "./messages/en-US.json";
import jaJP from "./messages/ja-JP.json";

export type LocaleCode = "en-US" | "en-GB" | "ja-JP";

// Language names are shown in their own language, so they are not translated.
export const LOCALES: { code: LocaleCode; label: string }[] = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "ja-JP", label: "日本語" },
];

// All locales are bundled for now; real locales will be lazy-loaded later.
// Each locale is layered over en-US, so any string missing from a translation shows in English.
export const MESSAGES: Record<LocaleCode, Record<string, string>> = {
  "en-US": enUS,
  "en-GB": { ...enUS, ...enGB },
  "ja-JP": { ...enUS, ...jaJP },
};

export const DEFAULT_LOCALE: LocaleCode = "en-US";
