import { HISTORY_CAPACITY, HISTORY_INTERVAL_MS, appendTick, flatten, summarise } from "../../../src/chart/series";

describe("flatten", () => {
  it("turns [time, price] pairs into one flat list, in order", () => {
    expect(flatten([[1000, 5], [2000, 6], [3000, 7]])).to.deep.equal([1000, 5, 2000, 6, 3000, 7]);
  });

  it("gives an empty list for no points", () => {
    expect(flatten([])).to.deep.equal([]);
  });
});

describe("appendTick", () => {
  it("starts the data with the first price", () => {
    const data: number[] = [];
    appendTick(data, 5000, 100);
    expect(data).to.deep.equal([5000, 100]);
  });

  it("replaces the newest price when the update is less than an interval after it (each point holds the last price of its second)", () => {
    const data = [1000, 100];
    appendTick(data, 1000 + HISTORY_INTERVAL_MS - 1, 105);
    expect(data).to.deep.equal([1000, 105]);
  });

  it("starts a new point once an interval has passed", () => {
    const data = [1000, 100];
    appendTick(data, 1000 + HISTORY_INTERVAL_MS, 105);
    expect(data).to.deep.equal([1000, 100, 2000, 105]);
  });

  it("starts only one new point however long the gap is", () => {
    const data = [1000, 100];
    appendTick(data, 1_000_000, 105);
    expect(data).to.deep.equal([1000, 100, 1_000_000, 105]);
  });

  it("ignores a price older than the newest point, such as one that arrived out of order", () => {
    const data = [5000, 100];
    appendTick(data, 4000, 90);
    expect(data).to.deep.equal([5000, 100]);
  });

  it("keeps at most the capacity, dropping the oldest points first", () => {
    const data: number[] = [];
    for (let i = 0; i < HISTORY_CAPACITY + 10; i++) appendTick(data, i * HISTORY_INTERVAL_MS, i);
    expect(data.length / 2).to.equal(HISTORY_CAPACITY);
    expect(data[0]).to.equal(10 * HISTORY_INTERVAL_MS); // the first ten are gone
    expect(data.at(-1)).to.equal(HISTORY_CAPACITY + 9);
  });

  it("accepts a smaller capacity", () => {
    const data: number[] = [];
    for (let i = 0; i < 5; i++) appendTick(data, i * HISTORY_INTERVAL_MS, i, 3);
    expect(data).to.deep.equal([2000, 2, 3000, 3, 4000, 4]);
  });
});

describe("summarise", () => {
  it("is null for no data", () => {
    expect(summarise([])).to.equal(null);
  });

  it("gives the last, highest and lowest price and the number of points", () => {
    const summary = summarise([0, 10, 1000, 30, 2000, 20]);
    expect(summary).to.deep.include({ count: 3, last: 20, high: 30, low: 10 });
  });

  it("covers at least one minute, and rounds the span to whole minutes", () => {
    expect(summarise([0, 1, 1000, 2])!.minutes).to.equal(1);
    expect(summarise([0, 1, 5 * 60_000, 2])!.minutes).to.equal(5);
    expect(summarise([0, 1, 4.6 * 60_000, 2])!.minutes).to.equal(5);
  });

  it("works with a single point", () => {
    expect(summarise([0, 42])).to.deep.include({ count: 1, last: 42, high: 42, low: 42 });
  });

  it("accepts a typed array, as the worker sends", () => {
    expect(summarise(Float64Array.from([0, 10, 1000, 12]))).to.deep.include({ last: 12, high: 12, low: 10 });
  });
});
