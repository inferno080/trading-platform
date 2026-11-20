import { App } from "../../../src/App";
import { collector } from "../../../src/hud/collector";
import { FakeWebSocket, installFakeWebSocket } from "../../support/fakeWebSocket";
import { FakeWorker } from "../../support/fakeWorker";
import { withFakeWorker, withI18n } from "../../support/render";

const mountApp = () => {
  installFakeWebSocket();
  collector.reset();
  cy.mount(withI18n(withFakeWorker(<App />)));
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

// Only the tab that is shown exists. A tab you are not looking at must not hold a connection, a worker, a timer or
// 5,000 table rows, so it cannot slow down the one you are looking at.
describe("App: inactive tabs are destroyed", () => {
  const workers = () => FakeWorker.instances;

  it("starts the Optimized worker, and opens no connection on the page itself", () => {
    mountApp();
    cy.get(".optimized-page").should("exist");
    cy.wrap(FakeWorker.instances).should("have.length", 1); // React starts the worker just after the page appears
    cy.then(() => {
      expect(workers()).to.have.length(1); // the connection belongs to the worker, not to the page
      expect(FakeWebSocket.instances).to.have.length(0);
    });
  });

  it("does not even download the Naive code until its tab is opened", () => {
    mountApp();
    cy.get("#tab-naive").should("have.attr", "aria-selected", "false");
    cy.get(".table-wrap").should("not.exist"); // the Naive page has not been rendered
    cy.then(() => expect(FakeWebSocket.instances).to.have.length(0));
  });

  it("ends the Optimized worker when Naive is opened, and opens one connection for Naive", () => {
    mountApp();
    cy.get(".optimized-page").should("exist");
    cy.wrap(FakeWorker.instances).should("have.length", 1);
    cy.get("#tab-naive").click();
    cy.get(".optimized-page").should("not.exist");
    cy.get(".status").should("exist");
    cy.then(() => {
      expect(workers()[0]?.terminated).to.equal(true);
      expect(workers()[0]?.onmessage).to.equal(null); // nothing is listening any more
      expect(FakeWebSocket.instances).to.have.length(1);
    });
  });

  it("closes the Naive connection for good when leaving, and starts a fresh worker for Optimized", () => {
    mountApp();
    cy.get("#tab-naive").click();
    cy.get(".status").should("exist");
    cy.get("#tab-optimized").click();
    cy.get(".optimized-page").should("exist");
    cy.wrap(FakeWorker.instances).should("have.length", 2);
    cy.then(() => {
      const [naiveSocket] = FakeWebSocket.instances;
      expect(naiveSocket?.closed).to.equal(true);
      expect(naiveSocket?.onmessage).to.equal(null);
      expect(workers()).to.have.length(2);
      expect(workers()[1]?.terminated).to.equal(false);
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

  it("opens a fresh Naive connection each time the tab is opened again", () => {
    window.location.hash = "#/naive";
    mountApp();
    cy.get(".status").should("exist");
    cy.get("#tab-optimized").click();
    cy.get(".optimized-page").should("exist");
    cy.get("#tab-naive").click();
    cy.get(".table-wrap, [role=status]").should("exist");
    cy.then(() => {
      expect(FakeWebSocket.instances).to.have.length(2);
      expect(FakeWebSocket.instances[0]?.closed).to.equal(true); // the old one stays closed
      expect(FakeWebSocket.instances[1]?.closed).to.equal(false); // the new one is live
    });
  });
});
