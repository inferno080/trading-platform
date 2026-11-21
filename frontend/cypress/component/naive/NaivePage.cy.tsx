import { decode } from "@msgpack/msgpack";
import { collector } from "../../../src/hud/collector";
import { NaivePage } from "../../../src/naive/NaivePage";
import { REFERENCE_TIMEOUT_MS } from "../../../src/naive/useNaiveFeed";
import { FakeWebSocket, installFakeWebSocket } from "../../support/fakeWebSocket";
import {
  makeDelta,
  makeHistory,
  makeQuote,
  makeReference,
  makeReferenceData,
  makeRejected,
  makeSession,
  makeSnapshot,
  makeUpdate,
} from "../../support/fixtures";
import { withI18n } from "../../support/render";

const socket = () => FakeWebSocket.latest;

/** What the page has sent to the server so far, as message types (decoded from the binary frames). */
const allSentTypes = (): string[] => socket().sent.map((frame) => (decode(frame) as { t: string }).t);

/**
 * The same, without the requests for the open chart and the watchlist (history, subscribe, unsubscribe): the page
 * opens AAA's chart as it loads, and those requests have their own tests (in the chart and watchlist specs).
 */
const sentTypes = (): string[] => allSentTypes().filter((type) => !["history", "subscribe", "unsubscribe"].includes(type));

/** Mount the page with a fake socket, and wait until the page has created its connection. */
const mountPage = () => {
  installFakeWebSocket();
  collector.reset();
  cy.mount(withI18n(<NaivePage />));
  cy.wrap(null).should(() => expect(FakeWebSocket.instances).to.have.length.greaterThan(0));
};

/** Bring the page to a live table of three instruments, with the feed at sequence 5. */
const goLive = () => {
  mountPage();
  cy.then(() => {
    socket().open();
    socket().receive(makeSession());
    socket().receive(makeSnapshot(5));
    socket().receive(makeReferenceData());
  });
  cy.get("tbody tr").should("have.length", 3);
};

// The data cells of a row are: name, currency, bid, ask, ...
const bidOfRow = (row: number) => cy.get("tbody tr").eq(row).find("td").eq(2);

describe("NaivePage and its live feed", () => {
  it("connects to the local backend by default and asks for binary frames", () => {
    mountPage();
    cy.then(() => {
      expect(socket().url).to.equal("ws://localhost:8080");
      expect(socket().binaryType).to.equal("arraybuffer");
    });
  });

  it("shows Connecting, then Live once the connection opens", () => {
    mountPage();
    cy.get(".status").should("have.attr", "data-status", "connecting").and("contain.text", "Connecting");
    cy.then(() => socket().open());
    cy.get(".status").should("have.attr", "data-status", "live").and("contain.text", "Live");
  });

  describe("reference data", () => {
    it("asks for it exactly once, right after the session, and sends nothing before that", () => {
      mountPage();
      cy.then(() => {
        socket().open();
        expect(sentTypes()).to.deep.equal([]);
        socket().receive(makeSession());
      });
      cy.then(() => expect(sentTypes()).to.deep.equal(["reference"]));
    });

    it("never asks again: a snapshot, updates and a recovered gap add only a resync request", () => {
      goLive();
      cy.then(() => {
        socket().receive(makeDelta(6, [makeUpdate(0)]));
        socket().receive(makeDelta(8, [makeUpdate(0)])); // frame 7 is missing: a gap
      });
      cy.then(() => expect(sentTypes()).to.deep.equal(["reference", "resync"]));
    });

    it("shows the skeleton until both the snapshot and the reference data have arrived (snapshot first)", () => {
      mountPage();
      cy.then(() => {
        socket().open();
        socket().receive(makeSession());
        socket().receive(makeSnapshot(5));
      });
      cy.get(".skeleton-frame svg.skeleton").should("exist");
      cy.get("table").should("not.exist");
      cy.then(() => socket().receive(makeReferenceData()));
      cy.get("tbody tr").should("have.length", 3);
      cy.get(".skeleton-frame").should("not.exist"); // the table's own skeleton; the charts keep theirs until their history arrives
    });

    it("also works when the reference data arrives before the snapshot", () => {
      mountPage();
      cy.then(() => {
        socket().open();
        socket().receive(makeSession());
        socket().receive(makeReferenceData());
      });
      cy.get("table").should("not.exist");
      cy.then(() => socket().receive(makeSnapshot(5)));
      cy.get("tbody tr").should("have.length", 3);
    });

    it("prices each row with the decimals from its own reference data", () => {
      mountPage();
      cy.then(() => {
        socket().open();
        socket().receive(makeSession());
        socket().receive(makeSnapshot(5, [makeQuote(0), makeQuote(1, { bid: 47213, ask: 47217, last: 47215 })]));
        socket().receive(
          makeReferenceData([makeReference(0), makeReference(1, { currency: "JPY", tickSize: 1, decimals: 0, prevClose: 46566 })]),
        );
      });
      bidOfRow(0).should("have.text", "299.17");
      bidOfRow(1).should("have.text", "47,213");
    });

    it("tells the user when the reference data never arrives, and recovers if it comes late", () => {
      cy.clock();
      mountPage();
      cy.then(() => {
        socket().open();
        socket().receive(makeSession());
        socket().receive(makeSnapshot(5));
      });
      cy.get("[role=alert]").should("not.exist"); // still within the waiting time
      cy.tick(REFERENCE_TIMEOUT_MS);
      cy.get("[role=alert]").should("contain.text", "The reference data did not arrive");
      cy.get("table").should("not.exist");

      cy.then(() => socket().receive(makeReferenceData()));
      cy.get("[role=alert]").should("not.exist");
      cy.get("tbody tr").should("have.length", 3);
    });

    it("does not complain after the reference data has arrived in time", () => {
      cy.clock();
      goLive();
      cy.tick(REFERENCE_TIMEOUT_MS * 2);
      cy.get("[role=alert]").should("not.exist");
    });

    it("stops waiting for it when the page is removed", () => {
      cy.clock();
      mountPage();
      cy.then(() => {
        socket().open();
        socket().receive(makeSession());
      });
      cy.mount(<p>elsewhere</p>);
      cy.tick(REFERENCE_TIMEOUT_MS * 2);
      cy.contains("elsewhere").should("exist");
    });
  });

  it("shows a skeleton until the first snapshot, then the table", () => {
    mountPage();
    cy.get(".skeleton-frame svg.skeleton").should("exist"); // the table's own skeleton
    cy.then(() => {
      socket().open();
      socket().receive(makeSession());
      socket().receive(makeSnapshot(5));
      socket().receive(makeReferenceData());
    });
    cy.get("table").should("exist");
    cy.get("tbody tr").should("have.length", 3);
    cy.get(".skeleton-frame").should("not.exist"); // the charts keep theirs until their history arrives
  });

  it("enables recording only after the session handshake", () => {
    mountPage();
    cy.get(".record-button").should("be.disabled");
    cy.then(() => socket().receive(makeSession()));
    cy.get(".record-button").should("be.enabled");
  });

  it("applies each update to the right instrument", () => {
    goLive();
    cy.then(() => socket().receive(makeDelta(6, [makeUpdate(1, { bid: 30000, ask: 30004 })])));
    bidOfRow(1).should("have.text", "300.00");
    bidOfRow(0).should("have.text", "299.17");
    bidOfRow(2).should("have.text", "299.17");
  });

  it("ignores updates for instruments it does not know", () => {
    goLive();
    cy.then(() => socket().receive(makeDelta(6, [makeUpdate(99, { bid: 1 })])));
    cy.get("tbody tr").should("have.length", 3);
    bidOfRow(0).should("have.text", "299.17");
  });

  it("counts applied updates for the performance panel", () => {
    goLive();
    cy.then(() => {
      collector.reset();
      socket().receive(makeDelta(6, [makeUpdate(0), makeUpdate(1)]));
    });
    cy.wrap(null).should(() => {
      const window = collector.drain();
      expect(window.messages).to.equal(1);
      expect(window.updates).to.equal(2);
    });
  });

  it("ignores updates that arrive before the first snapshot", () => {
    mountPage();
    cy.then(() => {
      socket().open();
      socket().receive(makeSession());
      socket().receive(makeDelta(1, [makeUpdate(0)]));
    });
    cy.get("svg.skeleton").should("exist");
    cy.then(() => expect(sentTypes()).to.deep.equal(["reference"])); // no resync: it was not a gap
  });

  it("asks for a fresh snapshot when a frame is missed, then ignores updates until it arrives", () => {
    goLive();
    // Frame 6 never arrives, so frame 7 reveals a gap.
    cy.then(() => socket().receive(makeDelta(7, [makeUpdate(0, { bid: 31000, ask: 31004 })])));
    cy.then(() => {
      expect(sentTypes()).to.deep.equal(["reference", "resync"]);
      expect(collector.totalGaps).to.equal(1);
    });
    bidOfRow(0).should("have.text", "299.17"); // the out-of-order update was not applied

    // While waiting for the snapshot, further updates are ignored and do not ask again.
    cy.then(() => socket().receive(makeDelta(8, [makeUpdate(0, { bid: 32000, ask: 32004 })])));
    cy.then(() => expect(sentTypes()).to.deep.equal(["reference", "resync"]));
    bidOfRow(0).should("have.text", "299.17");

    // The snapshot restores the state, and updates apply again from there.
    cy.then(() => socket().receive(makeSnapshot(10, [makeQuote(0, { bid: 30100, ask: 30104 }), makeQuote(1), makeQuote(2)])));
    bidOfRow(0).should("have.text", "301.00");
    cy.then(() => socket().receive(makeDelta(11, [makeUpdate(0, { bid: 30200, ask: 30204 })])));
    bidOfRow(0).should("have.text", "302.00");
  });

  it("refuses a server that speaks a different protocol version, and asks it for nothing", () => {
    mountPage();
    cy.then(() => {
      socket().open();
      socket().receive(makeSession({ v: 99 }));
    });
    cy.get("[role=alert]").should("contain.text", "Unsupported protocol version 99").and("contain.text", "version 2");
    cy.get(".status").should("have.attr", "data-status", "error");
    cy.then(() => {
      expect(socket().closed).to.equal(true);
      expect(sentTypes()).to.deep.equal([]);
    });
    cy.get(".record-button").should("be.disabled");
  });

  it("refuses an older server that still speaks version 1", () => {
    mountPage();
    cy.then(() => {
      socket().open();
      socket().receive(makeSession({ v: 1 }));
    });
    cy.get("[role=alert]").should("contain.text", "Unsupported protocol version 1");
  });

  it("reports a connection error, and keeps reporting it after the socket closes", () => {
    mountPage();
    cy.then(() => socket().fail());
    cy.get(".status").should("have.attr", "data-status", "error").and("contain.text", "Connection error");
    cy.then(() => socket().drop());
    cy.get(".status").should("have.attr", "data-status", "error");
  });

  it("reports a clean disconnect when the server closes the connection", () => {
    mountPage();
    cy.then(() => {
      socket().open();
      socket().drop();
    });
    cy.get(".status").should("have.attr", "data-status", "closed").and("contain.text", "Disconnected");
  });

  it("closes its connection and stops listening when the page is removed", () => {
    mountPage();
    cy.mount(<p>elsewhere</p>);
    cy.then(() => {
      expect(socket().closed).to.equal(true);
      expect(socket().onmessage).to.equal(null);
      expect(socket().onopen).to.equal(null);
    });
  });

  it("shows the status in Japanese when that language is selected", () => {
    localStorage.setItem("locale", "ja-JP");
    mountPage();
    cy.then(() => socket().open());
    cy.get(".status").should("contain.text", "ライブ");
  });
});

// ---------- the open chart and the watchlist ----------

// What the page has sent about one instrument, as "type id" strings (history, subscribe, unsubscribe).
const requests = (): string[] =>
  socket()
    .sent.map((frame) => decode(frame) as { t: string; id?: number })
    .filter((message) => message.id !== undefined)
    .map((message) => `${message.t} ${message.id}`);

/** A live page with `count` instruments (AAA, AAB, ...), after the first snapshot and the reference data. */
const goLiveWith = (count: number) => {
  mountPage();
  cy.then(() => {
    socket().open();
    socket().receive(makeSession());
    socket().receive(makeSnapshot(5, Array.from({ length: count }, (_, id) => makeQuote(id))));
    socket().receive(makeReferenceData(Array.from({ length: count }, (_, id) => makeReference(id))));
  });
  cy.get("tbody tr").should("have.length", count);
};
const deliverHistory = (id: number, last = 29920, count = 60) => cy.then(() => socket().receive(makeHistory(id, count, last)));
const chartLabel = () => cy.get("canvas.chart-canvas").invoke("attr", "aria-label");

describe("NaivePage: the open chart", () => {
  it("opens AAA's chart as the page loads, and asks the server for its history once connected", () => {
    goLiveWith(3);
    cy.get("#symbol-detail-title").should("have.text", "AAA price chart");
    cy.then(() => expect(requests()).to.include("history 0"));
  });

  it("does not move keyboard focus into the chart that opened by itself", () => {
    goLiveWith(3);
    cy.get("#symbol-detail-title").should("exist");
    cy.get("#symbol-detail-title").should("not.have.focus");
  });

  it("shows a skeleton panel from the first moment, before the page even knows the symbol", () => {
    mountPage();
    cy.get("section.symbol-detail[role=status] svg.skeleton").should("exist");
    cy.get("#symbol-detail-title").should("not.exist");
  });

  it("shows the chart's skeleton until the history arrives, then the chart", () => {
    goLiveWith(3);
    cy.get(".chart-area .chart-overlay svg.skeleton").should("exist");
    deliverHistory(0);
    cy.get("canvas.chart-canvas").should("have.attr", "data-ready", "true");
    cy.get(".chart-area .chart-overlay").should("not.exist");
  });

  it("folds each live update of the open symbol into its chart", () => {
    goLiveWith(3);
    deliverHistory(0, 29920);
    chartLabel().should("contain", "last 299.20");
    cy.then(() => socket().receive({ ...makeDelta(6, [makeUpdate(0, { last: 30500, ts: Date.now() + 5000 })]), ts: Date.now() }));
    chartLabel().should("contain", "last 305.00").and("contain", "high 305.00");
  });

  it("does not change the chart for updates of other symbols", () => {
    goLiveWith(3);
    deliverHistory(0, 29920);
    chartLabel().should("contain", "last 299.20");
    cy.then(() => socket().receive(makeDelta(6, [makeUpdate(1, { last: 99999 }), makeUpdate(2, { last: 99999 })])));
    cy.get("tbody tr").eq(1).find("td").eq(5).should("contain.text", "999.99"); // the table did update
    chartLabel().should("contain", "last 299.20");
  });

  it("says so when the server has no history for the open symbol, and shows no skeleton", () => {
    goLiveWith(3);
    cy.then(() => socket().receive(makeRejected("history", 0)));
    cy.get("p.chart-message").should("have.attr", "role", "alert").and("contain.text", "Price history is not available");
    cy.get(".chart-area svg.skeleton").should("not.exist");
  });

  it("ignores a history that arrives for a symbol that is no longer open", () => {
    goLiveWith(3);
    cy.contains("tbody tr", "AAB").find("button").click();
    cy.get("#symbol-detail-title").should("have.text", "AAB price chart");
    deliverHistory(0); // the answer for AAA, arriving late
    cy.get(".chart-area .chart-overlay svg.skeleton").should("exist");
  });

  describe("choosing another symbol", () => {
    it("opens its chart, asks for its history, and stops following the old one", () => {
      goLiveWith(3);
      deliverHistory(0, 29920);
      cy.contains("tbody tr", "AAB").find("button").click();
      cy.get("#symbol-detail-title").should("have.text", "AAB price chart");
      cy.then(() => expect(requests()).to.include("history 1"));
      cy.get(".chart-area .chart-overlay svg.skeleton").should("exist"); // a fresh chart, not the old one
      deliverHistory(1, 31000);
      chartLabel().should("contain", "AAB").and("contain", "last 310.00");
    });

    it("marks the chosen row in the table", () => {
      goLiveWith(3);
      cy.get("tbody tr").eq(0).should("have.class", "row-selected");
      cy.contains("tbody tr", "AAC").find("button").click();
      cy.get("tbody tr").eq(2).should("have.class", "row-selected");
      cy.get("tbody tr").eq(0).should("not.have.class", "row-selected");
    });

    it("takes keyboard focus into the chart now, because the person chose it", () => {
      goLiveWith(3);
      cy.contains("tbody tr", "AAB").find("button").click();
      cy.get("#symbol-detail-title").should("have.text", "AAB price chart");
    });
  });

  describe("closing", () => {
    it("closes with the Close chart button, and the symbol's row is no longer marked", () => {
      goLiveWith(3);
      cy.contains("button", "Close chart").click();
      cy.get("section.symbol-detail").should("not.exist");
      cy.get("tbody tr.row-selected").should("not.exist");
    });

    it("closes with Escape", () => {
      goLiveWith(3);
      cy.get("#symbol-detail-title").should("exist");
      cy.get("body").type("{esc}");
      cy.get("section.symbol-detail").should("not.exist");
    });

    it("stops following the symbol once closed", () => {
      goLiveWith(3);
      deliverHistory(0);
      cy.contains("button", "Close chart").click();
      cy.then(() => socket().receive(makeDelta(6, [makeUpdate(0, { last: 40000 })])));
      cy.get("canvas.chart-canvas").should("not.exist");
    });

    it("opens the chart again, asking for a fresh history", () => {
      goLiveWith(3);
      cy.contains("button", "Close chart").click();
      cy.contains("tbody tr", "AAA").find("button").click();
      cy.get("#symbol-detail-title").should("have.text", "AAA price chart");
      cy.then(() => expect(requests().filter((request) => request === "history 0")).to.have.length(2));
    });
  });

  it("asks for the history again if the connection is replaced while a chart is open (the page opens a new one on a remount)", () => {
    goLiveWith(3);
    cy.then(() => expect(requests()).to.include("history 0"));
    cy.then(() => {
      FakeWebSocket.latest.open(); // an open event again, as after a reconnect
    });
    cy.then(() => expect(requests().filter((request) => request === "history 0")).to.have.length(2));
  });
});

describe("NaivePage: the watchlist", () => {
  const panelItems = () => cy.get(".watchlist .watch-item");

  it("starts empty and open, with a button that says Watchlist (no count), and the heading says how many of the four are used", () => {
    goLiveWith(6);
    cy.get(".workspace").should("have.attr", "data-watchlist", "open");
    cy.get(".watchlist-toggle").should("have.text", "Watchlist").and("have.attr", "aria-expanded", "true");
    cy.get("#watchlist-title").should("contain.text", "0 of 4");
    cy.get(".watchlist-empty").should("exist");
  });

  describe("adding", () => {
    it("adds the open symbol from its chart: it subscribes, asks for its history, and shows a mini chart for it", () => {
      goLiveWith(6);
      cy.contains("button", "Add to watchlist").click();
      cy.get("#watchlist-title").should("contain.text", "1 of 4");
      panelItems().should("have.length", 1).first().should("contain.text", "Apex Systems Inc. (AAA)");
      cy.then(() => expect(requests()).to.include("subscribe 0"));
      cy.contains("button", "Remove from watchlist").should("exist");
      panelItems().first().find("svg.skeleton").should("exist"); // until its history arrives
      deliverHistory(0, 29920);
      panelItems().first().find("canvas.mini-canvas").should("have.attr", "data-ready", "true");
      panelItems().first().find(".price-now").should("contain.text", "299.20");
    });

    it("keeps each mini chart current with the symbol's live updates", () => {
      goLiveWith(6);
      cy.contains("button", "Add to watchlist").click();
      deliverHistory(0, 29920);
      panelItems().first().find(".price-now").should("contain.text", "299.20");
      cy.then(() => socket().receive({ ...makeDelta(6, [makeUpdate(0, { last: 30500, ts: Date.now() + 5000 })]), ts: Date.now() }));
      panelItems().first().find(".price-now").should("contain.text", "305.00");
    });

    it("adds up to four symbols", () => {
      goLiveWith(6);
      for (const symbol of ["AAA", "AAB", "AAC", "AAD"]) {
        cy.contains("tbody tr", symbol).find("button").click();
        cy.get("#symbol-detail-title").should("have.text", `${symbol} price chart`);
        cy.contains("button", "Add to watchlist").click();
      }
      cy.get("#watchlist-title").should("contain.text", "4 of 4");
      panelItems().should("have.length", 4);
      cy.then(() => expect(requests().filter((request) => request.startsWith("subscribe"))).to.have.length(4));
    });

    it("shows a toast, and adds nothing, when the watchlist is full", () => {
      localStorage.setItem("watchlist", "[1,2,3,4]");
      goLiveWith(6);
      cy.contains("button", "Add to watchlist").click(); // AAA, the fifth
      cy.get(".toast").should("contain.text", "The watchlist is full (4 symbols). Remove one to add another.");
      cy.get(".toast-region").should("have.attr", "aria-live", "polite");
      panelItems().should("have.length", 4);
      cy.get("#watchlist-title").should("contain.text", "4 of 4");
      cy.then(() => expect(requests().filter((request) => request === "subscribe 0"), "only the open chart's own subscription").to.have.length(1));
    });

    it("lets the toast be dismissed", () => {
      localStorage.setItem("watchlist", "[1,2,3,4]");
      goLiveWith(6);
      cy.contains("button", "Add to watchlist").click();
      cy.get(".toast button").click();
      cy.get(".toast").should("not.exist");
    });
  });

  describe("removing (unsubscribing)", () => {
    it("takes the symbol off and moves focus to the heading; it stays subscribed while its chart is open (for the order book and trades)", () => {
      goLiveWith(6);
      cy.contains("button", "Add to watchlist").click();
      panelItems().should("have.length", 1);
      cy.get('button[aria-label="Remove AAA from the watchlist"]').click();
      panelItems().should("have.length", 0);
      cy.get("#watchlist-title").should("have.focus");
      cy.then(() => expect(requests()).not.to.include("unsubscribe 0")); // AAA's chart is still open
      cy.get("#watchlist-title").should("contain.text", "0 of 4");
    });

    it("unsubscribes once the symbol is neither on the watchlist nor open", () => {
      goLiveWith(6);
      cy.contains("button", "Add to watchlist").click();
      cy.contains("button", "Close chart").click();
      cy.get('button[aria-label="Remove AAA from the watchlist"]').click();
      panelItems().should("have.length", 0);
      cy.then(() => expect(requests()).to.include("unsubscribe 0"));
    });

    it("takes a symbol off from its own chart with Remove from watchlist", () => {
      goLiveWith(6);
      cy.contains("button", "Add to watchlist").click();
      cy.contains("button", "Remove from watchlist").click();
      panelItems().should("have.length", 0);
      cy.contains("button", "Add to watchlist").should("exist");
    });

    it("makes room for another symbol after one is removed from a full list", () => {
      localStorage.setItem("watchlist", "[1,2,3,4]");
      goLiveWith(6);
      cy.get('button[aria-label="Remove AAB from the watchlist"]').click();
      cy.contains("button", "Add to watchlist").click();
      panelItems().should("have.length", 4).and("contain.text", "AAA");
      cy.get(".toast").should("not.exist");
    });
  });

  describe("opening a chart from the watchlist", () => {
    it("opens the symbol's chart when its name is pressed", () => {
      localStorage.setItem("watchlist", "[2]");
      goLiveWith(6);
      cy.get('button[aria-label="Open the Cobalt Capital Inc. (AAC) chart"]').click();
      cy.get("#symbol-detail-title").should("have.text", "AAC price chart");
    });
  });

  describe("a saved watchlist", () => {
    it("is restored: its symbols are subscribed to and their histories asked for as soon as the connection opens", () => {
      localStorage.setItem("watchlist", "[1,3]");
      goLiveWith(6);
      cy.then(() => {
        expect(requests()).to.include.members(["subscribe 1", "subscribe 3", "history 1", "history 3"]);
      });
      panelItems().should("have.length", 2);
    });

    it("shows skeletons for its entries before the page knows the symbols", () => {
      localStorage.setItem("watchlist", "[1,3]");
      mountPage();
      cy.get(".watchlist .watch-item").should("have.length", 2);
      cy.get(".watchlist .watch-item svg.skeleton").should("exist");
      cy.get(".watchlist .watch-item .mini-chart[role=status]").should("have.length", 2);
    });

    it("lets a symbol that no longer exists be removed, so it cannot occupy a slot for ever", () => {
      localStorage.setItem("watchlist", "[50]");
      goLiveWith(3);
      cy.get('button[aria-label="Remove #50 from the watchlist"]').click();
      cy.get(".watchlist-empty").should("exist");
    });
  });

  describe("collapsing", () => {
    it("hides the panel and gives the table the whole width, and brings it back", () => {
      goLiveWith(3);
      cy.get(".workspace-main").then(($main) => {
        const open = $main[0]!.getBoundingClientRect().width;
        cy.get(".watchlist-toggle").click();
        cy.get(".workspace").should("have.attr", "data-watchlist", "closed");
        cy.get(".watchlist").should("not.exist");
        cy.get(".watchlist-toggle").should("have.attr", "aria-expanded", "false");
        cy.get(".workspace-main").should(($m) => expect($m[0]!.getBoundingClientRect().width).to.be.greaterThan(open + 100));
        cy.get(".watchlist-toggle").click();
        cy.get(".watchlist").should("exist");
      });
    });

    it("keeps the symbols subscribed while the panel is hidden", () => {
      goLiveWith(6);
      cy.contains("button", "Add to watchlist").click();
      cy.get(".watchlist-toggle").click();
      cy.then(() => expect(requests()).not.to.include("unsubscribe 0"));
    });

    it("remembers that it was collapsed", () => {
      localStorage.setItem("watchlist.open", "false");
      goLiveWith(3);
      cy.get(".workspace").should("have.attr", "data-watchlist", "closed");
      cy.get(".watchlist-toggle").should("have.attr", "aria-expanded", "false");
    });

    it("opens the panel when a symbol is added to a collapsed watchlist, so it can be seen", () => {
      localStorage.setItem("watchlist.open", "false");
      goLiveWith(6);
      cy.contains("button", "Add to watchlist").click();
      cy.get(".workspace").should("have.attr", "data-watchlist", "open");
      panelItems().should("have.length", 1);
    });
  });

  it("can be used with the keyboard alone", () => {
    goLiveWith(6);
    cy.contains("button", "Add to watchlist").focus().realPress("Enter");
    panelItems().should("have.length", 1);
    cy.get(".watchlist-toggle").focus().realPress("Space");
    cy.get(".workspace").should("have.attr", "data-watchlist", "closed");
    cy.get(".watchlist-toggle").realPress("Enter");
    cy.get('button[aria-label="Remove AAA from the watchlist"]').focus().realPress("Enter");
    panelItems().should("have.length", 0);
  });

  describe("asking for a quote", () => {
    const sentMessages = () => socket().sent.map((frame) => decode(frame) as Record<string, unknown> & { t: string });
    const lastRequest = () => sentMessages().filter((message) => message.t === "rfq").at(-1) as unknown as { ref: number; id: number; side: string; quantity: number };

    it("opens the ticket in a dialog from the open chart's header, sends the request over the page's own connection and shows the quote", () => {
      goLive();
      cy.contains(".symbol-detail-header button", "Request a quote").click();
      cy.get("dialog[open] #rfq-quantity").type("250{enter}");
      cy.wrap(null).should(() => expect(lastRequest()).to.include({ id: 0, side: "buy", quantity: 250 }));
      cy.then(() => {
        const { ref } = lastRequest();
        socket().receive({ t: "rfqQuote", ref, id: 0, side: "buy", quantity: 250, price: 29925, screenPrice: 29921, validForMs: 10_000 });
      });
      cy.get(".rfq-message").should("contain.text", "You buy 250 AAA at 299.25");
      cy.contains("button", "Accept").click();
      cy.wrap(null).should(() => expect(sentTypes()).to.include("rfqAccept"));
      cy.then(() => socket().receive({ t: "rfqResult", ref: lastRequest().ref, outcome: "filled", price: 29925, tradeId: 8 }));
      cy.get(".rfq-message").should("contain.text", "Done: bought 250 AAA at 299.25");
    });

    it("fails the request when the connection drops while waiting", () => {
      goLive();
      cy.contains("button", "Request a quote").click();
      cy.get("#rfq-quantity").type("10{enter}");
      cy.wrap(null).should(() => expect(lastRequest()).to.not.equal(undefined));
      cy.then(() => socket().drop());
      cy.get(".rfq-message").should("contain.text", "request was cancelled");
    });

    it("says the request is lost when the connection is not open", () => {
      goLive();
      cy.then(() => (socket().readyState = FakeWebSocket.CLOSED));
      cy.contains("button", "Request a quote").click();
      cy.get("#rfq-quantity").type("10{enter}");
      cy.get(".rfq-message").should("contain.text", "request was cancelled");
    });
  });
});
