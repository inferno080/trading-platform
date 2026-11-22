import { createRng } from "./rng.js";
import type { HistoryRange } from "../protocol/messages.js";
import type { SessionInfo } from "./sessions.js";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const WEEK = 7 * DAY;
const YEAR = 365.25 * DAY;

/** The longest and shortest a made-up listing history can be: every instrument "started trading" somewhere in between. */
const MIN_LISTED_YEARS = 2;
const MAX_LISTED_YEARS = 25;

/** The yearly volatility an instrument gets: lively or calm, the same every run. */
const MIN_ANNUAL_VOL = 0.15;
const MAX_ANNUAL_VOL = 0.6;

export interface RangeInput {
  id: number;
  range: Exclude<HistoryRange, "5m">; // "5m" is the live buffer, not made up
  now: number; // epoch ms
  last: number; // the current price, as a wire integer: every series ends here
  prevClose: number; // the previous close, as a wire integer: a one-day series starts here
  tick: number; // the tick size, as a wire integer: prices are kept on the tick grid
  session: SessionInfo; // the instrument's market now: a one-day series is the session it has, from its open to now (or to its close)
}

/** A number between 0 and 1 that depends only on the instrument and on what it is used for, so it never changes. */
const unitFor = (id: number, salt: number): number => createRng(id * 7919 + salt * 104729 + 1).next();

/** The yearly volatility of one instrument. */
export const annualVolatility = (id: number): number => MIN_ANNUAL_VOL + (MAX_ANNUAL_VOL - MIN_ANNUAL_VOL) * unitFor(id, 1);

/** When one instrument "started trading" (epoch ms): a different date for each, between 2 and 25 years back, the same every run. */
export const listingTime = (id: number, now: number): number => now - (MIN_LISTED_YEARS + (MAX_LISTED_YEARS - MIN_LISTED_YEARS) * unitFor(id, 2)) * YEAR;

/** Which range each name is: the bar length, and how many bars it covers. YTD and MAX depend on the date, so they are worked out from `now`. */
function shapeOf(input: RangeInput): { step: number; bars: number } {
  const { range, now, id } = input;
  switch (range) {
    case "1d":
      return { step: 5 * MINUTE, bars: 288 }; // not used: a day is a session, see sessionSeries
    case "1m":
      return { step: DAY, bars: 30 };
    case "1y":
      return { step: DAY, bars: 365 };
    case "ytd": {
      const startOfYear = Date.UTC(new Date(now).getUTCFullYear(), 0, 1);
      return { step: DAY, bars: Math.max(2, Math.ceil((now - startOfYear) / DAY)) };
    }
    case "max":
      return { step: WEEK, bars: Math.max(52, Math.floor((now - listingTime(id, now)) / WEEK)) };
  }
}

/**
 * Made-up price history of one instrument over a longer range, oldest first as [epoch ms, wire price]. Nothing is stored:
 * it is worked out when asked, from the instrument's number and the range, so the same instrument always has the same
 * shape. It is a random walk run backwards from the current price (so it always ends at the price on the screen), with the
 * instrument's own yearly volatility. A one-day series is a trading session instead (see sessionSeries).
 */
export function rangeSeries(input: RangeInput): [number, number][] {
  const { id, range, now, last, prevClose, tick } = input;
  if (range === "1d") return sessionSeries(input);
  const { step, bars } = shapeOf(input);
  const rng = createRng(id * 31 + ["1d", "1m", "1y", "ytd", "max"].indexOf(range) + 1);
  const sigma = annualVolatility(id) * Math.sqrt(step / YEAR); // the spread of one bar's log return

  // Log prices, newest first: k = 0 is now, k = bars is the start.
  const logs = new Array<number>(bars + 1);
  logs[0] = Math.log(last);
  for (let k = 1; k <= bars; k++) logs[k] = logs[k - 1]! - rng.gauss() * sigma; // going back in time, so the return is undone

  // Bars sit on whole multiples of the step, so asking again a moment later gives the same times; the last point is now.
  const aligned = Math.floor(now / step) * step;
  const newestBar = aligned === now ? aligned - step : aligned;
  const out: [number, number][] = new Array(bars + 1);
  for (let k = 0; k <= bars; k++) {
    const time = k === 0 ? now : newestBar - (k - 1) * step;
    const price = k === 0 ? last : Math.max(tick, Math.round(Math.exp(logs[k]!) / tick) * tick);
    out[bars - k] = [time, price];
  }
  return out;
}

/**
 * One day: from the instrument's most recent session open to now, in 5-minute bars. The line starts exactly at the previous
 * close, as a real one-day chart does, and ends at the current price. A market that trades round the clock has no session,
 * so it shows the last 24 hours instead.
 */
function sessionSeries(input: RangeInput): [number, number][] {
  const { id, now, last, prevClose, tick, session } = input;
  const step = 5 * MINUTE;
  const start = session.open; // for a market that trades round the clock this is 24 hours ago
  const end = now; // the line always reaches the live price, so it agrees with the live trades
  const bars = Math.max(1, Math.ceil((end - start) / step));
  const rng = createRng(id * 31 + 17);
  const sigma = annualVolatility(id) * Math.sqrt(step / YEAR);

  const logs = new Array<number>(bars + 1);
  logs[0] = Math.log(last);
  for (let k = 1; k <= bars; k++) logs[k] = logs[k - 1]! - rng.gauss() * sigma;
  const miss = Math.log(prevClose) - logs[bars]!; // bend the walk so it starts at the previous close and still ends at the price
  for (let k = 1; k <= bars; k++) logs[k] = logs[k]! + (k / bars) * miss;

  const out: [number, number][] = new Array(bars + 1);
  for (let k = 0; k <= bars; k++) {
    const time = k === bars ? start : end - k * step;
    const price = k === 0 ? last : k === bars ? prevClose : Math.max(tick, Math.round(Math.exp(logs[k]!) / tick) * tick); // eslint-disable-line no-nested-ternary
    out[bars - k] = [time, price];
  }
  return out;
}
