import { collector, percentile } from "../../../src/hud/collector";

describe("percentile", () => {
  const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it("picks the value at the requested position", () => {
    expect(percentile(sorted, 0)).to.equal(1);
    expect(percentile(sorted, 0.5)).to.equal(6);
    expect(percentile(sorted, 0.99)).to.equal(10);
  });

  it("returns 0 for an empty list", () => {
    expect(percentile([], 0.5)).to.equal(0);
  });
});

describe("collector", () => {
  beforeEach(() => collector.reset());

  it("accumulates messages, updates and latencies until drained", () => {
    collector.onDelta(10, 5);
    collector.onDelta(5, 9);
    expect(collector.drain()).to.deep.equal({ messages: 2, updates: 15, latencies: [5, 9], gaps: 0 });
  });

  it("starts a fresh window after draining", () => {
    collector.onDelta(10, 5);
    collector.drain();
    expect(collector.drain()).to.deep.equal({ messages: 0, updates: 0, latencies: [], gaps: 0 });
  });

  it("counts gaps per window and in total", () => {
    collector.onGap();
    collector.onGap();
    expect(collector.drain().gaps).to.equal(2);
    expect(collector.totalGaps).to.equal(2);

    collector.onGap();
    expect(collector.drain().gaps).to.equal(1);
    expect(collector.totalGaps).to.equal(3);
  });

  it("forgets everything on reset, including the running total", () => {
    collector.onDelta(10, 5);
    collector.onGap();
    collector.reset();
    expect(collector.drain()).to.deep.equal({ messages: 0, updates: 0, latencies: [], gaps: 0 });
    expect(collector.totalGaps).to.equal(0);
  });
});
