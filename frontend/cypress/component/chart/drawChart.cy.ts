import { drawChart, nearestIndex, readChartColors, type ChartView } from "../../../src/chart/drawChart";
import { TEST_COLORS, countColor, countInk, makeCanvas, series } from "../../support/canvas";

const GREEN: [number, number, number] = [0, 255, 0];
const MAGENTA: [number, number, number] = [255, 0, 255];
const BLUE: [number, number, number] = [0, 0, 255];
const BLACK: [number, number, number] = [0, 0, 0];
const view = (overrides: Partial<ChartView> = {}): ChartView => ({
  width: 400,
  height: 200,
  dpr: 1,
  decimals: 2,
  locale: "en-US",
  hoverX: null,
  prevClose: 0,
  prevCloseLabel: "Prev close",
  ...overrides,
});
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
  it("draws the line in the up color and the grid in the grid color", () => {
    const { canvas, context } = makeCanvas(400, 200);
    drawChart(context, rising, view(), TEST_COLORS); // rising, with no previous close: up against where it started
    expect(countColor(canvas, GREEN), "line pixels").to.be.greaterThan(100);
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
    const first = countColor(canvas, GREEN);
    drawChart(context, rising, view(), TEST_COLORS);
    expect(countColor(canvas, GREEN)).to.equal(first);
  });

  it("draws a flat price as a line in the middle of the plot, not a divide-by-zero blank", () => {
    const { canvas, context } = makeCanvas(400, 200);
    drawChart(context, series(30, () => 30000), view(), TEST_COLORS);
    expect(countColor(canvas, GREEN)).to.be.greaterThan(100);
  });

  it("uses the device pixel ratio: the same chart drawn at 2x has more pixels", () => {
    const one = makeCanvas(400, 200);
    drawChart(one.context, rising, view(), TEST_COLORS);
    const two = makeCanvas(800, 400);
    drawChart(two.context, rising, view({ dpr: 2 }), TEST_COLORS);
    expect(countColor(two.canvas, GREEN)).to.be.greaterThan(countColor(one.canvas, GREEN) * 2);
  });

  it("works from a typed array, as the worker sends", () => {
    const { canvas, context } = makeCanvas(400, 200);
    drawChart(context, Float64Array.from(rising), view(), TEST_COLORS);
    expect(countColor(canvas, GREEN)).to.be.greaterThan(100);
  });

  describe("its color: green or red against the previous close, like the price beside it", () => {
    it("is green when the newest price is above the previous close", () => {
      const { canvas, context } = makeCanvas(400, 200);
      drawChart(context, rising, view({ prevClose: 29000 }), TEST_COLORS); // newest 30590, previous close 290.00
      expect(countColor(canvas, GREEN)).to.be.greaterThan(100);
      expect(countColor(canvas, MAGENTA)).to.equal(0);
    });

    it("is red when the newest price is below the previous close, even though it rose during the period", () => {
      const { canvas, context } = makeCanvas(400, 200);
      drawChart(context, rising, view({ prevClose: 32000 }), TEST_COLORS); // rising, but still under the previous close
      expect(countColor(canvas, MAGENTA)).to.be.greaterThan(100);
      expect(countColor(canvas, GREEN)).to.equal(0);
    });

    it("is green when the price equals the previous close", () => {
      const { canvas, context } = makeCanvas(400, 200);
      drawChart(context, [0, 30000, 60_000, 30000], view({ prevClose: 30000 }), TEST_COLORS);
      expect(countColor(canvas, GREEN)).to.be.greaterThan(50);
    });
  });

  describe("the dotted line at the previous close", () => {
    it("is drawn across the chart in the muted color", () => {
      const without = makeCanvas(400, 200);
      drawChart(without.context, rising, view({ prevClose: 0 }), TEST_COLORS);
      const with_ = makeCanvas(400, 200);
      drawChart(with_.context, rising, view({ prevClose: 30300 }), TEST_COLORS);
      expect(countColor(with_.canvas, BLACK), "muted (and text) pixels").to.be.greaterThan(countColor(without.canvas, BLACK));
    });

    it("is dotted: it has gaps in it, so it is not a solid line", () => {
      const { canvas, context } = makeCanvas(400, 200);
      drawChart(context, rising, view({ prevClose: 30300 }), TEST_COLORS); // the muted color is black, and only the dotted line is black in the middle of the plot
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      const dark = (x: number, y: number) => data[(y * canvas.width + x) * 4]! === 0 && data[(y * canvas.width + x) * 4 + 1]! === 0 && data[(y * canvas.width + x) * 4 + 2]! === 0 && data[(y * canvas.width + x) * 4 + 3]! > 200;
      let bestRow = 0;
      let bestInk = 0;
      for (let y = 0; y < canvas.height; y++) {
        let ink = 0;
        for (let x = 72; x < 250; x++) if (dark(x, y)) ink++; // right of the price labels, left of the "Prev close" words
        if (ink > bestInk) {
          bestInk = ink;
          bestRow = y;
        }
      }
      let runs = 0;
      let inInk = false;
      for (let x = 72; x < 250; x++) {
        const now = dark(x, bestRow);
        if (now && !inInk) runs++;
        inInk = now;
      }
      expect(runs, "separate dashes along the line").to.be.greaterThan(10);
      expect(bestInk, "but not a solid line").to.be.lessThan(250 - 72);
    });

    it("is not drawn when the previous close is not known", () => {
      const a = makeCanvas(400, 200);
      drawChart(a.context, rising, view({ prevClose: 0 }), TEST_COLORS);
      const b = makeCanvas(400, 200);
      drawChart(b.context, rising, view({ prevClose: 0, prevCloseLabel: "Something else" }), TEST_COLORS);
      expect(countInk(a.canvas)).to.equal(countInk(b.canvas)); // no line, so no label either
    });

    it("keeps the price axis wide enough to include the previous close, however far the price has moved from it", () => {
      const near = makeCanvas(400, 200);
      drawChart(near.context, rising, view({ prevClose: 30300 }), TEST_COLORS);
      const far = makeCanvas(400, 200);
      drawChart(far.context, rising, view({ prevClose: 90000 }), TEST_COLORS); // far above every price
      // With the previous close far away, the line is squeezed into the bottom of the chart: much less of the plot is used.
      const used = (canvas: HTMLCanvasElement) => {
        const { data } = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height);
        const rows = new Set<number>();
        for (let i = 0; i < data.length; i += 4) if (data[i + 1]! > 200 && data[i]! < 40 && data[i + 2]! < 40 && data[i + 3]! > 200) rows.add(Math.floor(i / 4 / canvas.width));
        return rows.size;
      };
      expect(used(far.canvas)).to.be.lessThan(used(near.canvas) / 2);
    });
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

describe("drawChart: ranges", () => {
  // The words the chart writes, in order, by listening to the canvas as it draws them.
  const textsOf = (data: number[], overrides: Partial<ChartView> = {}) => {
    const { context } = makeCanvas(400, 200);
    const texts: string[] = [];
    const fillText = context.fillText.bind(context);
    context.fillText = (text: string, x: number, y: number) => {
      texts.push(text);
      fillText(text, x, y);
    };
    drawChart(context, data, view(overrides), TEST_COLORS);
    return texts;
  };
  const DAY = 86_400_000;
  const oneYear = series(60, (i) => 30000 + i * 10).map((value, i) => (i % 2 === 0 ? Date.UTC(2026, 0, 1) + (i / 2) * 6 * DAY : value));

  it("writes the time axis as times for the five-minute range, and as dates for a longer one", () => {
    const fiveMinutes = textsOf(rising, { range: "5m" });
    const year = textsOf(oneYear, { range: "1y" });
    expect(fiveMinutes.filter((text) => /^\d{2}:\d{2}:\d{2}/.test(text))).to.have.length(4);
    expect(year.filter((text) => /^[A-Z][a-z]{2} 20\d\d$/.test(text))).to.have.length(4);
  });

  it("writes the axis dates in the language's own style", () => {
    expect(textsOf(oneYear, { range: "1y", locale: "en-GB" }).some((text) => /^[A-Z][a-z]{2} 2026$/.test(text))).to.equal(true);
    expect(textsOf(oneYear, { range: "1y", locale: "ja-JP" }).some((text) => /^2026年\d{1,2}月$/.test(text))).to.equal(true);
  });

  it("writes only years on the longest range", () => {
    const max = textsOf(oneYear, { range: "max" });
    expect(max.filter((text) => /^20\d\d$/.test(text)).length).to.be.greaterThan(1);
  });

  it("draws the dotted line with the words it is given, at the baseline", () => {
    const texts = textsOf(oneYear, { range: "1m", prevClose: 30200, prevCloseLabel: "Start" });
    expect(texts.some((text) => text.startsWith("Start 302.00"))).to.equal(true);
  });

  it("treats a missing range as the five-minute range", () => {
    expect(textsOf(rising)).to.deep.equal(textsOf(rising, { range: "5m" }));
  });

  it("colours a longer chart by its own start, not by the previous close", () => {
    const { canvas, context } = makeCanvas(400, 200);
    drawChart(context, rising, view({ range: "1m", prevClose: rising[1]! }), TEST_COLORS); // the baseline passed is where it starts: up
    expect(countColor(canvas, GREEN)).to.be.greaterThan(100);
    const down = makeCanvas(400, 200);
    drawChart(down.context, rising, view({ range: "1m", prevClose: 99_999 }), TEST_COLORS); // a baseline above the end: down
    expect(countColor(down.canvas, MAGENTA)).to.be.greaterThan(100);
  });
});

