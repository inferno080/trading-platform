import { App } from "../../../src/App";
import { collector } from "../../../src/hud/collector";
import { FakeWebSocket, installFakeWebSocket } from "../../support/fakeWebSocket";
import { withI18n } from "../../support/render";

const mountApp = () => {
  installFakeWebSocket();
  collector.reset();
  cy.mount(withI18n(<App />));
};

describe("App", () => {
  it("shows the title, the tab bar and the theme and language controls", () => {
    mountApp();
    cy.get("h1").should("have.text", "Trading Dashboard");
    cy.get("[role=tab]").should("have.length", 1).and("have.text", "Naive").and("have.attr", "aria-selected", "true");
    cy.get("[role=switch]").should("have.attr", "aria-label", "Dark mode");
    cy.get("select").should("have.attr", "aria-label", "Language");
  });

  it("has no visible 'Language' wording; the picker is named for assistive technology only", () => {
    mountApp();
    cy.get("header").should("not.contain.text", "Language");
  });

  it("describes the active iteration on a single line", () => {
    mountApp();
    cy.get(".iteration-description")
      .should("contain.text", "Every WebSocket message goes straight into React state")
      .then(($p) => {
        const lineHeight = parseFloat(getComputedStyle($p[0] as HTMLElement).lineHeight);
        expect($p.height()).to.be.lessThan(lineHeight * 1.5);
      });
  });

  it("wires the tab panel to its tab", () => {
    mountApp();
    cy.get("[role=tabpanel]").should("have.attr", "id", "panel-naive").and("have.attr", "aria-labelledby", "tab-naive");
  });

  it("sets the page title from the current language", () => {
    mountApp();
    cy.title().should("equal", "Trading Dashboard");
  });

  it("opens the iteration named in the URL, and falls back to the first for an unknown one", () => {
    window.location.hash = "#/naive";
    mountApp();
    cy.get("#tab-naive").should("have.attr", "aria-selected", "true");

    window.location.hash = "#/does-not-exist";
    mountApp();
    cy.get("#tab-naive").should("have.attr", "aria-selected", "true");
  });

  it("switches language from the picker and updates the title, the tabs and the document language", () => {
    mountApp();
    cy.get("select").select("日本語");
    cy.get("h1").should("have.text", "取引ダッシュボード");
    cy.get("#tab-naive").should("have.text", "ナイーブ");
    cy.title().should("equal", "取引ダッシュボード");
    cy.document().its("documentElement.lang").should("equal", "ja-JP");
  });

  it("switches the theme from the header", () => {
    mountApp();
    cy.get("[role=switch]").click();
    cy.document().its("documentElement").should("have.attr", "data-theme", "dark");
  });

  it("moves focus to the content from the skip link without touching the URL hash", () => {
    mountApp();
    cy.get(".skip-link").focus().click();
    cy.focused().should("have.attr", "id", "main");
    cy.location("hash").should("equal", "");
  });

  it("goes live once the feed connects", () => {
    mountApp();
    cy.get(".status").should("contain.text", "Connecting");
    cy.then(() => FakeWebSocket.latest.open());
    cy.get(".status").should("contain.text", "Live");
  });
});
