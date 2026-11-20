import { DEFAULT_REFRESH_SECONDS, MAX_REFRESH_SECONDS, parseRefreshSeconds } from "../../../src/optimized/refresh";

describe("parseRefreshSeconds", () => {
  it("accepts whole and fractional seconds, including 0", () => {
    expect(parseRefreshSeconds("3")).to.equal(3);
    expect(parseRefreshSeconds("0.5")).to.equal(0.5);
    expect(parseRefreshSeconds("0")).to.equal(0);
  });

  it("accepts the largest allowed value and nothing above it", () => {
    expect(parseRefreshSeconds(String(MAX_REFRESH_SECONDS))).to.equal(MAX_REFRESH_SECONDS);
    expect(parseRefreshSeconds(String(MAX_REFRESH_SECONDS + 1))).to.equal(null);
    expect(parseRefreshSeconds("999")).to.equal(null);
  });

  it("rejects an empty box, spaces, text and negative numbers", () => {
    for (const text of ["", "   ", "abc", "-1", "NaN", "Infinity"]) expect(parseRefreshSeconds(text), text).to.equal(null);
  });

  it("starts at 1.5 seconds", () => {
    expect(DEFAULT_REFRESH_SECONDS).to.equal(1.5);
  });
});
