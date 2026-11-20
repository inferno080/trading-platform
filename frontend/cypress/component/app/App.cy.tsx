import { App } from "../../../src/App";
import { collector } from "../../../src/hud/collector";
import { FakeWebSocket, installFakeWebSocket } from "../../support/fakeWebSocket";
import { withI18n } from "../../support/render";

const mountApp = () => {
  installFakeWebSocket();
  collector.reset();
  cy.mount(withI18n(<App />));
};

/** Assert that a description paragraph fits on one line. */
const shouldBeOneLine = ($p: JQuery<HTMLElement>) => {
  const lineHeight = parseFloat(getComputedStyle($p[0] as HTMLElement).lineHeight);
  expect($p.height()).to.be.lessThan(lineHeight * 1.5);
};

describe("App", () => {
  it("shows the title, the tab bar and the theme and language controls", () => {
    mountApp();
    cy.get("h1").should("have.text", "Trading Dashboard");
    cy.get("[role=tab]").should("have.length", 2);
    cy.get("#tab-optimized").should("have.text", "Optimized").and("have.attr", "aria-selected", "true");
    cy.get("#tab-naive").should("have.text", "Naive").and("have.attr", "aria-selected", "false");
    cy.get("[role=switch]").should("have.attr", "aria-label", "Dark mode");
    cy.get("select").should("have.attr", "aria-label", "Language");
  });

  it("has no visible 'Language' wording; the picker is named for assistive technology only", () => {
    mountApp();
    cy.get("header").should("not.contain.text", "Language");
  });

  it("opens on the Optimized tab and describes it on a single line", () => {
    mountApp();
    cy.get(".iteration-description")
      .should("contain.text", "A Web Worker owns the connection")
      .then(shouldBeOneLine);
  });

  it("describes the Naive tab on a single line too", () => {
    window.location.hash = "#/naive";
    mountApp();
    cy.get(".iteration-description")
      .should("contain.text", "Every WebSocket message goes straight into React state")
      .then(shouldBeOneLine);
  });

  it("wires the tab panel to the active tab", () => {
    mountApp();
    cy.get("[role=tabpanel]").should("have.attr", "id", "panel-optimized").and("have.attr", "aria-labelledby", "tab-optimized");
  });

  it("sets the page title from the current language", () => {
    mountApp();
    cy.title().should("equal", "Trading Dashboard");
  });

  // Each of these is its own test, so each starts from a fresh mount: mounting twice in one test would
  // re-render the same tree and keep the first mount's state.
  it("opens the iteration named in the URL", () => {
    window.location.hash = "#/naive";
    mountApp();
    cy.get("#tab-naive").should("have.attr", "aria-selected", "true");
  });

  it("falls back to Optimized for an address that names no iteration", () => {
    window.location.hash = "#/does-not-exist";
    mountApp();
    cy.get("#tab-optimized").should("have.attr", "aria-selected", "true");
  });

  it("opens on Optimized when the address names nothing", () => {
    window.location.hash = "";
    mountApp();
    cy.get("#tab-optimized").should("have.attr", "aria-selected", "true");
  });

  it("switches language from the picker and updates the title, the tabs and the document language", () => {
    mountApp();
    cy.get("select").select("日本語");
    cy.get("h1").should("have.text", "取引ダッシュボード");
    cy.get("#tab-optimized").should("have.text", "最適化版");
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

  it("goes live once the Naive feed connects", () => {
    window.location.hash = "#/naive";
    mountApp();
    cy.get(".status").should("contain.text", "Connecting");
    cy.then(() => FakeWebSocket.latest.open());
    cy.get(".status").should("contain.text", "Live");
  });
});

// Only the tab that is shown exists. A tab you are not looking at must not hold a connection, a timer or 5,000
// table rows, so it cannot slow down the one you are looking at.
describe("App: inactive tabs are destroyed", () => {
  it("opens no connection at all while the Optimized tab is shown", () => {
    mountApp();
    cy.get(".placeholder").should("exist");
    cy.then(() => expect(FakeWebSocket.instances).to.have.length(0));
  });

  it("does not even download the Naive code until its tab is opened", () => {
    mountApp();
    cy.get("#tab-naive").should("have.attr", "aria-selected", "false");
    cy.get(".status").should("not.exist"); // the Naive page has not been rendered
    cy.get(".table-wrap").should("not.exist");
  });

  it("opens one connection when Naive is opened, and closes it for good when leaving", () => {
    mountApp();
    cy.get("#tab-naive").click();
    cy.get(".status").should("exist");
    cy.then(() => expect(FakeWebSocket.instances).to.have.length(1));

    cy.get("#tab-optimized").click();
    cy.get(".placeholder").should("exist");
    cy.get(".status").should("not.exist"); // the Naive page is gone from the page
    cy.then(() => {
      const [naiveSocket] = FakeWebSocket.instances;
      expect(naiveSocket?.closed).to.equal(true);
      expect(naiveSocket?.onmessage).to.equal(null); // nothing is listening any more
    });
  });

  it("removes the Naive table, with all its rows, when leaving the tab", () => {
    window.location.hash = "#/naive";
    mountApp();
    cy.get(".status").should("exist");
    cy.get("#tab-optimized").click();
    cy.get(".table-wrap").should("not.exist");
    cy.get("tbody").should("not.exist");
  });

  it("opens a fresh connection each time Naive is opened again", () => {
    mountApp();
    cy.get("#tab-naive").click();
    cy.get(".status").should("exist");
    cy.get("#tab-optimized").click();
    cy.get(".status").should("not.exist");
    cy.get("#tab-naive").click();
    cy.get(".status").should("exist");
    cy.then(() => {
      expect(FakeWebSocket.instances).to.have.length(2);
      expect(FakeWebSocket.instances[0]?.closed).to.equal(true); // the old one stays closed
      expect(FakeWebSocket.instances[1]?.closed).to.equal(false); // the new one is live
    });
  });
});
