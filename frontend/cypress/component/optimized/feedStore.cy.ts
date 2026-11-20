import { FeedStore, STALE_AFTER_MS, type RowsChange } from "../../../src/optimized/feedStore";
import { makeQuote, makeReference, makeReferenceData, makeSnapshot } from "../../support/fixtures";

// A store with everything it needs to show rows, and a list of the changes it announced.
const ready = (now = 1_000) => {
  const store = new FeedStore();
  const changes: RowsChange[] = [];
  store.subscribe((change) => changes.push(change));
  store.setReference(makeReferenceData().instruments, now);
  store.setSnapshot(makeSnapshot(1).quotes, now);
  changes.length = 0;
  return { store, changes };
};

describe("FeedStore", () => {
  describe("becoming ready", () => {
    it("has no rows, and announces nothing, until both the snapshot and the reference data have arrived", () => {
      const store = new FeedStore();
      const changes: RowsChange[] = [];
      store.subscribe((change) => changes.push(change));
      store.setSnapshot(makeSnapshot(1).quotes, 0);
      expect(store.rows).to.have.length(0);
      expect(changes).to.have.length(0);
      store.setReference(makeReferenceData().instruments, 0);
      expect(store.rows).to.have.length(3);
      expect(changes).to.have.length(1);
      expect(changes[0]?.kind).to.equal("reset");
    });

    it("works whichever of the two arrives first", () => {
      const store = new FeedStore();
      store.setReference(makeReferenceData().instruments, 0);
      expect(store.rows).to.have.length(0);
      store.setSnapshot(makeSnapshot(1).quotes, 0);
      expect(store.rows).to.have.length(3);
    });

    it("keeps updates that arrive before it is ready, so they are in the first rows", () => {
      const store = new FeedStore();
      store.setSnapshot(makeSnapshot(1).quotes, 0);
      store.applyBatch([makeQuote(0, { last: 29999 })], 0);
      store.setReference(makeReferenceData().instruments, 0);
      expect(store.rows.find((row) => row.id === 0)?.last).to.be.closeTo(299.99, 1e-9);
    });
  });

  describe("a row", () => {
    it("joins the quote with its reference data and turns wire integers into real prices", () => {
      const { store } = ready();
      expect(store.rows[0]).to.deep.include({
        id: 0,
        sym: "AAA",
        name: "Apex Systems Inc.",
        currency: "USD",
        decimals: 2,
        tickSize: 0.01,
        bidSz: 2700,
        askSz: 3500,
        vol: 8600,
        stale: false,
      });
      expect(store.rows[0]?.bid).to.be.closeTo(299.17, 1e-9);
      expect(store.rows[0]?.ask).to.be.closeTo(299.21, 1e-9);
      expect(store.rows[0]?.spread).to.be.closeTo(0.04, 1e-9);
      expect(store.rows[0]?.last).to.be.closeTo(299.2, 1e-9);
      expect(store.rows[0]?.prevClose).to.be.closeTo(298, 1e-9);
    });

    it("uses each instrument's own decimals, so a 3-decimal instrument is not read as a 2-decimal one", () => {
      const store = new FeedStore();
      store.setReference([makeReference(0, { decimals: 3, prevClose: 150_000 })], 0);
      store.setSnapshot([makeQuote(0, { bid: 150_120, ask: 150_130, last: 150_125 })], 0);
      expect(store.rows[0]?.last).to.be.closeTo(150.125, 1e-9);
    });

    it("computes the change against the previous close as a fraction", () => {
      const { store } = ready();
      expect(store.rows[0]?.change).to.be.closeTo(29920 / 29800 - 1, 1e-12);
    });

    it("has no change when there is no previous close", () => {
      const store = new FeedStore();
      store.setReference([makeReference(0, { prevClose: 0 })], 0);
      store.setSnapshot([makeQuote(0)], 0);
      expect(store.rows[0]?.change).to.equal(null);
    });

    it("leaves out an instrument that has no reference data, because its prices cannot be read", () => {
      const store = new FeedStore();
      store.setReference([makeReference(0)], 0);
      store.setSnapshot([makeQuote(0), makeQuote(1)], 0);
      expect(store.rows.map((row) => row.id)).to.deep.equal([0]);
    });
  });

  describe("applying a batch", () => {
    it("announces the changed rows once, however many there are, and leaves the others alone", () => {
      const { store, changes } = ready();
      store.applyBatch([makeQuote(0, { last: 29950 }), makeQuote(2, { last: 29900 })], 2_000);
      expect(changes).to.have.length(1);
      expect(changes[0]?.kind).to.equal("update");
      expect(changes[0]?.rows.map((row) => row.id)).to.deep.equal([0, 2]);
      expect(store.rows.find((row) => row.id === 1)?.updatedAt).to.equal(1_000);
    });

    it("announces nothing for an empty batch", () => {
      const { store, changes } = ready();
      store.applyBatch([], 2_000);
      expect(changes).to.have.length(0);
    });

    it("tracks which way each price last moved, and keeps showing it while the price holds still", () => {
      const { store } = ready();
      store.applyBatch([makeQuote(0, { bid: 29920, ask: 29915, last: 29910 })], 2_000); // bid up, ask down, last down
      expect(store.rows[0]).to.deep.include({ dirBid: 1, dirAsk: -1, dirLast: -1 });
      store.applyBatch([makeQuote(0, { bid: 29920, ask: 29915, last: 29910, vol: 9000 })], 3_000); // nothing moved
      expect(store.rows[0]).to.deep.include({ dirBid: 1, dirAsk: -1, dirLast: -1 });
    });

    it("shows no direction before a price has moved", () => {
      const { store } = ready();
      expect(store.rows[0]).to.deep.include({ dirBid: 0, dirAsk: 0, dirLast: 0 });
    });

    it("records when the row was updated, and makes it fresh again", () => {
      const { store } = ready();
      store.sweepStale(1_000 + STALE_AFTER_MS + 1);
      store.applyBatch([makeQuote(0)], 9_000);
      expect(store.rows[0]).to.deep.include({ updatedAt: 9_000, stale: false });
    });
  });

  describe("a new snapshot (after a gap)", () => {
    it("replaces all the rows in one announcement", () => {
      const { store, changes } = ready();
      store.setSnapshot([makeQuote(0, { last: 31000 }), makeQuote(1), makeQuote(2)], 5_000);
      expect(changes).to.have.length(1);
      expect(changes[0]?.kind).to.equal("reset");
      expect(store.rows).to.have.length(3);
      expect(store.rows[0]?.last).to.be.closeTo(310, 1e-9);
    });
  });

  describe("stale rows", () => {
    it("marks a row stale once it has been quiet for longer than the limit, and announces only the rows that changed state", () => {
      const { store, changes } = ready(1_000);
      store.applyBatch([makeQuote(1)], 5_000); // row 1 is fresh, rows 0 and 2 are not
      changes.length = 0;
      const changed = store.sweepStale(1_000 + STALE_AFTER_MS + 1);
      expect(changed.map((row) => row.id)).to.deep.equal([0, 2]);
      expect(changes).to.have.length(1);
      expect(store.rows.find((row) => row.id === 1)?.stale).to.equal(false);
    });

    it("does not mark a row stale at exactly the limit", () => {
      const { store } = ready(1_000);
      expect(store.sweepStale(1_000 + STALE_AFTER_MS)).to.have.length(0);
    });

    it("announces nothing when no row changed state, and does not repeat itself", () => {
      const { store, changes } = ready(1_000);
      store.sweepStale(1_000 + STALE_AFTER_MS + 1);
      changes.length = 0;
      expect(store.sweepStale(1_000 + STALE_AFTER_MS + 2)).to.have.length(0);
      expect(changes).to.have.length(0);
    });
  });

  it("stops announcing to a listener that unsubscribed", () => {
    const { store } = ready();
    const calls: RowsChange[] = [];
    const unsubscribe = store.subscribe((change) => calls.push(change));
    store.applyBatch([makeQuote(0)], 2_000);
    unsubscribe();
    store.applyBatch([makeQuote(0)], 3_000);
    expect(calls).to.have.length(1);
  });
});
