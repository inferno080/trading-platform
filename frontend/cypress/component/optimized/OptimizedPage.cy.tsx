import type { HistoryRange } from "../../../src/protocol/messages";
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

  describe("the toolbar", () => {
    it("has no Freeze button (pausing the feed is what the chaos controls are for)", () => {
      mountPage();
      cy.contains("button", "Freeze stream").should("not.exist");
    });

    it("puts the record button beside the watchlist toggle, both at the right-hand end", () => {
      mountPage();
      cy.get(".toolbar-end").children().should("have.length", 2);
      cy.get(".toolbar-end > :first-child").should("have.class", "record-button");
      cy.get(".toolbar-end > :last-child").should("have.class", "watchlist-toggle");
      cy.get(".hud .record-button").should("not.exist");
    });

    it("has a performance panel that can be collapsed to its heading", () => {
      mountPage();
      cy.get(".hud-metrics").then(($el) => expect($el[0]!.checkVisibility()).to.equal(true));
      cy.contains("summary", "Performance").click();
      cy.get(".hud-metrics").then(($el) => expect($el[0]!.checkVisibility()).to.equal(false));
    });

    it("puts the watchlist toggle at the right-hand end", () => {
      mountPage();
      cy.get(".toolbar").then(($toolbar) => {
        cy.get(".toolbar .watchlist-toggle").then(($toggle) => {
          const bar = $toolbar[0]!.getBoundingClientRect();
          const toggle = $toggle[0]!.getBoundingClientRect();
          expect(bar.right - toggle.right).to.be.lessThan(2);
        });
      });
    });
  });

  describe("the refresh interval", () => {
    it("is a labelled number box that starts at 1.5 seconds, with no explanation line beside it", () => {
      mountPage();
      cy.contains("label", "Refresh every (seconds)").should("have.attr", "for", "refresh-seconds");
      refreshBox().should("have.value", "1.5").and("have.attr", "type", "number").and("not.have.attr", "aria-describedby");
      cy.get(".refresh-hint").should("not.exist");
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

/** The open chart's data: the page opens on one day, so that is the range its chart is drawn from. */
const newYork = { market: "us", timeZone: "America/New_York", continuous: false, open: Date.UTC(2026, 10, 18, 14, 30), close: Date.UTC(2026, 10, 18, 21, 0) } as const;
const sendOpenChart = (id: number, last = 29920, count = 60, range: HistoryRange = "1d", session?: typeof newYork) =>
  worker().then((w) =>
    w.emit({
      type: "batch",
      updates: [],
      stats: STATS,
      charts: [{ id, range, ...(session ? { session } : {}), data: Float64Array.from(series(count, (i) => last - (count - 1 - i) * 5)) }],
    }),
  );

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
    sendOpenChart(0);
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

});

describe("OptimizedPage: chart ranges", () => {
  const range = (label: string) => cy.contains(".range-button", label).click();
  const posted = (type: string) => worker().then((w) => w.posted.filter((command) => command.type === type));
  const label = () => cy.get("canvas.chart-canvas").invoke("attr", "aria-label");

  it("opens on one day, and tells the worker so as soon as it starts", () => {
    mountPage();
    deliverMarketWith(6);
    cy.get('.range-button[aria-pressed="true"]').should("have.text", "1D");
    posted("range").then((commands) => expect(commands[0]).to.deep.equal({ type: "range", range: "1d" }));
  });

  it("tells the worker which range was chosen", () => {
    mountPage();
    deliverMarketWith(6);
    range("1Y");
    posted("range").then((commands) => {
      expect(commands[0]).to.deep.equal({ type: "range", range: "1d" });
      expect(commands.at(-1)).to.deep.equal({ type: "range", range: "1y" });
    });
  });

  it("shows a skeleton until the range's chart arrives from the worker, then draws it and describes it", () => {
    mountPage();
    deliverMarketWith(6);
    cy.get(".chart-area .chart-overlay svg.skeleton").should("exist");
    sendOpenChart(0, 29920, 60, "1d");
    cy.get("canvas.chart-canvas").should("have.attr", "data-ready", "true");
    label().should("contain", "over the last day").and("contain", "last 299.20");
  });

  it("does not draw the five-minute chart in the open chart, which shows a day", () => {
    mountPage();
    deliverMarketWith(6);
    sendChart(0, 29920); // the tracked five-minute chart, which the watchlist uses
    afterFrames(10);
    cy.get(".chart-area .chart-overlay svg.skeleton").should("exist");
  });

  it("shows the skeleton again when another range is chosen and its chart has not arrived, then that range", () => {
    mountPage();
    deliverMarketWith(6);
    refreshBox().clear().type("0");
    sendOpenChart(0, 29920, 60, "1d");
    cy.get("canvas.chart-canvas").should("have.attr", "data-ready", "true");
    range("1M");
    cy.get(".chart-area .chart-overlay svg.skeleton").should("exist");
    cy.get("canvas.chart-canvas").should("have.attr", "data-ready", "false");
    sendOpenChart(0, 30500, 31, "1m");
    cy.get("canvas.chart-canvas").should("have.attr", "data-ready", "true");
    label().should("contain", "over the last month").and("contain", "last 305.00");
  });

  it("goes back to a range it already has without asking again, and keeps showing the right one", () => {
    mountPage();
    deliverMarketWith(6);
    refreshBox().clear().type("0");
    sendOpenChart(0, 29920, 60, "1d");
    range("1M");
    sendOpenChart(0, 30500, 31, "1m");
    label().should("contain", "last 305.00");
    range("1D");
    label().should("contain", "over the last day").and("contain", "last 299.20");
  });

  it("says what the price line measures against: Today for a day, the range for a longer one", () => {
    mountPage();
    deliverMarketWith(6);
    refreshBox().clear().type("0");
    sendOpenChart(0, 29920, 60, "1d");
    cy.get(".price-line-big .price-today").should("contain.text", "Today");
    range("YTD");
    sendOpenChart(0, 29920, 60, "ytd");
    cy.get(".price-line-big .price-today").should("contain.text", "YTD");
  });

  it("says the histories are simulated", () => {
    mountPage();
    deliverMarketWith(6);
    cy.get(".range-note").should("have.text", "Simulated history");
  });
});

describe("OptimizedPage: the market clock of the chart and the trades", () => {
  const book = {
    depth: { id: 0, bids: [[29917, 2700] as [number, number]], asks: [[29921, 3500] as [number, number]] },
    trades: { id: 0, trades: [{ ts: Date.UTC(2026, 10, 18, 15, 0, 0), price: 29920, size: 300, side: "buy" as const }] },
  };

  it("times the trades on the market's clock, and names it in the heading, once the open symbol's session has arrived", () => {
    mountPage();
    deliverMarketWith(6);
    sendOpenChart(0, 29920, 60, "1d", newYork);
    worker().then((w) => w.emit({ type: "batch", updates: [], stats: STATS, depth: book.depth, trades: book.trades }));
    cy.get("table.tape thead th").first().invoke("text").should("match", /^Time \(E[SD]T\)$/);
    cy.get("table.tape tbody tr").first().find("td").first().invoke("text").should("match", /^(10|11):00:00 AM$/);
  });

  it("keeps the plain heading when the chart arrives with no session", () => {
    mountPage();
    deliverMarketWith(6);
    sendOpenChart(0, 29920, 60, "1d");
    worker().then((w) => w.emit({ type: "batch", updates: [], stats: STATS, depth: book.depth, trades: book.trades }));
    cy.get("table.tape thead th").first().should("have.text", "Time");
  });
});

describe("OptimizedPage: the watchlist", () => {
  it("is on the page from the first moment, with the same layout, so nothing jumps when the data arrives", () => {
    mountPage();
    cy.get(".workspace[data-watchlist=open][data-main=chart] .workspace-main .symbol-detail svg.skeleton").should("exist"); // the chart panel's skeleton
    cy.get(".workspace-side .watchlist").should("exist");
    cy.get(".workspace").next("[role=status]").find(".skeleton-frame").should("exist"); // and the table's skeleton below, outside the row
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
      cy.get(".watchlist-toggle").should("have.text", "Watchlist");
      cy.get("#watchlist-title").should("contain.text", "1 of 4");
      panelItems().should("have.length", 1).first().should("contain.text", "(AAA)");
      cy.wrap(null).should(() => expect(lastCommand("watch")).to.deep.equal({ type: "watch", ids: [0] }));
      cy.contains("button", "Remove from watchlist").should("exist");
      panelItems().first().find("svg.skeleton").should("exist");
      sendChart(0, 29920);
      panelItems().first().find("canvas.mini-canvas").should("have.attr", "data-ready", "true");
      panelItems().first().find(".price-now").should("contain.text", "299.20");
    });

    it("shows a toast, and adds nothing, when the watchlist is full", () => {
      localStorage.setItem("watchlist", "[1,2,3,4]");
      mountPage();
      deliverMarketWith(6);
      cy.contains("button", "Add to watchlist").click();
      cy.get(".toast").should("contain.text", "The watchlist is full (4 symbols). Remove one to add another.");
      panelItems().should("have.length", 4);
      cy.get("#watchlist-title").should("contain.text", "4 of 4");
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
    cy.get('button[aria-label="Open the Cobalt Capital Inc. (AAC) chart"]').click();
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

  describe("asking for a quote", () => {
    it("sends requests, accepts and rejects through the worker, and shows what the worker reports back", () => {
      mountPage();
      deliverMarket();
      cy.contains(".symbol-detail-header button", "Request a quote").click();
      cy.get("dialog[open] #rfq-quantity").type("250{enter}");
      worker().then((w) => {
        const sent = w.posted.find((command) => command.type === "rfq");
        expect(sent).to.deep.include({ type: "rfq" });
        const { ref } = (sent as { request: { ref: number } }).request;
        expect((sent as { request: object }).request).to.deep.include({ t: "rfq", id: 0, side: "buy", quantity: 250 });
        w.emit({ type: "rfqQuote", quote: { t: "rfqQuote", ref, id: 0, side: "buy", quantity: 250, price: 29925, screenPrice: 29921, validForMs: 10_000 } });
      });
      cy.get(".rfq-message").should("contain.text", "You buy 250 AAA at 299.25");
      cy.contains("button", "Accept").click();
      worker().then((w) => {
        expect(w.posted.some((command) => command.type === "rfqAccept")).to.equal(true);
        const ref = (w.posted.find((command) => command.type === "rfqAccept") as { ref: number }).ref;
        w.emit({ type: "rfqResult", result: { t: "rfqResult", ref, outcome: "filled", price: 29925, tradeId: 4 } });
      });
      cy.get(".rfq-message").should("contain.text", "Done: bought 250 AAA at 299.25");
    });

    it("fails the request when the worker says the connection is gone", () => {
      mountPage();
      deliverMarket();
      cy.contains("button", "Request a quote").click();
      cy.get("#rfq-quantity").type("10{enter}");
      worker().then((w) => w.emit({ type: "status", status: "closed" }));
      cy.get(".rfq-message").should("contain.text", "request was cancelled");
    });
  });

  describe("the order book and the trades tape", () => {
    const book = (id: number) => ({
      depth: { id, bids: [[29917, 2700] as [number, number]], asks: [[29921, 3500] as [number, number]] },
      trades: { id, trades: [{ ts: 1, price: 29920, size: 300, side: "buy" as const }] },
    });

    it("shows a skeleton until the order book arrives, then the open symbol's book and trades from the worker's batches", () => {
      mountPage();
      deliverMarket();
      cy.get("table.book").should("not.exist");
      worker().then((w) => w.emit({ type: "batch", updates: [], stats: STATS, depth: book(0).depth, trades: book(0).trades }));
      cy.get("table.book tbody tr").should("have.length.greaterThan", 0);
      cy.get("table.tape tbody tr").should("have.length", 1).and("have.class", "tape-buy");
    });

    it("keeps adding trades to the tape, newest first", () => {
      mountPage();
      deliverMarket();
      worker().then((w) => {
        w.emit({ type: "batch", updates: [], stats: STATS, depth: book(0).depth, trades: book(0).trades });
        w.emit({ type: "batch", updates: [], stats: STATS, trades: { id: 0, trades: [{ ts: 2, price: 29915, size: 50, side: "sell" }] } });
      });
      cy.get("table.tape tbody tr").should("have.length", 2).first().should("have.class", "tape-sell");
    });
  });

  describe("reconnecting", () => {
    it("shows which attempt is next, with a countdown, and asks the worker to retry now when told to", () => {
      mountPage();
      deliverMarket();
      worker().then((w) => {
        w.emit({ type: "status", status: "reconnecting" });
        w.emit({ type: "reconnect", attempt: 2, retryAt: Date.now() + 4000 });
      });
      cy.get(".status").should("have.attr", "data-status", "reconnecting").and("have.text", "Reconnecting (attempt 2)");
      cy.get(".reconnect-countdown").should("contain.text", "next try in");
      cy.contains("button", "Retry now").click();
      worker().then((w) => expect(w.posted.some((command) => command.type === "retry")).to.equal(true));
    });

    it("goes back to live, and drops the countdown, when the worker reconnects", () => {
      mountPage();
      deliverMarket();
      worker().then((w) => {
        w.emit({ type: "status", status: "reconnecting" });
        w.emit({ type: "reconnect", attempt: 1, retryAt: Date.now() + 1000 });
        w.emit({ type: "status", status: "live" });
      });
      cy.get(".status").should("have.attr", "data-status", "live");
      cy.get(".reconnect-countdown").should("not.exist");
    });

    it("keeps the grid on screen while it reconnects", () => {
      mountPage();
      deliverMarket();
      worker().then((w) => w.emit({ type: "status", status: "reconnecting" }));
      cy.get(".ag-row[row-id]").should("have.length", 3);
    });
  });

  describe("chaos controls", () => {
    it("asks the worker to send the chosen fault, with its number when it has one", () => {
      mountPage();
      deliverMarket();
      cy.contains("summary", "Chaos controls").click();
      cy.contains("button", "Drop the connection").click();
      cy.contains(".chaos-row", "Send a burst").find("input").clear().type("8");
      cy.contains("button", "Send a burst").click();
      worker().then((w) => {
        const chaos = w.posted.filter((command) => command.type === "chaos");
        expect(chaos).to.deep.equal([
          { type: "chaos", action: "drop", value: undefined },
          { type: "chaos", action: "burst", value: 8 },
        ]);
      });
    });

    it("is disabled while the connection is not live", () => {
      mountPage();
      cy.contains("summary", "Chaos controls").click();
      cy.get(".chaos-row button").first().should("be.disabled");
    });
  });
});
