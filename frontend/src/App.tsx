import { useEffect, type MouseEvent } from "react";
import { useLocale } from "./i18n/LocaleContext";
import { LOCALES, type LocaleCode } from "./i18n/locales";
import { useT } from "./i18n/useT";
import { DEFAULT_ITERATION_ID, ITERATIONS, ITERATION_IDS } from "./iterations";
import { IterationPanel } from "./shell/IterationPanel";
import { IterationTabs } from "./shell/IterationTabs";
import { ThemeSwitch } from "./shell/ThemeSwitch";
import { useIterationRoute } from "./shell/useIterationRoute";

export function App() {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const [activeId, selectIteration] = useIterationRoute(ITERATION_IDS, DEFAULT_ITERATION_ID);
  const active = ITERATIONS.find((i) => i.id === activeId) ?? ITERATIONS[0]!;

  useEffect(() => {
    document.title = t("app.title");
  }, [t]);

  // Move focus to the content without touching the URL hash, which holds the active tab.
  const skipToContent = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById("main")?.focus();
  };

  return (
    <>
      <a className="skip-link" href="#main" onClick={skipToContent}>
        {t("app.skipToContent")}
      </a>
      <header className="app-header">
        <div className="app-header-top">
          <h1>{t("app.title")}</h1>
          <div className="header-controls">
            <ThemeSwitch />
            {/* No visible "Language" text; the accessible name comes from aria-label. */}
            <select aria-label={t("locale.label")} value={locale} onChange={(e) => setLocale(e.target.value as LocaleCode)}>
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code} lang={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="tab-bar">
          <IterationTabs iterations={ITERATIONS} activeId={active.id} onSelect={selectIteration} />
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {/* Only the active iteration is mounted, so inactive ones never hold a socket or compete for CPU. */}
        <IterationPanel iteration={active} />
      </main>
    </>
  );
}
