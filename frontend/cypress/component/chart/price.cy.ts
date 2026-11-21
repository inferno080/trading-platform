import { isUp, priceSummary } from "../../../src/chart/price";

// Flat [time, price, ...] data whose newest price is `last`.
const data = (last: number) => [0, 30000, 1000, last];

describe("priceSummary", () => {
  it("is null with no data, or with fewer than two numbers", () => {
    expect(priceSummary(undefined, 2, 29800, "en-US")).to.equal(null);
    expect(priceSummary([], 2, 29800, "en-US")).to.equal(null);
    expect(priceSummary([1000], 2, 29800, "en-US")).to.equal(null);
  });

  it("gives the newest price in the instrument's decimals", () => {
    expect(priceSummary(data(91276), 2, 90711, "en-US")!.price).to.equal("912.76");
  });

  it("gives the move since the previous close as a signed percentage and a signed amount, and the direction", () => {
    const summary = priceSummary(data(91276), 2, 90711, "en-US")!;
    expect(summary).to.deep.equal({ price: "912.76", direction: 1, percent: "+0.62%", change: "+5.65" });
  });

  it("gives a negative move and the down direction when the price is below the previous close", () => {
    const summary = priceSummary(data(29705), 2, 29800, "en-US")!;
    expect(summary.direction).to.equal(-1);
    expect(summary.percent).to.match(/^[-−]0\.32%$/);
    expect(summary.change).to.match(/^[-−]0\.95$/);
  });

  it("has no sign, and no direction, when the price equals the previous close", () => {
    expect(priceSummary(data(29800), 2, 29800, "en-US")).to.deep.equal({ price: "298.00", direction: 0, percent: "0.00%", change: "0.00" });
  });

  it("gives only the price when there is no previous close to compare with", () => {
    expect(priceSummary(data(29800), 2, 0, "en-US")).to.deep.equal({ price: "298.00", direction: 0, percent: null, change: null });
  });

  it("uses the instrument's own decimals: a yen price has none, an FX price has four", () => {
    expect(priceSummary(data(47213), 0, 46566, "en-US")).to.deep.include({ price: "47,213", percent: "+1.39%", change: "+647" });
    expect(priceSummary(data(12805), 4, 12937, "en-US")!.price).to.equal("1.2805");
    expect(priceSummary(data(12805), 4, 12937, "en-US")!.change).to.match(/^[-−]0\.0132$/);
  });

  it("follows the locale", () => {
    expect(priceSummary(data(123456), 2, 123000, "de-DE")!.price).to.equal("1.234,56");
    expect(priceSummary(data(123456), 2, 123000, "de-DE")!.change).to.equal("+4,56");
  });

  it("accepts a typed array, as the worker sends", () => {
    expect(priceSummary(Float64Array.from(data(91276)), 2, 90711, "en-US")!.price).to.equal("912.76");
  });
});

describe("isUp", () => {
  it("is true when the newest price is above the previous close", () => {
    expect(isUp(data(30500), 29800)).to.equal(true);
  });

  it("is false when the newest price is below the previous close, even if it rose during the period", () => {
    expect(isUp(data(30500), 31000)).to.equal(false);
  });

  it("is true when the price equals the previous close", () => {
    expect(isUp(data(29800), 29800)).to.equal(true);
  });

  it("falls back to where the data starts when there is no previous close", () => {
    expect(isUp(data(31000), 0)).to.equal(true); // data starts at 30000
    expect(isUp(data(29000), 0)).to.equal(false);
  });
});
