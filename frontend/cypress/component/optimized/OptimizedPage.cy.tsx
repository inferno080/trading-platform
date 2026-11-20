import { OptimizedPage } from "../../../src/optimized/OptimizedPage";
import { FakeWorker } from "../../support/fakeWorker";
import { series } from "../../support/canvas";
import { afterFrames } from "../../support/frames";
import { makeQuote, makeReference, makeReferenceData, makeSession, makeSnapshot } from "../../support/fixtures";
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
      cy.contains("label", "Refresh every (seconds)").should("have.attr", "for", "refresh-seconds");
      refreshBox().should("have.value", "1.5").and("have.attr", "type", "number").and("have.attr", "aria-describedby", "refresh-hint");
      cy.get("#refresh-hint").should("contain.text", "0 draws every frame");
    });

    it("warns in the performance panel that the default interval flatters a benchmark, until it is set to 0", () => {
      mountPage();
      cy.get(".hud-warning").should("contain.text", "refreshes every 1.5 s");
      refreshBox().clear().type("0");
      cy.contains(".hud-warning", "refreshes every").should("not.exist");
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

// ---------- the open chart and the watchlist ----------

const commands = (type: string) => FakeWorker.latest.posted.filter((command) => command.type === type);
const lastCommand = (type: string) => commands(type).at(-1);
const panelItems = () => cy.get(".watchlist .watch-item");

/** A worker that has delivered `count` instruments (AAA, AAB, ...) and the first snapshot. */
const deliverMarketWith = (count: number) => {
  worker().then((w) => {
    w.emit({ type: "ready", scope: "DedicatedWorkerGlobalScope" });
    w.emit({ type: "status", status: "live" });
    w.emit({ type: "session", session: makeSession({ instruments: count }) });
    w.emit({ type: "reference", instruments: Array.from({ length: count }, (_, id) => makeReference(id)) });
    w.emit({ type: "snapshot", quotes: makeSnapshot(1, Array.from({ length: count }, (_, id) => makeQuote(id))).quotes });
  });
  cy.get(".ag-row[row-id]").should("have.length", count);
};
const sendChart = (id: number, last = 29920, count = 60) =>
  worker().then((w) => w.emit({ type: "batch", updates: [], stats: STATS, charts: [{ id, data: Float64Array.from(series(count, (i) => last - (count - 1 - i) * 5)) }] }));

describe("OptimizedPage: the open chart", () => {
  it("opens AAA's chart as the page loads, and tells the worker", () => {
    mountPage();
    cy.wrap(null).should(() => expect(lastCommand("select")).to.deep.equal({ type: "select", id: 0 }));
    deliverMarketWith(6);
    cy.get("#symbol-detail-title").should("have.text", "AAA price chart");
  });

  it("does not move keyboard focus into the chart that opened by itself", () => {
    mountPage();
    deliverMarketWith(6);
    cy.get("#symbol-detail-title").should("exist");
    cy.get("#symbol-detail-title").should("not.have.focus");
  });

  it("shows a skeleton panel from the first moment, before the page has any data", () => {
    mountPage();
    cy.get("section.symbol-detail[role=status] svg.skeleton").should("exist");
    cy.get("#symbol-detail-title").should("not.exist");
  });

  it("shows the chart's skeleton until the chart has been drawn, then the chart", () => {
    mountPage();
    deliverMarketWith(6);
    cy.get(".chart-area .chart-overlay svg.skeleton").should("exist");
    sendChart(0);
    cy.get("canvas.chart-canvas").should("have.attr", "data-ready", "true");
    cy.get(".chart-area .chart-overlay").should("not.exist");
  });

  it("says so when the server has no history for the open symbol, and shows no skeleton", () => {
    mountPage();
    deliverMarketWith(6);
    worker().then((w) => w.emit({ type: "chartUnavailable", id: 0 }));
    cy.get("p.chart-message").should("have.attr", "role", "alert").and("contain.text", "Price history is not available");
    cy.get(".chart-area svg.skeleton").should("not.exist");
  });

  it("opens another symbol's chart when its row is clicked, and tells the worker", () => {
    mountPage();
    deliverMarketWith(6);
    cy.get('.ag-row[row-id="2"] [col-id="name"]').click();
    cy.get("#symbol-detail-title").should("have.text", "AAC price chart");
    cy.wrap(null).should(() => expect(lastCommand("select")).to.deep.equal({ type: "select", id: 2 }));
    cy.get('.ag-row[row-id="2"]').should("have.class", "row-selected");
  });

  it("opens a symbol's chart with Enter on a focused cell of its row", () => {
    mountPage();
    deliverMarketWith(6);
    cy.get('.ag-row[row-id="3"] [col-id="bid"]').click();
    cy.get("#symbol-detail-title").should("have.text", "AAD price chart");
    cy.get('.ag-row[row-id="4"] [col-id="bid"]').click();
    cy.realPress("Enter");
    cy.get("#symbol-detail-title").should("have.text", "S4 price chart");
  });

  it("closes with the Close chart button or Escape, and tells the worker there is no chart", () => {
    mountPage();
    deliverMarketWith(6);
    cy.contains("button", "Close chart").click();
    cy.get("section.symbol-detail").should("not.exist");
    cy.wrap(null).should(() => expect(lastCommand("select")).to.deep.equal({ type: "select", id: null }));
    cy.get('.ag-row[row-id="1"] [col-id="name"]').click();
    cy.get("#symbol-detail-title").should("exist");
    cy.get("body").type("{esc}");
    cy.get("section.symbol-detail").should("not.exist");
  });

  it("holds the chart still when the stream is frozen, and catches up when it is resumed", () => {
    mountPage();
    deliverMarketWith(6);
    refreshBox().clear().type("0");
    sendChart(0, 29920);
    cy.get("canvas.chart-canvas").should("have.attr", "aria-label").and("contain", "last 299.20");
    cy.contains("button", "Freeze stream").click();
    sendChart(0, 31000);
    afterFrames(10);
    cy.get("canvas.chart-canvas").should("have.attr", "aria-label").and("contain", "last 299.20");
    cy.contains("button", "Freeze stream").click();
    cy.get("canvas.chart-canvas").should("have.attr", "aria-label").and("contain", "last 310.00");
  });
});

describe("OptimizedPage: the watchlist", () => {
  it("is on the page from the first moment, with the same layout, so nothing jumps when the data arrives", () => {
    mountPage();
    cy.get(".workspace[data-watchlist=open] .workspace-main .skeleton-frame").should("exist"); // the table's skeleton
    cy.get(".workspace-side .watchlist").should("exist");
  });

  it("shows skeletons for saved entries before the page knows their symbols", () => {
    localStorage.setItem("watchlist", "[1,3]");
    mountPage();
    cy.get(".watchlist .watch-item").should("have.length", 2);
    cy.get(".watchlist .watch-item .mini-chart[role=status] svg.skeleton").should("have.length", 2);
  });

  it("tells the worker about a saved watchlist when it starts", () => {
    localStorage.setItem("watchlist", "[1,3]");
    mountPage();
    cy.wrap(null).should(() => expect(lastCommand("watch")).to.deep.equal({ type: "watch", ids: [1, 3] }));
  });

  describe("adding", () => {
    it("adds the open symbol from its chart: the worker subscribes, and a mini chart appears for it", () => {
      mountPage();
      deliverMarketWith(6);
      cy.contains("button", "Add to watchlist").click();
      cy.get(".watchlist-toggle").should("have.text", "Watchlist (1)");
      panelItems().should("have.length", 1).first().should("contain.text", "AAA");
      cy.wrap(null).should(() => expect(lastCommand("watch")).to.deep.equal({ type: "watch", ids: [0] }));
      cy.contains("button", "Remove from watchlist").should("exist");
      panelItems().first().find("svg.skeleton").should("exist");
      sendChart(0, 29920);
      panelItems().first().find("canvas.mini-canvas").should("have.attr", "data-ready", "true");
      panelItems().first().find(".mini-caption").should("contain.text", "299.20");
    });

    it("shows a toast, and adds nothing, when the watchlist is full", () => {
      localStorage.setItem("watchlist", "[1,2,3,4]");
      mountPage();
      deliverMarketWith(6);
      cy.contains("button", "Add to watchlist").click();
      cy.get(".toast").should("contain.text", "The watchlist is full (4 symbols). Remove one to add another.");
      panelItems().should("have.length", 4);
      cy.get(".watchlist-toggle").should("have.text", "Watchlist (4)");
      cy.then(() => expect(lastCommand("watch")).to.deep.equal({ type: "watch", ids: [1, 2, 3, 4] }));
    });

    it("lets the toast be dismissed with its button", () => {
      localStorage.setItem("watchlist", "[1,2,3,4]");
      mountPage();
      deliverMarketWith(6);
      cy.contains("button", "Add to watchlist").click();
      cy.get(".toast button").click();
      cy.get(".toast").should("not.exist");
    });
  });

  describe("removing (unsubscribing)", () => {
    it("takes the symbol off, tells the worker to unsubscribe, and moves focus to the heading", () => {
      mountPage();
      deliverMarketWith(6);
      cy.contains("button", "Add to watchlist").click();
      panelItems().should("have.length", 1);
      cy.get('button[aria-label="Remove AAA from the watchlist"]').click();
      panelItems().should("have.length", 0);
      cy.get("#watchlist-title").should("have.focus");
      cy.wrap(null).should(() => expect(lastCommand("watch")).to.deep.equal({ type: "watch", ids: [] }));
    });

    it("takes a symbol off from its own chart with Remove from watchlist", () => {
      mountPage();
      deliverMarketWith(6);
      cy.contains("button", "Add to watchlist").click();
      cy.contains("button", "Remove from watchlist").click();
      panelItems().should("have.length", 0);
    });
  });

  it("opens a symbol's chart from its entry", () => {
    localStorage.setItem("watchlist", "[2]");
    mountPage();
    deliverMarketWith(6);
    cy.get('button[aria-label="Open the AAC chart"]').click();
    cy.get("#symbol-detail-title").should("have.text", "AAC price chart");
  });

  describe("collapsing", () => {
    it("hides the panel and gives the grid the whole width, and brings it back", () => {
      mountPage();
      deliverMarketWith(6);
      cy.get(".workspace-main").then(($main) => {
        const open = $main[0]!.getBoundingClientRect().width;
        cy.get(".watchlist-toggle").click();
        cy.get(".workspace").should("have.attr", "data-watchlist", "closed");
        cy.get(".watchlist").should("not.exist");
        cy.get(".workspace-main").should(($m) => expect($m[0]!.getBoundingClientRect().width).to.be.greaterThan(open + 100));
        cy.get(".watchlist-toggle").click();
        cy.get(".watchlist").should("exist");
      });
    });

    it("keeps the symbols subscribed while the panel is hidden", () => {
      mountPage();
      deliverMarketWith(6);
      cy.contains("button", "Add to watchlist").click();
      cy.get(".watchlist-toggle").click();
      cy.then(() => expect(lastCommand("watch")).to.deep.equal({ type: "watch", ids: [0] }));
    });

    it("remembers that it was collapsed", () => {
      localStorage.setItem("watchlist.open", "false");
      mountPage();
      deliverMarketWith(6);
      cy.get(".workspace").should("have.attr", "data-watchlist", "closed");
    });
  });

  it("follows the refresh interval and Freeze, like the grid and the big chart", () => {
    localStorage.setItem("watchlist", "[1]");
    mountPage();
    deliverMarketWith(6);
    refreshBox().clear().type("0");
    sendChart(1, 29920);
    panelItems().first().find(".mini-caption").should("contain.text", "299.20");
    cy.contains("button", "Freeze stream").click();
    sendChart(1, 31000);
    afterFrames(10);
    panelItems().first().find(".mini-caption").should("contain.text", "299.20");
    cy.contains("button", "Freeze stream").click();
    panelItems().first().find(".mini-caption").should("contain.text", "310.00");
  });

  it("can be used with the keyboard alone", () => {
    mountPage();
    deliverMarketWith(6);
    cy.contains("button", "Add to watchlist").focus().realPress("Enter");
    panelItems().should("have.length", 1);
    cy.get(".watchlist-toggle").focus().realPress("Space");
    cy.get(".workspace").should("have.attr", "data-watchlist", "closed");
    cy.get(".watchlist-toggle").realPress("Enter");
    cy.get('button[aria-label="Remove AAA from the watchlist"]').focus().realPress("Enter");
    panelItems().should("have.length", 0);
  });
});
