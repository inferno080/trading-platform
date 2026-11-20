import { decode } from "@msgpack/msgpack";
import { FeedConnection, REFERENCE_TIMEOUT_MS } from "../../../src/feed/FeedConnection";
import type { WorkerEvent } from "../../../src/feed/messages";
import { FakeWebSocket } from "../../support/fakeWebSocket";
import { makeDelta, makeReferenceData, makeSession, makeSnapshot, makeUpdate } from "../../support/fixtures";

// The connection under test, wired to fake sockets and collecting what it reports.
const setup = (now: () => number = () => 0) => {
  FakeWebSocket.instances.length = 0;
  const events: WorkerEvent[] = [];
  const connection = new FeedConnection((url) => new FakeWebSocket(url), (event) => events.push(event), now);
  const sentTypes = () => FakeWebSocket.latest.sent.map((frame) => (decode(frame) as { t: string }).t);
  const lastBatch = () => {
    connection.pull();
    const batch = events.at(-1);
    if (batch?.type !== "batch") throw new Error("pull did not report a batch");
    return batch;
  };
  const statuses = () => events.filter((e) => e.type === "status").map((e) => e.status);
  return { connection, events, sentTypes, statuses, lastBatch };
};

describe("FeedConnection", () => {
  it("opens a socket at the given address, asking for binary frames, and reports that it is connecting", () => {
    const { connection, events } = setup();
    connection.connect("ws://localhost:1234");
    expect(FakeWebSocket.latest.url).to.equal("ws://localhost:1234");
    expect(FakeWebSocket.latest.binaryType).to.equal("arraybuffer");
    expect(events).to.deep.equal([{ type: "status", status: "connecting" }]);
  });

  it("reports live when the socket opens and closed when the server closes it", () => {
    const { connection, statuses } = setup();
    connection.connect("ws://localhost:1");
    FakeWebSocket.latest.open();
    FakeWebSocket.latest.drop();
    expect(statuses()).to.deep.equal(["connecting", "live", "closed"]);
  });

  it("reports an error, and keeps reporting an error after the socket closes", () => {
    const { connection, statuses } = setup();
    connection.connect("ws://localhost:1");
    FakeWebSocket.latest.fail();
    FakeWebSocket.latest.drop();
    expect(statuses()).to.deep.equal(["connecting", "error", "error"]);
  });

  describe("the session handshake", () => {
    it("accepts the current protocol version, reports the session and asks for the reference data once", () => {
      const { connection, events, sentTypes } = setup();
      connection.connect("ws://localhost:1");
      const session = makeSession();
      FakeWebSocket.latest.receive(session);
      expect(events).to.deep.include({ type: "session", session });
      expect(sentTypes()).to.deep.equal(["reference"]);
    });

    it("refuses any other protocol version, reports it, closes the socket and asks for nothing", () => {
      const { connection, events, sentTypes, statuses } = setup();
      connection.connect("ws://localhost:1");
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
      connection.connect("ws://localhost:1");
      FakeWebSocket.latest.receive(makeSession());
      FakeWebSocket.latest.receive(makeReferenceData());
      expect(events).to.deep.include({ type: "reference", instruments: makeReferenceData().instruments });
    });

    it("does not report a timeout when it arrives in time", () => {
      cy.clock().then(() => {
        const { connection, events } = setup();
        connection.connect("ws://localhost:1");
        FakeWebSocket.latest.receive(makeSession());
        FakeWebSocket.latest.receive(makeReferenceData());
        cy.tick(REFERENCE_TIMEOUT_MS * 2).then(() => {
          expect(events.some((e) => e.type === "referenceTimeout")).to.equal(false);
        });
      });
    });

    it("reports a timeout when it is late, and still accepts it afterwards", () => {
      cy.clock().then(() => {
        const { connection, events } = setup();
        connection.connect("ws://localhost:1");
        FakeWebSocket.latest.receive(makeSession());
        cy.tick(REFERENCE_TIMEOUT_MS - 1).then(() => expect(events.some((e) => e.type === "referenceTimeout")).to.equal(false));
        cy.tick(1).then(() => {
          expect(events.filter((e) => e.type === "referenceTimeout")).to.have.length(1);
          FakeWebSocket.latest.receive(makeReferenceData());
          expect(events.at(-1)).to.deep.equal({ type: "reference", instruments: makeReferenceData().instruments });
        });
      });
    });
  });

  describe("the market state", () => {
    // A connection that has completed the handshake and received its first snapshot (sequence 5).
    const live = (now?: () => number) => {
      const harness = setup(now);
      harness.connection.connect("ws://localhost:1");
      FakeWebSocket.latest.receive(makeSession());
      FakeWebSocket.latest.receive(makeSnapshot(5));
      harness.events.length = 0;
      return harness;
    };

    it("reports each snapshot to the page as it arrives", () => {
      const { connection, events } = setup();
      connection.connect("ws://localhost:1");
      const snapshot = makeSnapshot(5);
      FakeWebSocket.latest.receive(snapshot);
      expect(events).to.deep.include({ type: "snapshot", quotes: snapshot.quotes });
    });

    it("sends nothing to the page for a delta until the page asks", () => {
      const { events } = live();
      FakeWebSocket.latest.receive(makeDelta(6, [makeUpdate(0, { last: 29950 })]));
      expect(events).to.have.length(0);
    });

    it("keeps only the latest state of an instrument that ticked several times between two pulls (conflation)", () => {
      const { lastBatch } = live();
      FakeWebSocket.latest.receive(makeDelta(6, [makeUpdate(0, { last: 29950 })]));
      FakeWebSocket.latest.receive(makeDelta(7, [makeUpdate(0, { last: 29960 }), makeUpdate(1, { last: 29970 })]));
      FakeWebSocket.latest.receive(makeDelta(8, [makeUpdate(0, { last: 29980 })]));
      const batch = lastBatch();
      expect(batch.updates.map((q) => [q.id, q.last])).to.deep.equal([
        [0, 29980],
        [1, 29970],
      ]);
      expect(batch.stats.updatesIn).to.equal(4); // four updates came in, two went out
      expect(batch.stats.messages).to.equal(3);
    });

    it("sends the whole quote of a changed instrument, including the fields that did not change", () => {
      const { lastBatch } = live();
      FakeWebSocket.latest.receive(makeDelta(6, [makeUpdate(0, { last: 29950 })]));
      expect(lastBatch().updates[0]).to.include({ id: 0, sym: "AAA", last: 29950 });
    });

    it("sends an empty batch when nothing changed, and a change is sent only once", () => {
      const { lastBatch } = live();
      FakeWebSocket.latest.receive(makeDelta(6, [makeUpdate(2)]));
      expect(lastBatch().updates).to.have.length(1);
      expect(lastBatch().updates).to.have.length(0);
    });

    it("counts what it received since the last pull, then starts again from zero", () => {
      const { lastBatch } = live(() => 1_050);
      FakeWebSocket.latest.receive({ ...makeDelta(6, [makeUpdate(0), makeUpdate(1)]), ts: 1_000 });
      FakeWebSocket.latest.receive({ ...makeDelta(7, [makeUpdate(2)]), ts: 1_030 });
      expect(lastBatch().stats).to.deep.equal({ messages: 2, updatesIn: 3, gaps: 0, latencies: [50, 20] });
      expect(lastBatch().stats).to.deep.equal({ messages: 0, updatesIn: 0, gaps: 0, latencies: [] });
    });

    it("ignores an update for an instrument it has no quote for", () => {
      const { lastBatch } = live();
      FakeWebSocket.latest.receive(makeDelta(6, [makeUpdate(99)]));
      expect(lastBatch().updates).to.have.length(0);
    });

    it("ignores deltas that arrive before any snapshot", () => {
      const { connection, events, sentTypes } = setup();
      connection.connect("ws://localhost:1");
      FakeWebSocket.latest.receive(makeDelta(1, [makeUpdate(0)]));
      expect(events).to.deep.equal([{ type: "status", status: "connecting" }]);
      expect(sentTypes()).to.deep.equal([]);
    });

    describe("when a frame is missed (a gap)", () => {
      it("counts the gap, asks for a fresh snapshot once, and ignores deltas until it arrives", () => {
        const { sentTypes, lastBatch } = live();
        FakeWebSocket.latest.receive(makeDelta(8, [makeUpdate(0, { last: 1 })])); // 6 and 7 never came
        FakeWebSocket.latest.receive(makeDelta(9, [makeUpdate(0, { last: 2 })])); // still waiting
        expect(sentTypes()).to.deep.equal(["reference", "resync"]); // the reference request came earlier; one resync, not two
        const batch = lastBatch();
        expect(batch.stats.gaps).to.equal(1);
        expect(batch.updates).to.have.length(0);
      });

      it("carries on from the new snapshot, and drops what was pending from before it", () => {
        const { events, lastBatch } = live();
        FakeWebSocket.latest.receive(makeDelta(6, [makeUpdate(0, { last: 1 })])); // pending, not yet pulled
        FakeWebSocket.latest.receive(makeDelta(8, [makeUpdate(0, { last: 2 })])); // the gap
        const fresh = makeSnapshot(20);
        FakeWebSocket.latest.receive(fresh);
        expect(events).to.deep.include({ type: "snapshot", quotes: fresh.quotes });
        expect(lastBatch().updates).to.have.length(0); // the snapshot already holds everything
        FakeWebSocket.latest.receive(makeDelta(21, [makeUpdate(1, { last: 3 })]));
        expect(lastBatch().updates.map((q) => q.id)).to.deep.equal([1]);
      });
    });

    it("forgets the old market when it connects again", () => {
      const { connection, lastBatch } = live();
      FakeWebSocket.latest.receive(makeDelta(6, [makeUpdate(0)]));
      connection.connect("ws://localhost:2");
      FakeWebSocket.latest.receive(makeDelta(1, [makeUpdate(0)])); // no snapshot yet on the new connection
      expect(lastBatch()).to.deep.include({ updates: [] });
    });
  });

  describe("closing", () => {
    it("closes the socket, stops listening to it and cancels the reference timeout", () => {
      cy.clock().then(() => {
        const { connection, events } = setup();
        connection.connect("ws://localhost:1");
        FakeWebSocket.latest.receive(makeSession());
        const socket = FakeWebSocket.latest;
        connection.close();
        expect(socket.closed).to.equal(true);
        expect(socket.onmessage).to.equal(null);
        expect(socket.onopen).to.equal(null);
        cy.tick(REFERENCE_TIMEOUT_MS * 2).then(() => expect(events.some((e) => e.type === "referenceTimeout")).to.equal(false));
      });
    });

    it("does nothing when there is no connection to close", () => {
      const { connection, events } = setup();
      connection.close();
      expect(events).to.have.length(0);
    });

    it("replaces the earlier connection when asked to connect again, so there is only ever one", () => {
      const { connection } = setup();
      connection.connect("ws://localhost:2");
      connection.connect("ws://localhost:3");
      expect(FakeWebSocket.instances).to.have.length(2);
      expect(FakeWebSocket.instances[0]?.closed).to.equal(true);
      expect(FakeWebSocket.instances[1]?.closed).to.equal(false);
    });
  });
});
