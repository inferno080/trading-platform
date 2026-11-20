import { decode } from "@msgpack/msgpack";
import { collector } from "../../../src/hud/collector";
import { NaivePage } from "../../../src/naive/NaivePage";
import { REFERENCE_TIMEOUT_MS } from "../../../src/naive/useNaiveFeed";
import { FakeWebSocket, installFakeWebSocket } from "../../support/fakeWebSocket";
import {
  makeDelta,
  makeQuote,
  makeReference,
  makeReferenceData,
  makeSession,
  makeSnapshot,
  makeUpdate,
} from "../../support/fixtures";
import { withI18n } from "../../support/render";

const socket = () => FakeWebSocket.latest;

/** What the page has sent to the server so far, as message types (decoded from the binary frames). */
const sentTypes = (): string[] => socket().sent.map((frame) => (decode(frame) as { t: string }).t);

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
      cy.get("svg.skeleton").should("exist");
      cy.get("table").should("not.exist");
      cy.then(() => socket().receive(makeReferenceData()));
      cy.get("tbody tr").should("have.length", 3);
      cy.get("svg.skeleton").should("not.exist");
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
    cy.get("svg.skeleton").should("exist");
    cy.then(() => {
      socket().open();
      socket().receive(makeSession());
      socket().receive(makeSnapshot(5));
      socket().receive(makeReferenceData());
    });
    cy.get("table").should("exist");
    cy.get("tbody tr").should("have.length", 3);
    cy.get("svg.skeleton").should("not.exist");
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
