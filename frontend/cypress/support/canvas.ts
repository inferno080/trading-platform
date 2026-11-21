import type { ChartColors } from "../../src/chart/drawChart";

/** A canvas of the given size, not on the page, with its drawing context. */
export function makeCanvas(width: number, height: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return { canvas, context: canvas.getContext("2d", { willReadFrequently: true })! };
}

/** Pure colors, easy to tell apart when counting pixels. */
export const TEST_COLORS: ChartColors = {
  line: "rgb(255, 128, 0)",
  grid: "rgb(0, 0, 255)",
  text: "rgb(0, 0, 0)",
  muted: "rgb(0, 0, 0)",
  background: "rgb(255, 255, 255)",
  up: "rgb(0, 255, 0)",
  down: "rgb(255, 0, 255)",
};

/** How many pixels are (nearly) this color, ignoring anti-aliased edges. */
export function countColor(canvas: HTMLCanvasElement, [red, green, blue]: [number, number, number]): number {
  const { data } = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height);
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! > 200 && Math.abs(data[i]! - red) < 40 && Math.abs(data[i + 1]! - green) < 40 && Math.abs(data[i + 2]! - blue) < 40) count++;
  }
  return count;
}

/** How many pixels have any ink at all (are not fully transparent). */
export function countInk(canvas: HTMLCanvasElement): number {
  const { data } = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height);
  let count = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) count++;
  return count;
}

/** A flat [time, price, ...] list of `count` points one second apart, with prices from `priceAt`. */
export function series(count: number, priceAt: (index: number) => number, start = 1_000_000): number[] {
  return Array.from({ length: count }, (_, i) => [start + i * 1000, priceAt(i)]).flat();
}
