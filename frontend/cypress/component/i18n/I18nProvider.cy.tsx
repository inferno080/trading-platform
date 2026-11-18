import { useIntl } from "react-intl";
import { blockLocalStorage } from "../../support/storage";
import { I18nProvider } from "../../../src/i18n/I18nProvider";
import { useLocale } from "../../../src/i18n/LocaleContext";
import { useT } from "../../../src/i18n/useT";

function Probe() {
  const { locale, setLocale } = useLocale();
  const t = useT();
  const intl = useIntl();
  return (
    <div>
      <p data-cy="locale">{locale}</p>
      <p data-cy="title">{t("app.title")}</p>
      <p data-cy="caption">{t("table.caption", { count: 5000 })}</p>
      <p data-cy="number">{intl.formatNumber(1234567.5)}</p>
      <button onClick={() => setLocale("ja-JP")}>ja</button>
      <button onClick={() => setLocale("en-GB")}>gb</button>
    </div>
  );
}

const mountProbe = () =>
  cy.mount(
    <I18nProvider>
      <Probe />
    </I18nProvider>,
  );

describe("I18nProvider", () => {
  it("defaults to US English", () => {
    mountProbe();
    cy.get("[data-cy=locale]").should("have.text", "en-US");
    cy.get("[data-cy=title]").should("have.text", "Trading Dashboard");
    cy.get("[data-cy=caption]").should("have.text", "Live quotes for 5,000 instruments");
    cy.document().its("documentElement.lang").should("equal", "en-US");
  });

  it("switches language, formats with the locale and updates the document language", () => {
    mountProbe();
    cy.contains("button", "ja").click();
    cy.get("[data-cy=locale]").should("have.text", "ja-JP");
    cy.get("[data-cy=title]").should("have.text", "取引ダッシュボード");
    cy.get("[data-cy=caption]").should("contain.text", "銘柄のライブ気配値");
    cy.document().its("documentElement.lang").should("equal", "ja-JP");
  });

  it("supports UK English", () => {
    mountProbe();
    cy.contains("button", "gb").click();
    cy.get("[data-cy=locale]").should("have.text", "en-GB");
    cy.document().its("documentElement.lang").should("equal", "en-GB");
  });

  it("remembers the choice for next time", () => {
    mountProbe();
    cy.contains("button", "ja").click();
    cy.window().then((win) => expect(win.localStorage.getItem("locale")).to.equal("ja-JP"));

    mountProbe();
    cy.get("[data-cy=locale]").should("have.text", "ja-JP");
  });

  it("ignores a saved locale it does not know", () => {
    localStorage.setItem("locale", "xx-XX");
    mountProbe();
    cy.get("[data-cy=locale]").should("have.text", "en-US");
  });

  it("keeps working when browser storage is blocked", () => {
    blockLocalStorage();
    mountProbe();
    cy.get("[data-cy=locale]").should("have.text", "en-US");
    cy.contains("button", "ja").click();
    cy.get("[data-cy=locale]").should("have.text", "ja-JP");
  });
});

describe("useLocale without a provider", () => {
  it("falls back to US English and ignores attempts to change it", () => {
    function Bare() {
      const { locale, setLocale } = useLocale();
      return (
        <div>
          <p data-cy="locale">{locale}</p>
          <button onClick={() => setLocale("ja-JP")}>ja</button>
        </div>
      );
    }
    cy.mount(<Bare />);
    cy.contains("button", "ja").click();
    cy.get("[data-cy=locale]").should("have.text", "en-US");
  });
});
