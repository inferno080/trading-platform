import { CHART_RANGES, DEFAULT_RANGE, HISTORY_RANGES, LIVE_RANGE, baselineFor, baselineIsPrevClose, rangeKey, sessionView } from "../../../src/chart/range";
import type { SessionInfo } from "../../../src/protocol/messages";

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

describe("sessionView", () => {
  const newYork: SessionInfo = { market: "us", timeZone: "America/New_York", continuous: false, open: Date.UTC(2026, 10, 18, 14, 30), close: Date.UTC(2026, 10, 18, 21, 0) };
  const fx: SessionInfo = { market: "fx", timeZone: "UTC", continuous: true, open: 1_000, close: 2_000 };
  const midSession = Date.UTC(2026, 10, 18, 17, 0);

  it("has nothing to say before the session is known, or for the live five-minute chart", () => {
    expect(sessionView("1d", undefined, midSession)).to.deep.equal({});
    expect(sessionView("5m", newYork, midSession)).to.deep.equal({});
  });

  it("writes a one-day chart on the market's clock, and has its axis reach from the open to the close while the day is still going", () => {
    expect(sessionView("1d", newYork, midSession)).to.deep.equal({ timeZone: "America/New_York", domain: { start: newYork.open, end: newYork.close } });
  });

  it("lets the axis run on past the close once the data does (after hours, or at a weekend)", () => {
    const evening = newYork.close + 3 * 3_600_000;
    expect(sessionView("1d", newYork, evening).domain).to.deep.equal({ start: newYork.open, end: evening });
  });

  it("has no fixed axis for a market that trades round the clock, only its time zone", () => {
    expect(sessionView("1d", fx, midSession)).to.deep.equal({ timeZone: "UTC" });
  });

  it("writes the longer ranges on the market's clock too, with no fixed axis", () => {
    for (const range of ["1m", "1y", "ytd", "max"] as const) expect(sessionView(range, newYork, midSession), range).to.deep.equal({ timeZone: "America/New_York" });
  });
});
