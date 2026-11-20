/**
 * The data behind a price chart, as one flat list of numbers: [time, price, time, price, ...], oldest first. A flat
 * list is the cheapest shape to copy between the worker and the page, and to draw from. Prices are wire integers.
 */

/** Time between points. The server keeps history at this spacing, and live prices are folded into the same spacing. */
export const HISTORY_INTERVAL_MS = 1000;

/** How many points a chart holds: the last five minutes. */
export const HISTORY_CAPACITY = 300;

/** Turn the server's list of [time, price] pairs into the flat list. */
export const flatten = (points: [number, number][]): number[] => points.flat();

/**
 * Fold one live price into the data, in place. If the newest point is less than an interval old, the price replaces
 * it (so each point ends up holding the last price of its second); otherwise it becomes a new point and the oldest
 * is dropped once the chart is full. A price older than the newest point is ignored.
 */
export function appendTick(data: number[], time: number, price: number, capacity = HISTORY_CAPACITY): void {
  const newest = data.length - 2;
  if (newest >= 0) {
    const newestTime = data[newest]!;
    if (time < newestTime) return;
    if (time - newestTime < HISTORY_INTERVAL_MS) {
      data[newest + 1] = price;
      return;
    }
  }
  data.push(time, price);
  if (data.length > capacity * 2) data.splice(0, data.length - capacity * 2);
}

export interface SeriesSummary {
  count: number;
  last: number;
  high: number;
  low: number;
  minutes: number; // how much time the data covers, rounded, at least 1
}

/** Last, highest and lowest price, and how much time the data covers; null when there is no data. */
export function summarise(data: ArrayLike<number>): SeriesSummary | null {
  const count = data.length / 2;
  if (count < 1) return null;
  let high = -Infinity;
  let low = Infinity;
  for (let i = 1; i < data.length; i += 2) {
    high = Math.max(high, data[i]!);
    low = Math.min(low, data[i]!);
  }
  const span = data[data.length - 2]! - data[0]!;
  return { count, last: data[data.length - 1]!, high, low, minutes: Math.max(1, Math.round(span / 60_000)) };
}
