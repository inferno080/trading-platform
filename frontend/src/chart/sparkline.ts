import { decimalFormatter, percentFormatter } from "../lib/format";
import type { ChartColors } from "./drawChart";

/** Draw a mini chart: just the line and a dot on the newest price, in green if it ended up and red if it ended down. */
export function drawSparkline(
  ctx: CanvasRenderingContext2D,
  data: ArrayLike<number>,
  view: { width: number; height: number; dpr: number },
  colors: ChartColors,
): void {
  const { width, height, dpr } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (data.length < 4 || width <= 0 || height <= 0) return;
  let low = Infinity;
  let high = -Infinity;
  for (let i = 1; i < data.length; i += 2) {
    low = Math.min(low, data[i]!);
    high = Math.max(high, data[i]!);
  }
  const span = high - low || 1;
  const start = data[0]!;
  const end = data[data.length - 2]!;
  const inset = 4; // keeps the line and the dot off the edges
  const x = (time: number) => inset + ((time - start) / (end - start || 1)) * (width - 2 * inset);
  const y = (price: number) => inset + (1 - (price - low) / span) * (height - 2 * inset);

  ctx.strokeStyle = data[data.length - 1]! >= data[1]! ? colors.up : colors.down;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < data.length; i += 2) {
    if (i === 0) ctx.moveTo(x(data[i]!), y(data[i + 1]!));
    else ctx.lineTo(x(data[i]!), y(data[i + 1]!));
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x(end), y(data[data.length - 1]!), 2.5, 0, Math.PI * 2);
  ctx.fill();
}

export interface SparkCaption {
  text: string; // for example "299.20  ▲ +0.40%": the newest price, and how far it has moved over the period shown
  direction: 1 | 0 | -1;
}

/** The text that goes with a mini chart. The arrow says which way it moved, as well as the color. */
export function sparkCaption(data: ArrayLike<number> | undefined, decimals: number, locale: string): SparkCaption | null {
  if (!data || data.length < 4) return null;
  const first = data[1]!;
  const last = data[data.length - 1]!;
  const direction = last > first ? 1 : last < first ? -1 : 0; // eslint-disable-line sonarjs/no-nested-conditional
  const arrow = direction > 0 ? "▲" : direction < 0 ? "▼" : ""; // eslint-disable-line sonarjs/no-nested-conditional
  const price = decimalFormatter(locale, decimals).format(last / 10 ** decimals);
  const change = first === 0 ? "" : percentFormatter(locale).format(last / first - 1);
  return { text: `${price}  ${[arrow, change].filter(Boolean).join(" ")}`.trim(), direction };
}
