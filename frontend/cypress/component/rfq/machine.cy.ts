import type { RfqResult } from "../../../src/protocol/messages";
import { MAX_QUANTITY, canRequest, initialRfqState, reduceRfq, remainingMs, type Request, type RfqEvent, type RfqState } from "../../../src/rfq/machine";

const request: Request = { ref: 7, id: 0, side: "buy", quantity: 1000 };
const quote = { price: 30398, screenPrice: 30396, validForMs: 10_000, receivedAt: 1_000 };
const result = (overrides: Partial<RfqResult>): RfqEvent => ({ type: "result", result: { t: "rfqResult", ref: 7, outcome: "filled", ...overrides } });

const run = (...events: RfqEvent[]): RfqState => events.reduce(reduceRfq, initialRfqState);
const requesting = run({ type: "request", request });
const quoted = run({ type: "request", request }, { type: "quote", ref: 7, quote });
const accepting = reduceRfq(quoted, { type: "accept" });

describe("the RFQ state machine", () => {
  it("allows at most a million shares", () => {
    expect(MAX_QUANTITY).to.equal(1_000_000);
  });

  it("starts idle, and a request moves it to requesting", () => {
    expect(initialRfqState.status).to.equal("idle");
    expect(requesting).to.deep.equal({ status: "requesting", request });
  });

  it("only lets a new request start when nothing is in progress", () => {
    for (const state of [requesting, quoted, accepting]) expect(canRequest(state)).to.equal(false);
    for (const status of ["idle", "accepted", "rejected", "expired", "declined", "failed"] as const) {
      expect(canRequest({ status } as RfqState)).to.equal(true);
    }
    expect(reduceRfq(quoted, { type: "request", request: { ...request, ref: 8 } })).to.equal(quoted);
  });

  it("takes the dealer's quote for the request it asked, and ignores a quote for another one", () => {
    expect(quoted).to.deep.equal({ status: "quoted", request, quote });
    expect(reduceRfq(requesting, { type: "quote", ref: 99, quote })).to.equal(requesting);
    expect(reduceRfq(initialRfqState, { type: "quote", ref: 7, quote })).to.equal(initialRfqState);
  });

  it("accepting a quote moves to accepting, and a fill finishes it with the price and the trade", () => {
    expect(accepting.status).to.equal("accepting");
    expect(reduceRfq(accepting, result({ price: 30399, tradeId: 5 }))).to.deep.equal({ status: "accepted", request, price: 30399, tradeId: 5 });
  });

  it("falls back to the quoted price and trade 0 if a fill does not say", () => {
    expect(reduceRfq(accepting, result({}))).to.deep.equal({ status: "accepted", request, price: 30398, tradeId: 0 });
  });

  it("rejecting a quote finishes it as rejected", () => {
    expect(reduceRfq(quoted, { type: "reject" })).to.deep.equal({ status: "rejected", request });
  });

  it("accept and reject do nothing without a quote", () => {
    expect(reduceRfq(requesting, { type: "accept" })).to.equal(requesting);
    expect(reduceRfq(requesting, { type: "reject" })).to.equal(requesting);
  });

  it("is declined with the reason the dealer gives, or as a quantity problem if it gives none", () => {
    expect(reduceRfq(requesting, result({ outcome: "declined", reason: "busy" }))).to.deep.equal({ status: "declined", request, reason: "busy" });
    expect(reduceRfq(requesting, result({ outcome: "declined" }))).to.deep.equal({ status: "declined", request, reason: "quantity" });
  });

  it("fails when the server does not know the request, in whichever state it was waiting", () => {
    expect(reduceRfq(requesting, result({ outcome: "unknown" }))).to.deep.equal({ status: "failed", request, whileAccepting: false });
    expect(reduceRfq(quoted, result({ outcome: "unknown" }))).to.deep.equal({ status: "failed", request, whileAccepting: false });
    expect(reduceRfq(accepting, result({ outcome: "unknown" }))).to.deep.equal({ status: "failed", request, whileAccepting: true });
  });

  it("expires when the server says so, while quoted or accepting", () => {
    expect(reduceRfq(quoted, result({ outcome: "expired" }))).to.deep.equal({ status: "expired", request });
    expect(reduceRfq(accepting, result({ outcome: "expired" }))).to.deep.equal({ status: "expired", request });
  });

  it("ignores results that do not fit: another request, no request, a repeat after it finished, or a fill while only requesting", () => {
    expect(reduceRfq(requesting, { type: "result", result: { t: "rfqResult", ref: 8, outcome: "unknown" } })).to.equal(requesting);
    expect(reduceRfq(initialRfqState, result({}))).to.equal(initialRfqState);
    const done = reduceRfq(accepting, result({ tradeId: 1 }));
    expect(reduceRfq(done, result({ outcome: "expired" }))).to.equal(done);
    expect(reduceRfq(requesting, result({}))).to.equal(requesting);
    expect(reduceRfq(quoted, result({ outcome: "declined" }))).to.equal(quoted);
    expect(reduceRfq(accepting, result({ outcome: "rejected" }))).to.equal(accepting);
  });

  it("counts down from when the quote arrived, and never below zero", () => {
    expect(remainingMs(quoted, 1_000)).to.equal(10_000);
    expect(remainingMs(quoted, 4_000)).to.equal(7_000);
    expect(remainingMs(quoted, 99_000)).to.equal(0);
    expect(remainingMs(requesting, 1_000)).to.equal(0);
  });

  it("expires on the tick that finds no time left, and not before", () => {
    expect(reduceRfq(quoted, { type: "tick", now: 10_999 })).to.equal(quoted);
    expect(reduceRfq(quoted, { type: "tick", now: 11_000 })).to.deep.equal({ status: "expired", request });
    expect(reduceRfq(requesting, { type: "tick", now: 99_000 })).to.equal(requesting);
  });

  it("fails when the connection is lost mid-request, and says if it was while accepting", () => {
    expect(reduceRfq(requesting, { type: "disconnected" })).to.deep.equal({ status: "failed", request, whileAccepting: false });
    expect(reduceRfq(quoted, { type: "disconnected" })).to.deep.equal({ status: "failed", request, whileAccepting: false });
    expect(reduceRfq(accepting, { type: "disconnected" })).to.deep.equal({ status: "failed", request, whileAccepting: true });
    expect(reduceRfq(initialRfqState, { type: "disconnected" })).to.equal(initialRfqState);
  });

  it("goes back to idle on reset when finished, but an unfinished request cannot be wiped", () => {
    expect(reduceRfq(reduceRfq(quoted, { type: "reject" }), { type: "reset" })).to.equal(initialRfqState);
    expect(reduceRfq(quoted, { type: "reset" })).to.equal(quoted);
    expect(reduceRfq(requesting, { type: "reset" })).to.equal(requesting);
  });
});
