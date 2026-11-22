import { CHART_RANGES, DEFAULT_RANGE, HISTORY_RANGES, LIVE_RANGE, baselineFor, baselineIsPrevClose, rangeKey } from "../../../src/chart/range";

describe("chart ranges", () => {
  it("offers a day, a month, a year, the year so far and the maximum, shortest first, and no five-minute button", () => {
    expect([...CHART_RANGES]).to.deep.equal(["1d", "1m", "1y", "ytd", "max"]);
    expect(CHART_RANGES).not.to.include("5m");
  });

  it("starts on one day, while the real five-minute buffer stays the live range the watchlist uses", () => {
    expect(DEFAULT_RANGE).to.equal("1d");
    expect(LIVE_RANGE).to.equal("5m");
  });

  it("knows every range the server knows, including the live one, and every button is one of them", () => {
    expect([...HISTORY_RANGES]).to.deep.equal(["5m", "1d", "1m", "1y", "ytd", "max"]);
    for (const range of CHART_RANGES) expect(HISTORY_RANGES).to.include(range);
  });

  it("keys a series by instrument and range", () => {
    expect(rangeKey(7, "1m")).to.equal("7:1m");
    expect(rangeKey(7, "1m")).not.to.equal(rangeKey(7, "1y"));
    expect(rangeKey(7, "1m")).not.to.equal(rangeKey(8, "1m"));
  });
});

describe("baselineFor", () => {
  const data = [1000, 30500, 2000, 31000]; // starts at 305.00

  it("is the previous close for the live range and for one day", () => {
    expect(baselineFor("5m", data, 29800)).to.equal(29800);
    expect(baselineFor("1d", data, 29800)).to.equal(29800);
  });

  it("is where the range starts for the longer ranges", () => {
    for (const range of ["1m", "1y", "ytd", "max"] as const) expect(baselineFor(range, data, 29800), range).to.equal(30500);
  });

  it("is unknown (0) for a longer range that has no data yet", () => {
    expect(baselineFor("1m", null, 29800)).to.equal(0);
    expect(baselineFor("1m", undefined, 29800)).to.equal(0);
    expect(baselineFor("1m", [], 29800)).to.equal(0);
  });

  it("says whether the dotted line is the previous close (the short ranges) or the start of the range", () => {
    expect(baselineIsPrevClose("5m")).to.equal(true);
    expect(baselineIsPrevClose("1d")).to.equal(true);
    for (const range of ["1m", "1y", "ytd", "max"] as const) expect(baselineIsPrevClose(range), range).to.equal(false);
  });
});
