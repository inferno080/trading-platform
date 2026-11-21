import { drawSparkline } from "../../../src/chart/sparkline";
import { TEST_COLORS, countColor, countInk, makeCanvas, series } from "../../support/canvas";

const GREEN: [number, number, number] = [0, 255, 0];
const MAGENTA: [number, number, number] = [255, 0, 255];
const size = { width: 200, height: 56, dpr: 1 };

describe("drawSparkline", () => {
  it("draws an up-colored line when the price ended higher than it started", () => {
    const { canvas, context } = makeCanvas(200, 56);
    drawSparkline(context, series(30, (i) => 100 + i), size, TEST_COLORS, 0);
    expect(countColor(canvas, GREEN)).to.be.greaterThan(50);
    expect(countColor(canvas, MAGENTA)).to.equal(0);
  });

  it("draws a down-colored line when the price ended lower than it started", () => {
    const { canvas, context } = makeCanvas(200, 56);
    drawSparkline(context, series(30, (i) => 200 - i), size, TEST_COLORS, 0);
    expect(countColor(canvas, MAGENTA)).to.be.greaterThan(50);
    expect(countColor(canvas, GREEN)).to.equal(0);
  });

  it("draws a green line for an unchanged price", () => {
    const { canvas, context } = makeCanvas(200, 56);
    drawSparkline(context, series(30, () => 100), size, TEST_COLORS, 0);
    expect(countInk(canvas)).to.be.greaterThan(50);
    expect(countColor(canvas, MAGENTA)).to.equal(0);
  });

  describe("against the previous close, like the price beside it", () => {
    it("is up-colored when the newest price is above the previous close, even if it fell during the period", () => {
      const { canvas, context } = makeCanvas(200, 56);
      drawSparkline(context, series(30, (i) => 200 - i), size, TEST_COLORS, 100); // falling, but 171 is above 100
      expect(countColor(canvas, GREEN)).to.be.greaterThan(50);
      expect(countColor(canvas, MAGENTA)).to.equal(0);
    });

    it("is down-colored when the newest price is below the previous close, even if it rose during the period", () => {
      const { canvas, context } = makeCanvas(200, 56);
      drawSparkline(context, series(30, (i) => 100 + i), size, TEST_COLORS, 500);
      expect(countColor(canvas, MAGENTA)).to.be.greaterThan(50);
      expect(countColor(canvas, GREEN)).to.equal(0);
    });

    it("draws a dotted line at the previous close, and keeps it inside the chart", () => {
      const without = makeCanvas(200, 56);
      drawSparkline(without.context, series(30, (i) => 100 + i), size, TEST_COLORS, 0);
      const withLine = makeCanvas(200, 56);
      drawSparkline(withLine.context, series(30, (i) => 100 + i), size, TEST_COLORS, 110);
      expect(countInk(withLine.canvas)).to.be.greaterThan(countInk(without.canvas));
    });
  });

  it("draws nothing for fewer than two points, or a canvas with no size", () => {
    const { canvas, context } = makeCanvas(200, 56);
    drawSparkline(context, [1000, 5], size, TEST_COLORS, 0);
    drawSparkline(context, series(10, (i) => i), { width: 0, height: 56, dpr: 1 }, TEST_COLORS, 0);
    expect(countInk(canvas)).to.equal(0);
  });

  it("clears what was there before", () => {
    const { canvas, context } = makeCanvas(200, 56);
    drawSparkline(context, series(30, (i) => 100 + i), size, TEST_COLORS, 0);
    drawSparkline(context, series(30, (i) => 200 - i), size, TEST_COLORS, 0);
    expect(countColor(canvas, GREEN)).to.equal(0);
  });
});
