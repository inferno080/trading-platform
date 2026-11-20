import type { ReactNode } from "react";
import { FeedWorkerContext } from "../../src/feed/FeedWorkerContext";
import { I18nProvider } from "../../src/i18n/I18nProvider";
import { createFakeWorker } from "./fakeWorker";

/** Wrap a component in the app's i18n provider, as main.tsx does. */
export const withI18n = (ui: ReactNode) => <I18nProvider>{ui}</I18nProvider>;

/** Give the page a fake Web Worker instead of a real one (see fakeWorker.ts). */
export const withFakeWorker = (ui: ReactNode) => (
  <FeedWorkerContext.Provider value={createFakeWorker}>{ui}</FeedWorkerContext.Provider>
);
