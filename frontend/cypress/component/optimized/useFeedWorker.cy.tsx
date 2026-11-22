import { useState } from "react";
import { collector } from "../../../src/hud/collector";
import type { FeedStats, WorkerCommand } from "../../../src/feed/messages";
import { WS_URL } from "../../../src/feed/url";
import type { FeedStore } from "../../../src/optimized/feedStore";
import {
  PULL_TIMEOUT_MS,
  RESUME_GRACE_MS,
  initialFeedState,
  reduceWorkerEvent,
  useFeedWorker,
  type FeedWorkerState,
} from "../../../src/optimized/useFeedWorker";
import { FakeWorker } from "../../support/fakeWorker";
import { afterFrames } from "../../support/frames";
import { makeQuote, makeReferenceData, makeSession, makeSnapshot } from "../../support/fixtures";
import { withFakeWorker } from "../../support/render";

const STATS: FeedStats = { messages: 2, updatesIn: 7, gaps: 1, latencies: [4, 9] };

describe("reduceWorkerEvent", () => {
  it("records the worker's scope", () => {
    expect(reduceWorkerEvent(initialFeedState, { type: "ready", scope: "DedicatedWorkerGlobalScope" }).scope).to.equal(
      "DedicatedWorkerGlobalScope",
    );
  });

  it("records the status and the session", () => {
    const session = makeSession();
    const state = reduceWorkerEvent(reduceWorkerEvent(initialFeedState, { type: "status", status: "live" }), {
      type: "session",
      session,
    });
    expect(state).to.deep.include({ status: "live", session });
  });

  it("records which reconnection attempt is next while the connection is down, and forgets it once it is back", () => {
    const down = reduceWorkerEvent(reduceWorkerEvent(initialFeedState, { type: "status", status: "reconnecting" }), {
      type: "reconnect",
      attempt: 2,
      retryAt: 5000,
    });
    expect(down).to.deep.include({ status: "reconnecting", reconnect: { attempt: 2, retryAt: 5000 } });
    expect(reduceWorkerEvent(down, { type: "status", status: "connecting" }).reconnect).to.equal(null);
    expect(reduceWorkerEvent(down, { type: "status", status: "live" }).reconnect).to.equal(null);
  });

  it("keeps the attempt when the status is repeated while still reconnecting", () => {
    const down = reduceWorkerEvent(initialFeedState, { type: "reconnect", attempt: 1, retryAt: 100 });
    expect(reduceWorkerEvent(down, { type: "status", status: "reconnecting" }).reconnect).to.deep.equal({ attempt: 1, retryAt: 100 });
  });

  it("records an unsupported protocol version", () => {
    expect(reduceWorkerEvent(initialFeedState, { type: "badVersion", version: 1 }).badVersion).to.equal(1);
  });

  it("counts the instruments in the reference data, and an arrival after a timeout clears the warning", () => {
    const late = reduceWorkerEvent(initialFeedState, { type: "referenceTimeout" });
    expect(late.referenceMissing).to.equal(true);
    const arrived = reduceWorkerEvent(late, { type: "reference", instruments: makeReferenceData().instruments });
    expect(arrived).to.deep.include({ referenceCount: 3, referenceMissing: false });
  });

  it("notes the first snapshot, and returns the very same state for later ones so the page does not render again", () => {
    const first = reduceWorkerEvent(initialFeedState, { type: "snapshot", quotes: [] });
    expect(first.hasSnapshot).to.equal(true);
    expect(reduceWorkerEvent(first, { type: "snapshot", quotes: [] })).to.equal(first);
  });

  it("remembers which instruments the server has no price history for, once each", () => {
    const first = reduceWorkerEvent(initialFeedState, { type: "chartUnavailable", id: 4 });
    expect(first.chartUnavailable).to.deep.equal([4]);
    const second = reduceWorkerEvent(first, { type: "chartUnavailable", id: 7 });
    expect(second.chartUnavailable).to.deep.equal([4, 7]);
    expect(reduceWorkerEvent(second, { type: "chartUnavailable", id: 4 })).to.equal(second); // already known: the same state
  });

  it("returns the very same state for a batch, so 60 batches a second cause no page renders", () => {
    expect(reduceWorkerEvent(initialFeedState, { type: "batch", updates: [], stats: STATS })).to.equal(initialFeedState);
  });
});

describe("useFeedWorker", () => {
  let latest: { state: FeedWorkerState; store: FeedStore };

  function Host() {
    latest = useFeedWorker();
    return <output>{latest.state.status}</output>;
  }
  const mount = () => {
    collector.reset();
    cy.mount(withFakeWorker(<Host />));
    cy.wrap(FakeWorker.instances).should("have.length.greaterThan", 0); // React starts the worker just after mounting
  };
  const pulls = () => FakeWorker.latest.posted.filter((command: WorkerCommand) => command.type === "pull").length;

  it("starts one worker and tells it to connect", () => {
    mount();
    cy.then(() => {
      expect(FakeWorker.instances).to.have.length(1);
      expect(FakeWorker.latest.posted[0]).to.deep.equal({ type: "connect", url: WS_URL });
    });
  });

  it("starts out connecting, and follows what the worker reports", () => {
    mount();
    cy.contains("output", "connecting");
    cy.then(() => FakeWorker.latest.emit({ type: "status", status: "live" }));
    cy.contains("output", "live");
  });

  it("terminates the worker when the page is left, and stops listening to it", () => {
    mount();
    cy.then(() => cy.mount(<span>gone</span>));
    cy.then(() => {
      expect(FakeWorker.latest.terminated).to.equal(true);
      expect(FakeWorker.latest.onmessage).to.equal(null);
    });
  });

  describe("asking for updates", () => {
    it("asks once per animation frame, but never again while the answer is still outstanding", () => {
      mount();
      cy.wrap(FakeWorker).should(() => expect(pulls()).to.equal(1));
      afterFrames(10); // many frames pass with no answer
      cy.then(() => expect(pulls()).to.equal(1));
    });

    it("asks again once the batch has arrived", () => {
      mount();
      cy.wrap(FakeWorker).should(() => expect(pulls()).to.equal(1));
      cy.then(() => FakeWorker.latest.emit({ type: "batch", updates: [], stats: STATS }));
      cy.wrap(FakeWorker).should(() => expect(pulls()).to.equal(2));
    });

    it("asks again when an answer never comes, instead of waiting for ever", () => {
      mount();
      cy.wrap(FakeWorker).should(() => expect(pulls()).to.equal(1));
      afterFrames(10);
      cy.then(() => expect(pulls()).to.equal(1)); // not yet: the first request may still be answered
      cy.wrap(FakeWorker, { timeout: PULL_TIMEOUT_MS + 4_000 }).should(() => expect(pulls()).to.equal(2));
    });

    it("stops asking after the page is left", () => {
      mount();
      cy.wrap(FakeWorker).should(() => expect(pulls()).to.equal(1));
      cy.then(() => cy.mount(<span>gone</span>));
      cy.then(() => FakeWorker.latest.emit({ type: "batch", updates: [], stats: STATS })); // ignored: nobody is listening
      afterFrames(10);
      cy.then(() => expect(pulls()).to.equal(1));
    });
  });

  describe("the store", () => {
    it("gets rows once the reference data and the snapshot have both arrived", () => {
      mount();
      cy.then(() => {
        FakeWorker.latest.emit({ type: "reference", instruments: makeReferenceData().instruments });
        expect(latest.store.rows).to.have.length(0);
        FakeWorker.latest.emit({ type: "snapshot", quotes: makeSnapshot(1).quotes });
        expect(latest.store.rows).to.have.length(3);
      });
      cy.wrap(null).should(() => expect(latest.state.hasSnapshot).to.equal(true)); // React applies the state a moment later
    });

    it("applies batches, and adds the worker's counters to the HUD's", () => {
      mount();
      cy.then(() => {
        FakeWorker.latest.emit({ type: "reference", instruments: makeReferenceData().instruments });
        FakeWorker.latest.emit({ type: "snapshot", quotes: makeSnapshot(1).quotes });
        FakeWorker.latest.emit({ type: "batch", updates: [makeQuote(1, { last: 30000 })], stats: STATS });
        expect(latest.store.rows.find((row) => row.id === 1)?.last).to.be.closeTo(300, 1e-9);
        const window = collector.drain();
        expect(window).to.deep.include({ messages: 2, updates: 7, gaps: 1 });
        expect(window.latencies).to.deep.equal([4, 9]);
      });
    });
  });

  describe("stale rows", () => {
    const STALE_AFTER = 5_000;
    const sweepInterval = 1_000;

    const withRows = () => {
      cy.clock(1_000);
      mount();
      cy.then(() => {
        FakeWorker.latest.emit({ type: "reference", instruments: makeReferenceData().instruments });
        FakeWorker.latest.emit({ type: "snapshot", quotes: makeSnapshot(1).quotes });
      });
    };

    const setHidden = (hidden: boolean) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
      if (!hidden) document.dispatchEvent(new Event("visibilitychange"));
    };
    afterEach(() => setHidden(false));

    it("marks rows that have gone quiet, checking once a second", () => {
      withRows();
      cy.tick(STALE_AFTER).then(() => expect(latest.store.rows.every((row) => !row.stale)).to.equal(true));
      cy.tick(sweepInterval + 1).then(() => expect(latest.store.rows.every((row) => row.stale)).to.equal(true));
    });

    it("does not mark rows while the page is hidden, because nothing could have been heard", () => {
      withRows();
      cy.then(() => setHidden(true));
      cy.tick(STALE_AFTER * 4).then(() => expect(latest.store.rows.some((row) => row.stale)).to.equal(false));
    });

    it("gives updates a moment to arrive when the page comes back, before marking anything stale", () => {
      withRows();
      cy.then(() => setHidden(true));
      cy.tick(STALE_AFTER * 4);
      cy.then(() => setHidden(false));
      cy.tick(RESUME_GRACE_MS - 1).then(() => expect(latest.store.rows.some((row) => row.stale)).to.equal(false));
      cy.tick(sweepInterval * 2).then(() => expect(latest.store.rows.every((row) => row.stale)).to.equal(true)); // nothing arrived, so they are stale
    });
  });
});

describe("useFeedWorker: charts and the watchlist", () => {
  let latest: { state: FeedWorkerState; store: FeedStore };
  let setChoice: (choice: { selectedId: number | null; watchlist: number[] }) => void;
  const posted = (type: string) => FakeWorker.latest.posted.filter((command: WorkerCommand) => command.type === type);

  function Host({ selectedId, watchlist }: { selectedId: number | null; watchlist: number[] }) {
    latest = useFeedWorker(selectedId, watchlist);
    return <output>{latest.state.status}</output>;
  }
  // The page's part: it holds what is open and what is on the watchlist, and the test changes them through `setChoice`.
  function Page({ initial }: { initial: { selectedId: number | null; watchlist: number[] } }) {
    const [choice, setState] = useState(initial);
    setChoice = setState;
    return <Host selectedId={choice.selectedId} watchlist={choice.watchlist} />;
  }
  const mount = (selectedId: number | null, watchlist: number[]) => {
    cy.mount(withFakeWorker(<Page initial={{ selectedId, watchlist }} />));
    cy.wrap(FakeWorker.instances).should("have.length.greaterThan", 0);
  };
  const change = (selectedId: number | null, watchlist: number[]) => cy.then(() => setChoice({ selectedId, watchlist }));
  const chart = (id: number, ...numbers: number[]) => ({ id, data: Float64Array.from(numbers) });

  it("tells a new worker which chart is open and which symbols are on the watchlist", () => {
    mount(1, [2, 3]);
    cy.wrap(null).should(() => {
      expect(posted("select").at(-1)).to.deep.equal({ type: "select", id: 1 });
      expect(posted("watch").at(-1)).to.deep.equal({ type: "watch", ids: [2, 3] });
    });
  });

  it("tells the worker when another chart is opened, or none", () => {
    mount(1, []);
    change(4, []);
    cy.wrap(null).should(() => expect(posted("select").at(-1)).to.deep.equal({ type: "select", id: 4 }));
    change(null, []);
    cy.wrap(null).should(() => expect(posted("select").at(-1)).to.deep.equal({ type: "select", id: null }));
  });

  it("tells the worker when the watchlist changes", () => {
    mount(null, [1]);
    change(null, [1, 5]);
    cy.wrap(null).should(() => expect(posted("watch").at(-1)).to.deep.equal({ type: "watch", ids: [1, 5] }));
    change(null, []);
    cy.wrap(null).should(() => expect(posted("watch").at(-1)).to.deep.equal({ type: "watch", ids: [] }));
  });

  it("puts the charts that arrive with a batch into the store", () => {
    mount(1, [2]);
    cy.then(() => FakeWorker.latest.emit({ type: "batch", updates: [], stats: STATS, charts: [chart(1, 0, 100), chart(2, 0, 200)] }));
    cy.wrap(null).should(() => {
      expect([...latest.store.chart(1)!]).to.deep.equal([0, 100]);
      expect([...latest.store.chart(2)!]).to.deep.equal([0, 200]);
    });
  });

  it("drops the chart of a symbol that is no longer open or on the watchlist, and keeps the others", () => {
    mount(1, [2]);
    cy.then(() => FakeWorker.latest.emit({ type: "batch", updates: [], stats: STATS, charts: [chart(1, 0, 100), chart(2, 0, 200)] }));
    cy.wrap(null).should(() => expect(latest.store.chart(1)).to.not.equal(undefined));
    change(null, [2]); // the open chart is closed
    cy.wrap(null).should(() => {
      expect(latest.store.chart(1)).to.equal(undefined);
      expect(latest.store.chart(2)).to.not.equal(undefined);
    });
    change(null, []); // and 2 is taken off the watchlist
    cy.wrap(null).should(() => expect(latest.store.chart(2)).to.equal(undefined));
  });

  it("keeps the chart of a symbol that is open and on the watchlist when it is closed", () => {
    mount(1, [1]);
    cy.then(() => FakeWorker.latest.emit({ type: "batch", updates: [], stats: STATS, charts: [chart(1, 0, 100)] }));
    cy.wrap(null).should(() => expect(latest.store.chart(1)).to.not.equal(undefined));
    change(null, [1]);
    afterFrames(5);
    cy.then(() => expect(latest.store.chart(1)).to.not.equal(undefined));
  });

  it("reflects, in its state, a symbol the server has no history for", () => {
    mount(9, []);
    cy.then(() => FakeWorker.latest.emit({ type: "chartUnavailable", id: 9 }));
    cy.wrap(null).should(() => expect(latest.state.chartUnavailable).to.deep.equal([9]));
  });
});
