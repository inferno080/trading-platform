import { decode } from "@msgpack/msgpack";
import { FeedConnection, REFERENCE_TIMEOUT_MS } from "../../../src/feed/FeedConnection";
import type { WorkerEvent } from "../../../src/feed/messages";
import { FakeWebSocket } from "../../support/fakeWebSocket";
import { makeDelta, makeReferenceData, makeSession, makeSnapshot, makeUpdate } from "../../support/fixtures";

// The connection under test, wired to fake sockets and collecting what it reports.
const setup = () => {
  FakeWebSocket.instances.length = 0;
  const events: WorkerEvent[] = [];
  const connection = new FeedConnection((url) => new FakeWebSocket(url), (event) => events.push(event));
  const sentTypes = () => FakeWebSocket.latest.sent.map((frame) => (decode(frame) as { t: string }).t);
  const statuses = () => events.filter((e) => e.type === "status").map((e) => e.status);
  return { connection, events, sentTypes, statuses };
};

describe("FeedConnection", () => {
  it("opens a socket at the given address, asking for binary frames, and reports that it is connecting", () => {
    const { connection, events } = setup();
    connection.connect("ws://example:1234");
    expect(FakeWebSocket.latest.url).to.equal("ws://example:1234");
    expect(FakeWebSocket.latest.binaryType).to.equal("arraybuffer");
    expect(events).to.deep.equal([{ type: "status", status: "connecting" }]);
  });

  it("reports live when the socket opens and closed when the server closes it", () => {
    const { connection, statuses } = setup();
    connection.connect("ws://x");
    FakeWebSocket.latest.open();
    FakeWebSocket.latest.drop();
    expect(statuses()).to.deep.equal(["connecting", "live", "closed"]);
  });

  it("reports an error, and keeps reporting an error after the socket closes", () => {
    const { connection, statuses } = setup();
    connection.connect("ws://x");
    FakeWebSocket.latest.fail();
    FakeWebSocket.latest.drop();
    expect(statuses()).to.deep.equal(["connecting", "error", "error"]);
  });

  describe("the session handshake", () => {
    it("accepts the current protocol version, reports the session and asks for the reference data once", () => {
      const { connection, events, sentTypes } = setup();
      connection.connect("ws://x");
      const session = makeSession();
      FakeWebSocket.latest.receive(session);
      expect(events).to.deep.include({ type: "session", session });
      expect(sentTypes()).to.deep.equal(["reference"]);
    });

    it("refuses any other protocol version, reports it, closes the socket and asks for nothing", () => {
      const { connection, events, sentTypes, statuses } = setup();
      connection.connect("ws://x");
      FakeWebSocket.latest.receive(makeSession({ v: 1 }));
      expect(events).to.deep.include({ type: "badVersion", version: 1 });
      expect(statuses().at(-1)).to.equal("error");
      expect(FakeWebSocket.latest.closed).to.equal(true);
      expect(sentTypes()).to.deep.equal([]);
      expect(events.some((e) => e.type === "session")).to.equal(false);
    });
  });

  describe("the reference data", () => {
    it("reports how many instruments it covers when it arrives", () => {
      const { connection, events } = setup();
      connection.connect("ws://x");
      FakeWebSocket.latest.receive(makeSession());
      FakeWebSocket.latest.receive(makeReferenceData());
      expect(events).to.deep.include({ type: "reference", count: 3 });
    });

    it("does not report a timeout when it arrives in time", () => {
      cy.clock();
      const { connection, events } = setup();
      connection.connect("ws://x");
      FakeWebSocket.latest.receive(makeSession());
      FakeWebSocket.latest.receive(makeReferenceData());
      cy.tick(REFERENCE_TIMEOUT_MS * 2).then(() => {
        expect(events.some((e) => e.type === "referenceTimeout")).to.equal(false);
      });
    });

    it("reports a timeout when it is late, and still accepts it afterwards", () => {
      cy.clock();
      const { connection, events } = setup();
      connection.connect("ws://x");
      FakeWebSocket.latest.receive(makeSession());
      cy.tick(REFERENCE_TIMEOUT_MS - 1).then(() => expect(events.some((e) => e.type === "referenceTimeout")).to.equal(false));
      cy.tick(1).then(() => {
        expect(events.filter((e) => e.type === "referenceTimeout")).to.have.length(1);
        FakeWebSocket.latest.receive(makeReferenceData());
        expect(events.at(-1)).to.deep.equal({ type: "reference", count: 3 });
      });
    });
  });

  it("ignores snapshots and updates for now, without crashing or sending anything", () => {
    const { connection, events, sentTypes } = setup();
    connection.connect("ws://x");
    FakeWebSocket.latest.receive(makeSession());
    const reported = events.length;
    FakeWebSocket.latest.receive(makeSnapshot(5));
    FakeWebSocket.latest.receive(makeDelta(6, [makeUpdate(0)]));
    expect(events).to.have.length(reported);
    expect(sentTypes()).to.deep.equal(["reference"]);
  });

  describe("closing", () => {
    it("closes the socket, stops listening to it and cancels the reference timeout", () => {
      cy.clock();
      const { connection, events } = setup();
      connection.connect("ws://x");
      FakeWebSocket.latest.receive(makeSession());
      const socket = FakeWebSocket.latest;
      connection.close();
      expect(socket.closed).to.equal(true);
      expect(socket.onmessage).to.equal(null);
      expect(socket.onopen).to.equal(null);
      cy.tick(REFERENCE_TIMEOUT_MS * 2).then(() => expect(events.some((e) => e.type === "referenceTimeout")).to.equal(false));
    });

    it("does nothing when there is no connection to close", () => {
      const { connection, events } = setup();
      connection.close();
      expect(events).to.have.length(0);
    });

    it("replaces the earlier connection when asked to connect again, so there is only ever one", () => {
      const { connection } = setup();
      connection.connect("ws://first");
      connection.connect("ws://second");
      expect(FakeWebSocket.instances).to.have.length(2);
      expect(FakeWebSocket.instances[0]?.closed).to.equal(true);
      expect(FakeWebSocket.instances[1]?.closed).to.equal(false);
    });
  });
});
