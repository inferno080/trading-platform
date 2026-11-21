import { decimalFormatter, percentFormatter, signedDecimalFormatter } from "../lib/format";

/**
 * Whether a chart's line is green (up) or red (down): the newest price against the previous close, the same comparison
 * as the "Today" move shown beside it, so the two always agree. With no previous close it falls back to the start of the data.
 */
export function isUp(data: ArrayLike<number>, prevClose: number): boolean {
  const last = data[data.length - 1]!;
  return last >= (prevClose === 0 ? data[1]! : prevClose);
}

/** The current price and how it has moved since the previous close, ready to show. */
export interface PriceSummary {
  price: string; // for example "912.76"
  direction: -1 | 0 | 1; // which way it is against the previous close
  percent: string | null; // for example "+0.62%"
  change: string | null; // for example "+5.65"
}

/**
 * The newest price in a chart's data, and its change since the previous close ("Today"): the percentage and the amount.
 * Null while there is no data. With no previous close there is nothing to compare with, so only the price is given.
 */
export function priceSummary(data: ArrayLike<number> | undefined, decimals: number, prevClose: number, locale: string): PriceSummary | null {
  if (!data || data.length < 2) return null;
  const last = data[data.length - 1]!;
  const scale = 10 ** decimals;
  const price = decimalFormatter(locale, decimals).format(last / scale);
  if (prevClose === 0) return { price, direction: 0, percent: null, change: null };

  const difference = last - prevClose;
  let direction: -1 | 0 | 1 = 0;
  if (difference > 0) direction = 1;
  else if (difference < 0) direction = -1;
  return {
    price,
    direction,
    percent: percentFormatter(locale).format(last / prevClose - 1),
    change: signedDecimalFormatter(locale, decimals).format(difference / scale),
  };
}
