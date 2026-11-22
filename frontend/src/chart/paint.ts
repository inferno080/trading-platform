import { drawChart, type ChartColors, type ChartView } from "./drawChart";
import { baselineFor, baselineIsPrevClose, sessionView, type HistoryRange } from "./range";
import type { SessionInfo } from "../protocol/messages";

type Translate = (id: string) => string;

interface PaintOptions {
  size: Pick<ChartView, "width" | "height" | "dpr">;
  decimals: number;
  locale: string;
  range: HistoryRange;
  /** The open symbol's market session, once known: the clock the times are written on, and for a day how far the axis reaches. */
  session: SessionInfo | undefined;
  /** The instrument's previous close, as a wire integer: what the short ranges are measured against. */
  prevClose: number;
  hoverX: number | null;
  t: Translate;
  colors: ChartColors;
}

/**
 * Paint a chart of a range for an instrument: the same for both tabs, which only differ in what decides when to call it.
 * With no data (another range was chosen and its chart has not arrived) it clears the canvas, so the skeleton shows and not
 * the last range, and returns false; otherwise it draws and returns true.
 */
export function paintChart(context: CanvasRenderingContext2D, data: ArrayLike<number> | undefined, options: PaintOptions): boolean {
  const { size, decimals, locale, range, session, prevClose, hoverX, t, colors } = options;
  if (!data) {
    context.clearRect(0, 0, size.width, size.height);
    return false;
  }
  const view: ChartView = {
    ...size,
    decimals,
    locale,
    range,
    ...sessionView(range, session, data[data.length - 2]!),
    hoverX,
    prevClose: baselineFor(range, data, prevClose), // the previous close for the short ranges, where the range starts for the longer ones
    prevCloseLabel: t(baselineIsPrevClose(range) ? "table.prevClose" : "chart.rangeStart"),
  };
  drawChart(context, data, view, colors);
  return true;
}
