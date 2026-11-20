import { drawChart, nearestIndex, readChartColors, type ChartView } from "../../../src/chart/drawChart";
import { TEST_COLORS, countColor, countInk, makeCanvas, series } from "../../support/canvas";

const RED: [number, number, number] = [255, 0, 0];
const BLUE: [number, number, number] = [0, 0, 255];
const view = (overrides: Partial<ChartView> = {}): ChartView => ({ width: 400, height: 200, dpr: 1, decimals: 2, locale: "en-US", hoverX: null, ...overrides });
const rising = series(60, (i) => 30000 + i * 10);

describe("nearestIndex", () => {
  const data = [0, 1, 1000, 2, 2000, 3, 3000, 4]; // four points one second apart

  it("finds the point at exactly that time", () => {
    expect(nearestIndex(data, 2000)).to.equal(2);
  });

  it("finds the closest point between two", () => {
    expect(nearestIndex(data, 1400)).to.equal(1);
    expect(nearestIndex(data, 1600)).to.equal(2);
  });

  it("prefers the earlier point when exactly between two", () => {
    expect(nearestIndex(data, 1500)).to.equal(1);
  });

  it("clamps to the first and last points", () => {
    expect(nearestIndex(data, -5000)).to.equal(0);
    expect(nearestIndex(data, 99_000)).to.equal(3);
  });

  it("works with a single point", () => {
    expect(nearestIndex([5, 7], 123)).to.equal(0);
  });
});

describe("drawChart", () => {
  it("draws the line in the line color and the grid in the grid color", () => {
    const { canvas, context } = makeCanvas(400, 200);
    drawChart(context, rising, view(), TEST_COLORS);
    expect(countColor(canvas, RED), "line pixels").to.be.greaterThan(100);
    expect(countColor(canvas, BLUE), "grid pixels").to.be.greaterThan(100);
  });

  it("draws nothing for fewer than two points", () => {
    const { canvas, context } = makeCanvas(400, 200);
    drawChart(context, [1000, 30000], view(), TEST_COLORS);
    expect(countInk(canvas)).to.equal(0);
    drawChart(context, [], view(), TEST_COLORS);
    expect(countInk(canvas)).to.equal(0);
  });

  it("draws nothing when the canvas is too small to hold the axes", () => {
    const { canvas, context } = makeCanvas(60, 200);
    drawChart(context, rising, view({ width: 60 }), TEST_COLORS);
    expect(countInk(canvas)).to.equal(0);
  });

  it("clears what was there before, so each drawing replaces the last", () => {
    const { canvas, context } = makeCanvas(400, 200);
    drawChart(context, rising, view(), TEST_COLORS);
    const first = countColor(canvas, RED);
    drawChart(context, rising, view(), TEST_COLORS);
    expect(countColor(canvas, RED)).to.equal(first);
  });

  it("draws a flat price as a line in the middle of the plot, not a divide-by-zero blank", () => {
    const { canvas, context } = makeCanvas(400, 200);
    drawChart(context, series(30, () => 30000), view(), TEST_COLORS);
    expect(countColor(canvas, RED)).to.be.greaterThan(100);
  });

  it("uses the device pixel ratio: the same chart drawn at 2x has more pixels", () => {
    const one = makeCanvas(400, 200);
    drawChart(one.context, rising, view(), TEST_COLORS);
    const two = makeCanvas(800, 400);
    drawChart(two.context, rising, view({ dpr: 2 }), TEST_COLORS);
    expect(countColor(two.canvas, RED)).to.be.greaterThan(countColor(one.canvas, RED) * 2);
  });

  it("works from a typed array, as the worker sends", () => {
    const { canvas, context } = makeCanvas(400, 200);
    drawChart(context, Float64Array.from(rising), view(), TEST_COLORS);
    expect(countColor(canvas, RED)).to.be.greaterThan(100);
  });

  describe("the crosshair", () => {
    it("adds a crosshair when the pointer is over the plot", () => {
      const without = makeCanvas(400, 200);
      drawChart(without.context, rising, view(), TEST_COLORS);
      const hovering = makeCanvas(400, 200);
      drawChart(hovering.context, rising, view({ hoverX: 200 }), TEST_COLORS);
      expect(countInk(hovering.canvas)).to.be.greaterThan(countInk(without.canvas));
    });

    it("draws no crosshair when the pointer is over the price labels, left of the plot", () => {
      const without = makeCanvas(400, 200);
      drawChart(without.context, rising, view(), TEST_COLORS);
      const hovering = makeCanvas(400, 200);
      drawChart(hovering.context, rising, view({ hoverX: 10 }), TEST_COLORS);
      expect(countInk(hovering.canvas)).to.equal(countInk(without.canvas));
    });

    it("draws no crosshair past the right edge of the plot", () => {
      const without = makeCanvas(400, 200);
      drawChart(without.context, rising, view(), TEST_COLORS);
      const hovering = makeCanvas(400, 200);
      drawChart(hovering.context, rising, view({ hoverX: 399 }), TEST_COLORS);
      expect(countInk(hovering.canvas)).to.equal(countInk(without.canvas));
    });

    it("keeps its label inside the plot near the right edge", () => {
      const { canvas, context } = makeCanvas(400, 200);
      drawChart(context, rising, view({ hoverX: 380 }), TEST_COLORS);
      expect(countInk(canvas)).to.be.greaterThan(0);
    });
  });
});

describe("readChartColors", () => {
  it("reads the colors from the design tokens, so a chart follows the theme", () => {
    document.documentElement.style.setProperty("--color-accent", "#123456");
    document.documentElement.style.setProperty("--color-up", "#00ff00");
    const colors = readChartColors();
    expect(colors.line).to.equal("#123456");
    expect(colors.up).to.equal("#00ff00");
    for (const key of ["grid", "text", "muted", "background", "down"] as const) expect(colors[key], key).to.be.a("string");
    document.documentElement.style.removeProperty("--color-accent");
    document.documentElement.style.removeProperty("--color-up");
  });
});
