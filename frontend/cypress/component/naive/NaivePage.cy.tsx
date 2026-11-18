import { decode } from "@msgpack/msgpack";
import { collector } from "../../../src/hud/collector";
import { NaivePage } from "../../../src/naive/NaivePage";
import { FakeWebSocket, installFakeWebSocket } from "../../support/fakeWebSocket";
import { makeDelta, makeQuote, makeSession, makeSnapshot, makeUpdate } from "../../support/fixtures";
import { withI18n } from "../../support/render";

const socket = () => FakeWebSocket.latest;

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
  });
  cy.get("tbody tr").should("have.length", 3);
};

const bidOfRow = (row: number) => cy.get("tbody tr").eq(row).find("td").first();

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

  it("shows a skeleton until the first snapshot, then the table", () => {
    mountPage();
    cy.get("svg.skeleton").should("exist");
    cy.then(() => {
      socket().open();
      socket().receive(makeSession());
      socket().receive(makeSnapshot(5));
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
    cy.then(() => expect(socket().sent).to.have.length(0));
  });

  it("asks for a fresh snapshot when a frame is missed, then ignores updates until it arrives", () => {
    goLive();
    // Frame 6 never arrives, so frame 7 reveals a gap.
    cy.then(() => socket().receive(makeDelta(7, [makeUpdate(0, { bid: 31000, ask: 31004 })])));
    cy.then(() => {
      expect(socket().sent).to.have.length(1);
      expect(decode(socket().sent[0] as Uint8Array)).to.deep.equal({ t: "resync" });
      expect(collector.totalGaps).to.equal(1);
    });
    bidOfRow(0).should("have.text", "299.17"); // the out-of-order update was not applied

    // While waiting for the snapshot, further updates are ignored and do not ask again.
    cy.then(() => socket().receive(makeDelta(8, [makeUpdate(0, { bid: 32000, ask: 32004 })])));
    cy.then(() => expect(socket().sent).to.have.length(1));
    bidOfRow(0).should("have.text", "299.17");

    // The snapshot restores the state, and updates apply again from there.
    cy.then(() => socket().receive(makeSnapshot(10, [makeQuote(0, { bid: 30100, ask: 30104 }), makeQuote(1), makeQuote(2)])));
    bidOfRow(0).should("have.text", "301.00");
    cy.then(() => socket().receive(makeDelta(11, [makeUpdate(0, { bid: 30200, ask: 30204 })])));
    bidOfRow(0).should("have.text", "302.00");
  });

  it("refuses a server that speaks a different protocol version", () => {
    mountPage();
    cy.then(() => {
      socket().open();
      socket().receive(makeSession({ v: 99 }));
    });
    cy.get("[role=alert]").should("contain.text", "Unsupported protocol version 99").and("contain.text", "version 1");
    cy.get(".status").should("have.attr", "data-status", "error");
    cy.then(() => expect(socket().closed).to.equal(true));
    cy.get(".record-button").should("be.disabled");
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
