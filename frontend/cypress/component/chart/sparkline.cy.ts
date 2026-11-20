import { drawSparkline, sparkCaption } from "../../../src/chart/sparkline";
import { TEST_COLORS, countColor, countInk, makeCanvas, series } from "../../support/canvas";

const GREEN: [number, number, number] = [0, 255, 0];
const RED: [number, number, number] = [255, 0, 0];
const size = { width: 200, height: 56, dpr: 1 };

describe("drawSparkline", () => {
  it("draws a green line when the price ended higher than it started", () => {
    const { canvas, context } = makeCanvas(200, 56);
    drawSparkline(context, series(30, (i) => 100 + i), size, TEST_COLORS);
    expect(countColor(canvas, GREEN)).to.be.greaterThan(50);
    expect(countColor(canvas, RED)).to.equal(0);
  });

  it("draws a red line when the price ended lower than it started", () => {
    const { canvas, context } = makeCanvas(200, 56);
    drawSparkline(context, series(30, (i) => 200 - i), size, TEST_COLORS);
    expect(countColor(canvas, RED)).to.be.greaterThan(50);
    expect(countColor(canvas, GREEN)).to.equal(0);
  });

  it("draws a green line for an unchanged price", () => {
    const { canvas, context } = makeCanvas(200, 56);
    drawSparkline(context, series(30, () => 100), size, TEST_COLORS);
    expect(countInk(canvas)).to.be.greaterThan(50);
    expect(countColor(canvas, RED)).to.equal(0);
  });

  it("draws nothing for fewer than two points, or a canvas with no size", () => {
    const { canvas, context } = makeCanvas(200, 56);
    drawSparkline(context, [1000, 5], size, TEST_COLORS);
    drawSparkline(context, series(10, (i) => i), { width: 0, height: 56, dpr: 1 }, TEST_COLORS);
    expect(countInk(canvas)).to.equal(0);
  });

  it("clears what was there before", () => {
    const { canvas, context } = makeCanvas(200, 56);
    drawSparkline(context, series(30, (i) => 100 + i), size, TEST_COLORS);
    drawSparkline(context, series(30, (i) => 200 - i), size, TEST_COLORS);
    expect(countColor(canvas, GREEN)).to.equal(0);
  });
});

describe("sparkCaption", () => {
  it("is null with no data or fewer than two points", () => {
    expect(sparkCaption(undefined, 2, "en-US")).to.equal(null);
    expect(sparkCaption([], 2, "en-US")).to.equal(null);
    expect(sparkCaption([1000, 100], 2, "en-US")).to.equal(null);
  });

  it("gives the newest price in the instrument's decimals, an up arrow and the percentage moved", () => {
    const caption = sparkCaption([0, 29800, 1000, 29920], 2, "en-US");
    expect(caption).to.deep.equal({ text: "299.20  ▲ +0.40%", direction: 1 });
  });

  it("gives a down arrow and a negative percentage when the price fell", () => {
    const caption = sparkCaption([0, 29800, 1000, 29680], 2, "en-US");
    expect(caption?.direction).to.equal(-1);
    expect(caption?.text).to.match(/^296\.80 {2}▼ [-−]0\.40%$/);
  });

  it("has no arrow when the price is unchanged", () => {
    const caption = sparkCaption([0, 29800, 1000, 29800], 2, "en-US");
    expect(caption).to.deep.equal({ text: "298.00  0.00%", direction: 0 });
  });

  it("uses the instrument's own decimals, and the locale", () => {
    expect(sparkCaption([0, 150000, 1000, 150125], 3, "en-US")!.text).to.contain("150.125");
    expect(sparkCaption([0, 47000, 1000, 47213], 0, "en-US")!.text).to.contain("47,213");
    expect(sparkCaption([0, 123400, 1000, 123456], 2, "de-DE")!.text).to.contain("1.234,56");
  });

  it("leaves out the percentage when the first price is zero", () => {
    expect(sparkCaption([0, 0, 1000, 5], 0, "en-US")!.text).to.equal("5  ▲");
  });
});
