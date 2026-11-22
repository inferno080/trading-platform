import { decimalFormatter } from "../lib/format";
import type { HistoryRange } from "../protocol/messages";
import { summarise } from "./series";

type Translate = (id: string, values?: Record<string, string | number>) => string;

/** The sentence that describes a chart in words, for assistive technology: last, high and low over the period. */
export function chartLabel(t: Translate, symbol: string, data: ArrayLike<number> | null, decimals: number, locale: string, range: HistoryRange = "5m"): string {
  const summary = data ? summarise(data) : null;
  if (!summary) return symbol;
  const price = decimalFormatter(locale, decimals);
  const scale = 10 ** decimals;
  return t(range === "5m" ? "chart.summary" : `chart.summary.${range}`, {
    symbol,
    last: price.format(summary.last / scale),
    high: price.format(summary.high / scale),
    low: price.format(summary.low / scale),
    minutes: summary.minutes,
  });
}
