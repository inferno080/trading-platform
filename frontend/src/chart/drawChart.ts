import { decimalFormatter } from "../lib/format";

/** The colors a chart is drawn in, read from the design tokens so it follows the theme. */
export interface ChartColors {
  line: string;
  grid: string;
  text: string;
  muted: string;
  background: string;
  up: string;
  down: string;
}

export interface ChartView {
  width: number; // CSS pixels
  height: number;
  dpr: number; // device pixels per CSS pixel
  decimals: number; // of the instrument, for the price labels
  locale: string;
  hoverX: number | null; // pointer position in CSS pixels across the canvas, or null when it is not over it
}

const PAD = { left: 68, right: 14, top: 14, bottom: 26 };
const FONT = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const PRICE_LINES = 5;
const TIME_LABELS = 4;
const RANGE_PADDING = 0.08; // empty space above and below the line, as a share of its range

export function readChartColors(): ChartColors {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string) => styles.getPropertyValue(name).trim();
  return {
    line: token("--color-accent"),
    grid: token("--color-border"),
    text: token("--color-text"),
    muted: token("--color-text-muted"),
    background: token("--color-bg"),
    up: token("--color-up"),
    down: token("--color-down"),
  };
}

const timeFormats = new Map<string, Intl.DateTimeFormat>();
const timeFormat = (locale: string): Intl.DateTimeFormat => {
  let format = timeFormats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    timeFormats.set(locale, format);
  }
  return format;
};

/** Index of the point whose time is closest to `time` (binary search over the times, which are in order). */
export function nearestIndex(data: ArrayLike<number>, time: number): number {
  let low = 0;
  let high = data.length / 2 - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (data[middle * 2]! < time) low = middle + 1;
    else high = middle;
  }
  if (low > 0 && Math.abs(data[(low - 1) * 2]! - time) <= Math.abs(data[low * 2]! - time)) return low - 1;
  return low;
}

/** Lowest and highest price, widened a little so the line does not touch the edges (and never flat). */
function priceRange(data: ArrayLike<number>): [number, number] {
  let low = Infinity;
  let high = -Infinity;
  for (let i = 1; i < data.length; i += 2) {
    low = Math.min(low, data[i]!);
    high = Math.max(high, data[i]!);
  }
  if (low === high) return [low - 1, high + 1];
  const pad = (high - low) * RANGE_PADDING;
  return [low - pad, high + pad];
}

interface Plot {
  left: number;
  top: number;
  width: number;
  height: number;
  low: number;
  high: number;
  start: number; // time of the first point
  end: number; // time of the last point
}

const xOf = (plot: Plot, time: number): number => plot.left + ((time - plot.start) / (plot.end - plot.start || 1)) * plot.width;
const yOf = (plot: Plot, price: number): number => plot.top + (1 - (price - plot.low) / (plot.high - plot.low)) * plot.height;

/** Where a time label sits against its tick: the end labels are pulled inward so they stay inside the canvas. */
const alignFor = (index: number): CanvasTextAlign => {
  if (index === 0) return "left";
  return index === TIME_LABELS - 1 ? "right" : "center";
};

function drawGrid(ctx: CanvasRenderingContext2D, plot: Plot, view: ChartView, colors: ChartColors): void {
  const price = decimalFormatter(view.locale, view.decimals);
  const scale = 10 ** view.decimals;
  ctx.font = FONT;
  ctx.lineWidth = 1;
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  for (let i = 0; i < PRICE_LINES; i++) {
    const value = plot.high - (i * (plot.high - plot.low)) / (PRICE_LINES - 1);
    const y = Math.round(plot.top + (i * plot.height) / (PRICE_LINES - 1)) + 0.5; // half a pixel keeps a 1px line sharp
    ctx.strokeStyle = colors.grid;
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.left + plot.width, y);
    ctx.stroke();
    ctx.fillStyle = colors.muted;
    ctx.fillText(price.format(value / scale), plot.left - 8, y);
  }
  ctx.textBaseline = "top";
  const time = timeFormat(view.locale);
  for (let i = 0; i < TIME_LABELS; i++) {
    const at = plot.start + (i * (plot.end - plot.start)) / (TIME_LABELS - 1);
    ctx.textAlign = alignFor(i);
    ctx.fillStyle = colors.muted;
    ctx.fillText(time.format(at), xOf(plot, at), plot.top + plot.height + 8);
  }
}

function drawLine(ctx: CanvasRenderingContext2D, plot: Plot, data: ArrayLike<number>, colors: ChartColors): void {
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < data.length; i += 2) {
    const x = xOf(plot, data[i]!);
    const y = yOf(plot, data[i + 1]!);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = colors.line; // a dot on the newest price
  ctx.beginPath();
  ctx.arc(xOf(plot, data[data.length - 2]!), yOf(plot, data[data.length - 1]!), 3.5, 0, Math.PI * 2);
  ctx.fill();
}

/** A vertical line at the pointer, a dot on the nearest point, and a label with its time and price. */
function drawHover(ctx: CanvasRenderingContext2D, plot: Plot, data: ArrayLike<number>, view: ChartView, colors: ChartColors): void {
  if (view.hoverX === null || view.hoverX < plot.left || view.hoverX > plot.left + plot.width) return;
  const at = plot.start + ((view.hoverX - plot.left) / plot.width) * (plot.end - plot.start);
  const index = nearestIndex(data, at);
  const time = data[index * 2]!;
  const price = data[index * 2 + 1]!;
  const x = xOf(plot, time);
  const y = yOf(plot, price);

  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(x) + 0.5, plot.top);
  ctx.lineTo(Math.round(x) + 0.5, plot.top + plot.height);
  ctx.stroke();
  ctx.fillStyle = colors.text;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();

  const label = `${timeFormat(view.locale).format(time)}  ${decimalFormatter(view.locale, view.decimals).format(price / 10 ** view.decimals)}`;
  const boxWidth = ctx.measureText(label).width + 16;
  const boxX = x + 10 + boxWidth > plot.left + plot.width ? x - 10 - boxWidth : x + 10; // flip to the left near the right edge
  ctx.fillStyle = colors.background;
  ctx.strokeStyle = colors.grid;
  ctx.fillRect(boxX, plot.top + 4, boxWidth, 22);
  ctx.strokeRect(boxX + 0.5, plot.top + 4.5, boxWidth - 1, 21);
  ctx.fillStyle = colors.text;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, boxX + 8, plot.top + 15);
}

/**
 * Draw a price chart: grid with price and time labels, the line, a dot on the newest price, and, when the pointer is
 * over it, a crosshair. `data` is the flat [time, price, ...] list. Used by both tabs; they differ only in what
 * decides when to call it.
 */
export function drawChart(ctx: CanvasRenderingContext2D, data: ArrayLike<number>, view: ChartView, colors: ChartColors): void {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.clearRect(0, 0, view.width, view.height);
  const width = view.width - PAD.left - PAD.right;
  const height = view.height - PAD.top - PAD.bottom;
  if (data.length < 4 || width <= 0 || height <= 0) return; // fewer than two points is not a line
  const [low, high] = priceRange(data);
  const plot: Plot = { left: PAD.left, top: PAD.top, width, height, low, high, start: data[0]!, end: data[data.length - 2]! };
  drawGrid(ctx, plot, view, colors);
  drawLine(ctx, plot, data, colors);
  drawHover(ctx, plot, data, view, colors);
}
