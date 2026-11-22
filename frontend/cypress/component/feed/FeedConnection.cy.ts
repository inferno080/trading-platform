import { decode } from "@msgpack/msgpack";
import { FeedConnection, REFERENCE_TIMEOUT_MS } from "../../../src/feed/FeedConnection";
import type { WorkerEvent } from "../../../src/feed/messages";
import { FakeWebSocket } from "../../support/fakeWebSocket";
import {
  makeDelta,
  makeDepth,
  makeHistory,
  makeReferenceData,
  makeRejected,
  makeSession,
  makeSnapshot,
  makeTrades,
  makeUpdate,
} from "../../support/fixtures";

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

  it("reports live when the socket opens and reconnecting when the server closes it", () => {
    const { connection, statuses } = setup();
    connection.connect("ws://localhost:1");
    FakeWebSocket.latest.open();
    FakeWebSocket.latest.drop();
    expect(statuses()).to.deep.equal(["connecting", "live", "reconnecting"]);
    connection.close();
  });

  it("treats a connection that fails to open like one that was lost: it reconnects", () => {
    const { connection, statuses } = setup();
    connection.connect("ws://localhost:1");
    FakeWebSocket.latest.fail();
    FakeWebSocket.latest.drop();
    expect(statuses()).to.deep.equal(["connecting", "reconnecting"]);
    connection.close();
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

// What the connection has sent, decoded: [type, id] pairs for the requests about one instrument.
const sentRequests = () =>
  FakeWebSocket.latest.sent
    .map((frame) => decode(frame) as { t: string; id?: number })
    .filter((message) => message.id !== undefined)
    .map((message) => `${message.t} ${message.id}`);

// An open connection that has had its session and first snapshot (sequence 5).
const live = () => {
  const harness = setup();
  harness.connection.connect("ws://localhost:1");
  FakeWebSocket.latest.open();
  FakeWebSocket.latest.receive(makeSession());
  FakeWebSocket.latest.receive(makeSnapshot(5));
  harness.events.length = 0;
  return harness;
};

describe("FeedConnection: the open chart", () => {
  const charts = (batch: ReturnType<ReturnType<typeof setup>["lastBatch"]>) => batch.charts ?? [];

  it("asks for the history of the selected instrument, and subscribes to it, so the server sends its order book and trades", () => {
    const { connection } = live();
    connection.select(1);
    expect(sentRequests()).to.deep.equal(["history 1", "subscribe 1"]);
  });

  it("waits for the connection to open before asking, and asks when it does", () => {
    const { connection } = setup();
    connection.connect("ws://localhost:1");
    connection.select(2);
    expect(sentRequests()).to.deep.equal([]);
    FakeWebSocket.latest.open();
    expect(sentRequests()).to.deep.equal(["history 2", "subscribe 2"]);
  });

  it("does not ask twice for the same instrument", () => {
    const { connection } = live();
    connection.select(1);
    connection.select(1);
    expect(sentRequests()).to.deep.equal(["history 1", "subscribe 1"]);
  });

  it("sends the history to the page with the next pull, as a flat typed list, and not again until it changes", () => {
    const { connection, lastBatch } = live();
    connection.select(1);
    FakeWebSocket.latest.receive(makeHistory(1, 3, 29920));
    const first = charts(lastBatch());
    expect(first).to.have.length(1);
    expect(first[0]!.id).to.equal(1);
    expect(first[0]!.data).to.be.instanceOf(Float64Array);
    expect([...first[0]!.data]).to.deep.equal([1_000_000, 29900, 1_001_000, 29910, 1_002_000, 29920]);
    expect(charts(lastBatch())).to.have.length(0);
  });

  it("folds each update of the instrument into the newest point, or starts a new one a second later", () => {
    const { connection, lastBatch } = live();
    connection.select(1);
    FakeWebSocket.latest.receive(makeHistory(1, 2, 29920, 1_000_000)); // newest point at 1,001,000
    lastBatch();
    FakeWebSocket.latest.receive({ ...makeDelta(6, [makeUpdate(1, { last: 30000, ts: 1_001_500 })]), ts: 1 });
    expect([...charts(lastBatch())[0]!.data].slice(-2)).to.deep.equal([1_001_000, 30000]); // within the second: replaces
    FakeWebSocket.latest.receive({ ...makeDelta(7, [makeUpdate(1, { last: 30100, ts: 1_002_100 })]), ts: 1 });
    expect([...charts(lastBatch())[0]!.data].slice(-4)).to.deep.equal([1_001_000, 30000, 1_002_100, 30100]); // a new second: new point
  });

  it("sends nothing about the chart when other instruments update", () => {
    const { connection, lastBatch } = live();
    connection.select(1);
    FakeWebSocket.latest.receive(makeHistory(1));
    lastBatch();
    FakeWebSocket.latest.receive(makeDelta(6, [makeUpdate(0, { last: 31000 }), makeUpdate(2)]));
    expect(charts(lastBatch())).to.have.length(0);
  });

  it("does not fold updates in before the history arrives, because the history already includes them", () => {
    const { connection, lastBatch } = live();
    connection.select(1);
    FakeWebSocket.latest.receive(makeDelta(6, [makeUpdate(1, { last: 31000 })]));
    expect(charts(lastBatch())).to.have.length(0);
  });

  it("ignores a history for an instrument that is no longer selected", () => {
    const { connection, lastBatch } = live();
    connection.select(1);
    connection.select(2);
    FakeWebSocket.latest.receive(makeHistory(1)); // the answer to the first request, arriving late
    expect(charts(lastBatch())).to.have.length(0);
  });

  it("drops the chart and asks for the new one when another instrument is selected", () => {
    const { connection, lastBatch } = live();
    connection.select(1);
    FakeWebSocket.latest.receive(makeHistory(1));
    lastBatch();
    connection.select(2);
    expect(sentRequests()).to.deep.equal(["history 1", "subscribe 1", "history 2", "unsubscribe 1", "subscribe 2"]);
    FakeWebSocket.latest.receive({ ...makeDelta(6, [makeUpdate(1, { last: 31000 })]), ts: 1 }); // the old one no longer follows
    expect(charts(lastBatch())).to.have.length(0);
  });

  it("stops following anything when nothing is selected, and asks again if it is selected again", () => {
    const { connection } = live();
    connection.select(1);
    connection.select(null);
    connection.select(1);
    expect(sentRequests()).to.deep.equal(["history 1", "subscribe 1", "unsubscribe 1", "history 1", "subscribe 1"]);
  });

  it("says so when the server has no history for the selected instrument", () => {
    const { connection, events } = live();
    connection.select(9);
    FakeWebSocket.latest.receive(makeRejected("history", 9));
    expect(events).to.deep.include({ type: "chartUnavailable", id: 9 });
  });

  it("ignores a refusal for an instrument that is not tracked, and a refusal of something else", () => {
    const { connection, events } = live();
    connection.select(1);
    FakeWebSocket.latest.receive(makeRejected("history", 7));
    FakeWebSocket.latest.receive(makeRejected("subscribe", 1, "limit"));
    expect(events.some((event) => event.type === "chartUnavailable")).to.equal(false);
  });

  it("asks again for the history after the connection is replaced", () => {
    const { connection } = live();
    connection.select(1);
    connection.connect("ws://localhost:2");
    FakeWebSocket.latest.open();
    expect(sentRequests()).to.deep.equal(["history 1", "subscribe 1"]); // on the new socket
  });

  it("sends a copy of the chart, so a later update cannot change what the page already has", () => {
    const { connection, lastBatch } = live();
    connection.select(1);
    FakeWebSocket.latest.receive(makeHistory(1, 2, 29920, 1_000_000));
    const first = charts(lastBatch())[0]!.data;
    const before = [...first];
    FakeWebSocket.latest.receive({ ...makeDelta(6, [makeUpdate(1, { last: 30000, ts: 1_001_200 })]), ts: 1 });
    lastBatch();
    expect([...first]).to.deep.equal(before);
  });
});

describe("FeedConnection: the watchlist", () => {

  it("subscribes to each symbol on the watchlist and asks for its history", () => {
    const { connection } = live();
    connection.watch([1, 2]);
    expect(sentRequests()).to.have.members(["history 1", "history 2", "subscribe 1", "subscribe 2"]);
  });

  it("does not subscribe twice to a symbol that stays on the list", () => {
    const { connection } = live();
    connection.watch([1]);
    connection.watch([1, 2]);
    expect(sentRequests().filter((request) => request === "subscribe 1")).to.have.length(1);
    expect(sentRequests()).to.include("subscribe 2");
  });

  it("unsubscribes from a symbol that leaves the list, and forgets its chart", () => {
    const { connection, lastBatch } = live();
    connection.watch([1, 2]);
    FakeWebSocket.latest.receive(makeHistory(1));
    FakeWebSocket.latest.receive(makeHistory(2));
    lastBatch();
    connection.watch([2]);
    expect(sentRequests()).to.include("unsubscribe 1");
    expect(sentRequests()).not.to.include("unsubscribe 2");
    FakeWebSocket.latest.receive({ ...makeDelta(6, [makeUpdate(1, { last: 31000 }), makeUpdate(2, { last: 31000 })]), ts: 1 });
    expect((lastBatch().charts ?? []).map((chart) => chart.id)).to.deep.equal([2]);
  });

  it("keeps a chart for every symbol on the watchlist, and sends each when it changes", () => {
    const { connection, lastBatch } = live();
    connection.watch([1, 2]);
    FakeWebSocket.latest.receive(makeHistory(1));
    FakeWebSocket.latest.receive(makeHistory(2));
    expect((lastBatch().charts ?? []).map((chart) => chart.id).sort()).to.deep.equal([1, 2]);
  });

  it("keeps one history request for a symbol that is both open and on the watchlist, and keeps its chart when it is closed", () => {
    const { connection, lastBatch } = live();
    connection.watch([1]);
    connection.select(1);
    expect(sentRequests().filter((request) => request === "history 1")).to.have.length(1);
    FakeWebSocket.latest.receive(makeHistory(1));
    lastBatch();
    connection.select(null);
    FakeWebSocket.latest.receive({ ...makeDelta(6, [makeUpdate(1, { last: 31000 })]), ts: 1 });
    expect((lastBatch().charts ?? []).map((chart) => chart.id)).to.deep.equal([1]); // still followed: it is on the watchlist
  });

  it("subscribes when the connection opens, if the list was set before that", () => {
    const { connection } = setup();
    connection.connect("ws://localhost:1");
    connection.watch([3]);
    expect(sentRequests()).to.deep.equal([]);
    FakeWebSocket.latest.open();
    expect(sentRequests()).to.have.members(["history 3", "subscribe 3"]);
  });

  it("subscribes again on a new connection, since the server forgot the old one", () => {
    const { connection } = live();
    connection.watch([3]);
    connection.connect("ws://localhost:2");
    FakeWebSocket.latest.open();
    expect(sentRequests()).to.have.members(["history 3", "subscribe 3"]);
  });

  it("empties the watchlist: everything is unsubscribed", () => {
    const { connection } = live();
    connection.watch([1, 2]);
    connection.watch([]);
    expect(sentRequests()).to.include.members(["unsubscribe 1", "unsubscribe 2"]);
  });

  it("ignores the depth and trades the server sends for the subscriptions, without error", () => {
    const { connection, events, lastBatch } = live();
    connection.watch([1]);
    events.length = 0;
    FakeWebSocket.latest.receive(makeDepth(1));
    FakeWebSocket.latest.receive(makeTrades(1));
    expect(events).to.have.length(0);
    expect(lastBatch().updates).to.have.length(0);
  });
});

describe("FeedConnection: the open instrument's order book and trades", () => {
  const depthOf = (id: number, bid: number) => ({ ...makeDepth(id), bids: [[bid, 2700]] as [number, number][] });
  const tradesOf = (id: number, ...prices: number[]) => ({
    ...makeTrades(id),
    trades: prices.map((price, i) => ({ ts: i, price, size: 300, side: "buy" as const })),
  });

  it("sends the open instrument's order book with the next pull", () => {
    const { connection, lastBatch } = live();
    connection.select(1);
    FakeWebSocket.latest.receive(depthOf(1, 29917));
    const batch = lastBatch();
    expect(batch.depth).to.deep.equal({ id: 1, bids: [[29917, 2700]], asks: [[29921, 3500]] });
  });

  it("keeps only the newest order book between pulls (conflation: the whole ladder is sent each time, so the last one is all that matters)", () => {
    const { connection, lastBatch } = live();
    connection.select(1);
    FakeWebSocket.latest.receive(depthOf(1, 100));
    FakeWebSocket.latest.receive(depthOf(1, 101));
    FakeWebSocket.latest.receive(depthOf(1, 102));
    expect(lastBatch().depth?.bids[0]?.[0]).to.equal(102);
  });

  it("does not send the same order book twice", () => {
    const { connection, lastBatch } = live();
    connection.select(1);
    FakeWebSocket.latest.receive(depthOf(1, 100));
    lastBatch();
    expect(lastBatch().depth).to.equal(undefined);
  });

  it("collects the open instrument's trades between pulls, oldest first, and sends them once", () => {
    const { connection, lastBatch } = live();
    connection.select(1);
    FakeWebSocket.latest.receive(tradesOf(1, 100, 101));
    FakeWebSocket.latest.receive(tradesOf(1, 102));
    const batch = lastBatch();
    expect(batch.trades?.id).to.equal(1);
    expect(batch.trades?.trades.map((t) => t.price)).to.deep.equal([100, 101, 102]);
    expect(lastBatch().trades).to.equal(undefined);
  });

  it("sends neither when nothing arrived", () => {
    const { connection, lastBatch } = live();
    connection.select(1);
    const batch = lastBatch();
    expect(batch.depth).to.equal(undefined);
    expect(batch.trades).to.equal(undefined);
  });

  it("ignores the order book and trades of the watchlist's symbols, which are subscribed to but not shown", () => {
    const { connection, lastBatch } = live();
    connection.watch([2]);
    connection.select(1);
    FakeWebSocket.latest.receive(depthOf(2, 100));
    FakeWebSocket.latest.receive(tradesOf(2, 100));
    const batch = lastBatch();
    expect(batch.depth).to.equal(undefined);
    expect(batch.trades).to.equal(undefined);
  });

  it("ignores them when nothing is open", () => {
    const { connection, lastBatch } = live();
    connection.watch([2]);
    FakeWebSocket.latest.receive(depthOf(2, 100));
    FakeWebSocket.latest.receive(tradesOf(2, 100));
    expect(lastBatch().depth).to.equal(undefined);
  });

  it("drops what was waiting when another instrument is opened, so the old one's book never shows under the new one", () => {
    const { connection, lastBatch } = live();
    connection.select(1);
    FakeWebSocket.latest.receive(depthOf(1, 100));
    FakeWebSocket.latest.receive(tradesOf(1, 100));
    connection.select(2);
    const batch = lastBatch();
    expect(batch.depth).to.equal(undefined);
    expect(batch.trades).to.equal(undefined);
  });

  it("starts empty after the connection is replaced", () => {
    const { connection, lastBatch } = live();
    connection.select(1);
    FakeWebSocket.latest.receive(depthOf(1, 100));
    FakeWebSocket.latest.receive(tradesOf(1, 100));
    connection.connect("ws://localhost:2");
    const batch = lastBatch();
    expect(batch.depth).to.equal(undefined);
    expect(batch.trades).to.equal(undefined);
  });

  it("subscribes to the open instrument as well as the watchlist, and unsubscribes only once it is neither", () => {
    const { connection } = live();
    connection.watch([1]);
    connection.select(1); // both: still one subscription
    expect(sentRequests().filter((r) => r === "subscribe 1")).to.have.length(1);
    connection.select(null); // still on the watchlist
    expect(sentRequests()).not.to.include("unsubscribe 1");
    connection.watch([]); // now neither
    expect(sentRequests()).to.include("unsubscribe 1");
  });

  it("subscribes to up to five instruments at once: four on the watchlist and the open one, the most the server allows", () => {
    const { connection } = live();
    connection.watch([1, 2, 3, 4]);
    connection.select(5);
    expect(sentRequests().filter((r) => r.startsWith("subscribe"))).to.have.length(5);
  });
});

describe("FeedConnection: requests for quotes", () => {
  const sentMessages = () => FakeWebSocket.latest.sent.map((frame) => decode(frame) as Record<string, unknown>);
  const request = { t: "rfq", ref: 9, id: 1, side: "buy", quantity: 500 } as const;

  it("sends a request for a quote, an accept and a reject over the open connection", () => {
    const { connection } = live();
    connection.requestQuote(request);
    connection.answerQuote("rfqAccept", 9);
    connection.answerQuote("rfqReject", 9);
    expect(sentMessages().slice(-3)).to.deep.equal([request, { t: "rfqAccept", ref: 9 }, { t: "rfqReject", ref: 9 }]);
  });

  it("tells the page at once that a request is lost when there is no open connection, and sends nothing", () => {
    const { connection, events } = setup(); // never connected
    connection.requestQuote(request);
    expect(events).to.deep.equal([{ type: "rfqResult", result: { t: "rfqResult", ref: 9, outcome: "unknown" } }]);
  });

  it("sends nothing for an accept or reject without an open connection", () => {
    const { connection } = setup();
    connection.connect("ws://localhost:1"); // connecting, not open
    connection.answerQuote("rfqAccept", 9);
    expect(FakeWebSocket.latest.sent).to.have.length(0);
  });

  it("passes the dealer's quote and result on to the page", () => {
    const { events } = live();
    const quote = { t: "rfqQuote", ref: 9, id: 1, side: "buy", quantity: 500, price: 30398, screenPrice: 30396, validForMs: 10_000 } as const;
    const result = { t: "rfqResult", ref: 9, outcome: "filled", price: 30398, tradeId: 3 } as const;
    FakeWebSocket.latest.receive(quote);
    FakeWebSocket.latest.receive(result);
    expect(events).to.deep.equal([
      { type: "rfqQuote", quote },
      { type: "rfqResult", result },
    ]);
  });
});

describe("FeedConnection: reconnecting and chaos commands", () => {
  type Reconnect = Extract<WorkerEvent, { type: "reconnect" }>;
  const reconnects = (events: WorkerEvent[]) => events.filter((e): e is Reconnect => e.type === "reconnect");
  const sentMessages = () => FakeWebSocket.latest.sent.map((frame) => decode(frame) as Record<string, unknown>);

  it("reports the next attempt and when it will be made, then opens a new socket at the same address after the wait", () => {
    cy.clock().then(() => {
      const { connection, events, statuses } = setup(() => 5000);
      connection.connect("ws://localhost:7");
      FakeWebSocket.latest.open();
      FakeWebSocket.latest.drop();
      const [first] = reconnects(events);
      expect(first!.attempt).to.equal(1);
      expect(first!.retryAt).to.be.within(5500, 6000); // one second, with some of it random
      expect(statuses().at(-1)).to.equal("reconnecting");
      expect(FakeWebSocket.instances).to.have.length(1);
      cy.tick(1000).then(() => {
        expect(FakeWebSocket.instances).to.have.length(2);
        expect(FakeWebSocket.latest.url).to.equal("ws://localhost:7");
        expect(statuses().at(-1)).to.equal("connecting");
        connection.close();
      });
    });
  });

  it("waits longer after each failed attempt", () => {
    cy.clock().then(() => {
      const { connection, events } = setup();
      connection.connect("ws://localhost:7");
      FakeWebSocket.latest.drop();
      cy.tick(1000).then(() => FakeWebSocket.latest.drop()); // the second attempt fails too
      cy.then(() => expect(reconnects(events).map((e) => e.attempt)).to.deep.equal([1, 2]));
      cy.tick(2000).then(() => {
        expect(FakeWebSocket.instances).to.have.length(3);
        connection.close();
      });
    });
  });

  it("starts again from the first attempt once a connection has worked", () => {
    cy.clock().then(() => {
      const { connection, events } = setup();
      connection.connect("ws://localhost:7");
      FakeWebSocket.latest.drop();
      cy.tick(1000).then(() => {
        FakeWebSocket.latest.open();
        FakeWebSocket.latest.receive(makeSession());
        FakeWebSocket.latest.drop();
        expect(reconnects(events).map((e) => e.attempt)).to.deep.equal([1, 1]);
        connection.close();
      });
    });
  });

  it("makes the attempt at once when asked to, and not a second one when the wait ends", () => {
    cy.clock().then(() => {
      const { connection } = setup();
      connection.connect("ws://localhost:7");
      FakeWebSocket.latest.drop();
      connection.retryNow();
      expect(FakeWebSocket.instances).to.have.length(2);
      cy.tick(20_000).then(() => {
        expect(FakeWebSocket.instances).to.have.length(2);
        connection.close();
      });
    });
  });

  it("stops trying when the connection is closed on purpose", () => {
    cy.clock().then(() => {
      const { connection } = setup();
      connection.connect("ws://localhost:7");
      FakeWebSocket.latest.drop();
      connection.close();
      cy.tick(20_000).then(() => expect(FakeWebSocket.instances).to.have.length(1));
    });
  });

  it("does not retry a server whose protocol it cannot speak", () => {
    cy.clock().then(() => {
      const { connection, statuses } = setup();
      connection.connect("ws://localhost:7");
      FakeWebSocket.latest.open();
      FakeWebSocket.latest.receive(makeSession({ v: 1 }));
      expect(statuses().at(-1)).to.equal("error");
      cy.tick(20_000).then(() => expect(FakeWebSocket.instances).to.have.length(1));
    });
  });

  it("follows the open instrument and the watchlist again on the new connection", () => {
    cy.clock().then(() => {
      const { connection } = setup();
      connection.connect("ws://localhost:7");
      connection.select(1);
      connection.watch([2]);
      FakeWebSocket.latest.open();
      FakeWebSocket.latest.drop();
      cy.tick(1000).then(() => {
        FakeWebSocket.latest.open();
        expect(sentRequests()).to.include.members(["history 1", "history 2", "subscribe 1", "subscribe 2"]);
        connection.close();
      });
    });
  });

  it("fails a request for a quote at once while it is reconnecting", () => {
    cy.clock().then(() => {
      const { connection, events } = setup();
      connection.connect("ws://localhost:7");
      FakeWebSocket.latest.open();
      FakeWebSocket.latest.drop();
      connection.requestQuote({ t: "rfq", ref: 3, id: 0, side: "buy", quantity: 10 });
      expect(events.at(-1)).to.deep.equal({ type: "rfqResult", result: { t: "rfqResult", ref: 3, outcome: "unknown" } });
      connection.close();
    });
  });

  describe("chaos commands", () => {
    it("sends an action, and the number some actions take", () => {
      const { connection } = live();
      connection.sendChaos("pause");
      connection.sendChaos("latency", 500);
      expect(sentMessages().slice(-2)).to.deep.equal([
        { t: "chaos", action: "pause" },
        { t: "chaos", action: "latency", value: 500 },
      ]);
    });

    it("sends nothing without an open connection", () => {
      const { connection } = setup();
      connection.connect("ws://localhost:1"); // connecting, not open
      connection.sendChaos("drop");
      expect(FakeWebSocket.latest.sent).to.have.length(0);
      connection.close();
    });
  });
});
