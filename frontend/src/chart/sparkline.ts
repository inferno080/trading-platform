import type { ChartColors } from "./drawChart";
import { isUp } from "./price";

/** Draw a mini chart: just the line and a dot on the newest price, green if the price is up on the day and red if down. */
export function drawSparkline(
  ctx: CanvasRenderingContext2D,
  data: ArrayLike<number>,
  view: { width: number; height: number; dpr: number },
  colors: ChartColors,
  prevClose: number, // the previous close as a wire integer (0: not known), which decides the color
): void {
  const { width, height, dpr } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (data.length < 4 || width <= 0 || height <= 0) return;
  let low = prevClose > 0 ? prevClose : Infinity; // the previous close is counted, so its dotted line is always inside
  let high = prevClose > 0 ? prevClose : -Infinity;
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

  if (prevClose > 0) {
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(inset, Math.round(y(prevClose)) + 0.5);
    ctx.lineTo(width - inset, Math.round(y(prevClose)) + 0.5);
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = isUp(data, prevClose) ? colors.up : colors.down;
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
