import { OptimizedPage } from "../../../src/optimized/OptimizedPage";
import { FakeWorker } from "../../support/fakeWorker";
import { makeQuote, makeReferenceData, makeSession, makeSnapshot } from "../../support/fixtures";
import { withFakeWorker, withI18n } from "../../support/render";

const STATS = { messages: 5, updatesIn: 100, gaps: 0, latencies: [3] };
const mountPage = () => {
  cy.mount(withI18n(withFakeWorker(<OptimizedPage />)));
  cy.wrap(FakeWorker.instances).should("have.length.greaterThan", 0); // React starts the worker just after mounting
};
const worker = () => cy.then(() => FakeWorker.latest);
const last = (rowId: number) => cy.get(`[row-id="${rowId}"] [col-id="last"]`);
const refreshBox = () => cy.get("#refresh-seconds");

// A worker that has connected, been accepted, and delivered the reference data and the first snapshot.
const deliverMarket = () =>
  worker().then((w) => {
    w.emit({ type: "ready", scope: "DedicatedWorkerGlobalScope" });
    w.emit({ type: "status", status: "live" });
    w.emit({ type: "session", session: makeSession() });
    w.emit({ type: "reference", instruments: makeReferenceData().instruments });
    w.emit({ type: "snapshot", quotes: makeSnapshot(1).quotes });
  }).then(() => cy.get(".ag-row[row-id]").should("have.length", 3)); // the grid has mounted, so what follows is drawn as a change
const sendBatch = (last: number) =>
  worker().then((w) => w.emit({ type: "batch", updates: [makeQuote(0, { last })], stats: STATS }));

describe("OptimizedPage", () => {
  describe("before the worker has reported", () => {
    it("is a labelled region that says it is connecting", () => {
      mountPage();
      cy.get("section.optimized-page").should("have.attr", "aria-label", "Optimized version");
      cy.get(".status").should("have.attr", "data-status", "connecting").and("have.text", "Connecting");
    });

    it("shows a shimmering placeholder for the grid, which assistive technology hears as text", () => {
      mountPage();
      cy.get(".skeleton-frame").should("exist");
      cy.contains(".visually-hidden", "Waiting for the first snapshot and the reference data").should("exist");
      cy.get(".ag-root-wrapper").should("not.exist");
    });

    it("includes the performance panel, ready to record a run", () => {
      mountPage();
      cy.get(".hud").should("exist");
      cy.get(".record-button").should("be.disabled"); // nothing to record until there is a session
    });

    it("has no panel of facts about the connection", () => {
      mountPage();
      deliverMarket();
      cy.get(".facts").should("not.exist");
    });
  });

  it("records, for the tests, where the connection runs", () => {
    mountPage();
    cy.get("section.optimized-page").should("not.have.attr", "data-worker-scope");
    deliverMarket();
    cy.get("section.optimized-page").should("have.attr", "data-worker-scope", "DedicatedWorkerGlobalScope");
  });

  it("goes live when the worker says so", () => {
    mountPage();
    deliverMarket();
    cy.get(".status").should("have.attr", "data-status", "live");
  });

  describe("alerts", () => {
    it("says so when the server speaks another protocol version", () => {
      mountPage();
      worker().then((w) => w.emit({ type: "badVersion", version: 1 }));
      cy.get("[role=alert]").should("contain.text", "Unsupported protocol version 1").and("contain.text", "expects version 2");
    });

    it("says so when the reference data is late, and withdraws it when the data arrives", () => {
      mountPage();
      worker().then((w) => w.emit({ type: "referenceTimeout" }));
      cy.get("[role=alert]").should("contain.text", "The reference data did not arrive");
      worker().then((w) => w.emit({ type: "reference", instruments: makeReferenceData().instruments }));
      cy.get("[role=alert]").should("not.exist");
    });
  });

  describe("the grid", () => {
    it("appears only once both the reference data and the first snapshot have arrived", () => {
      mountPage();
      worker().then((w) => w.emit({ type: "reference", instruments: makeReferenceData().instruments }));
      cy.get(".ag-root-wrapper").should("not.exist");
      worker().then((w) => w.emit({ type: "snapshot", quotes: makeSnapshot(1).quotes }));
      cy.get(".ag-root-wrapper").should("exist");
      cy.get(".skeleton-frame").should("not.exist");
    });

    it("stays in place when another snapshot arrives after a gap", () => {
      mountPage();
      deliverMarket();
      worker().then((w) => w.emit({ type: "snapshot", quotes: [makeQuote(0, { last: 31000 }), makeQuote(1), makeQuote(2)] }));
      last(0).should("contain.text", "310.00");
      cy.get(".ag-root-wrapper").should("have.length", 1);
    });
  });

  describe("the refresh interval", () => {
    it("is a labelled number box that starts at 1.5 seconds, with a hint", () => {
      mountPage();
      cy.contains("label", "Refresh grid every (seconds)").should("have.attr", "for", "refresh-seconds");
      refreshBox().should("have.value", "1.5").and("have.attr", "type", "number").and("have.attr", "aria-describedby", "refresh-hint");
      cy.get("#refresh-hint").should("contain.text", "0 draws every frame");
    });

    it("holds changes back at the start, because the interval is 1.5 seconds", () => {
      mountPage();
      deliverMarket();
      sendBatch(31000);
      last(0).should("have.text", "299.20");
    });

    it("draws changes at once when set to 0, and draws any that were held back", () => {
      mountPage();
      deliverMarket();
      sendBatch(31000);
      last(0).should("have.text", "299.20");
      refreshBox().clear().type("0");
      last(0).should("contain.text", "310.00"); // what was waiting is drawn
      sendBatch(32000);
      last(0).should("contain.text", "320.00"); // and changes are drawn as they arrive
    });

    it("draws changes after the chosen interval", () => {
      mountPage();
      deliverMarket();
      refreshBox().clear().type("0.4");
      sendBatch(31000);
      last(0).should("contain.text", "310.00");
    });

    it("ignores a number that is not allowed, and puts the real value back when the box is left", () => {
      mountPage();
      deliverMarket();
      refreshBox().clear().type("0");
      refreshBox().clear().type("-5"); // not allowed: the interval stays 0
      sendBatch(31000);
      last(0).should("contain.text", "310.00");
      refreshBox().blur().should("have.value", "0");
    });

    it("ignores an empty box, and keeps the interval it had", () => {
      mountPage();
      deliverMarket();
      refreshBox().clear().type("0");
      refreshBox().clear();
      sendBatch(31000);
      last(0).should("contain.text", "310.00"); // still 0
    });
  });

  describe("the freeze button", () => {
    it("starts unpressed, and shows no frozen note", () => {
      mountPage();
      cy.contains("button", "Freeze stream").should("have.attr", "aria-pressed", "false");
      cy.contains("Stream frozen").should("not.exist");
    });

    it("holds the grid still while pressed, says so, and shows the latest when pressed again", () => {
      mountPage();
      deliverMarket();
      refreshBox().clear().type("0");
      last(0).should("have.text", "299.20");
      cy.contains("button", "Freeze stream").click().should("have.attr", "aria-pressed", "true");
      cy.get(".frozen-note").should("contain.text", "Stream frozen");
      sendBatch(31000);
      last(0).should("have.text", "299.20");
      cy.contains("button", "Freeze stream").click().should("have.attr", "aria-pressed", "false");
      cy.get(".frozen-note").should("have.text", "");
      last(0).should("contain.text", "310.00");
    });
  });

  it("ends its worker when the page is left", () => {
    mountPage();
    cy.then(() => cy.mount(<span>gone</span>));
    cy.then(() => expect(FakeWorker.latest.terminated).to.equal(true));
  });
});
