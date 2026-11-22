import { applyUpdates } from "../../../src/naive/feedState";
import { makeQuote, makeUpdate } from "../../support/fixtures";

describe("applyUpdates", () => {
  const quotes = [makeQuote(0), makeQuote(1), makeQuote(2)];

  it("returns a new array and leaves the previous one untouched", () => {
    const next = applyUpdates(quotes, [makeUpdate(1, { bid: 30000 })]);
    expect(next).not.to.equal(quotes);
    expect(quotes[1]?.bid).to.equal(29917);
    expect(next[1]?.bid).to.equal(30000);
  });

  it("merges an update into the matching quote and keeps the symbol", () => {
    const next = applyUpdates(quotes, [makeUpdate(2, { last: 31000, vol: 9000 })]);
    expect(next[2]).to.deep.include({ id: 2, sym: "AAC", last: 31000, vol: 9000, bid: 29917 });
  });

  it("applies several updates in one call, the last one winning for the same instrument", () => {
    const next = applyUpdates(quotes, [makeUpdate(0, { bid: 1 }), makeUpdate(0, { bid: 2 }), makeUpdate(1, { bid: 3 })]);
    expect(next.map((q) => q.bid)).to.deep.equal([2, 3, 29917]);
  });

  it("ignores updates for instruments that are not in the table", () => {
    const next = applyUpdates(quotes, [makeUpdate(99, { bid: 1 })]);
    expect(next).to.have.length(3);
    expect(next.map((q) => q.bid)).to.deep.equal([29917, 29917, 29917]);
  });

  it("copies the quotes that did not change, so they stay the same objects", () => {
    const next = applyUpdates(quotes, [makeUpdate(0, { bid: 1 })]);
    expect(next[1]).to.equal(quotes[1]);
    expect(next[0]).not.to.equal(quotes[0]);
  });
});
