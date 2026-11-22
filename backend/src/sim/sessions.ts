/**
 * Trading sessions: when each market is open. The simulator's four kinds of instrument trade on three exchanges and one
 * round-the-clock market, each with its own hours in its own time zone. A chart of "one day" starts at a session's open and
 * runs to now. Nothing here stops the live feed outside these hours: the simulator moves prices all the time, and the
 * sessions only decide where a one-day chart starts and where its time axis reaches.
 */

export type Market = "us" | "eu" | "jp" | "fx";

interface Hours {
  timeZone: string; // an IANA name, so daylight saving is handled by the platform's own tables
  open: [hour: number, minute: number];
  close: [hour: number, minute: number];
  continuous: boolean; // trades round the clock: there is no open or close
}

const MARKETS: Record<Market, Hours> = {
  us: { timeZone: "America/New_York", open: [9, 30], close: [16, 0], continuous: false },
  eu: { timeZone: "Europe/Berlin", open: [9, 0], close: [17, 30], continuous: false },
  jp: { timeZone: "Asia/Tokyo", open: [9, 0], close: [15, 0], continuous: false }, // the real lunch break is left out
  fx: { timeZone: "UTC", open: [0, 0], close: [24, 0], continuous: true },
};

/** The market an instrument trades on, from its group (see sim/instruments.ts): USD equities, EUR equities, JPY equities, FX. */
export const marketOfClass = (classIndex: number): Market => (["us", "eu", "jp", "fx"] as const)[classIndex]!;

/** One market's session at some moment. All times are epoch milliseconds. */
export interface SessionInfo {
  market: Market;
  timeZone: string;
  continuous: boolean;
  /** The current session if one is open, else the most recent one that ended. For a round-the-clock market: the last 24 hours. */
  open: number;
  close: number;
}

const DAY = 24 * 60 * 60_000;

const formats = new Map<string, Intl.DateTimeFormat>();
const formatFor = (timeZone: string): Intl.DateTimeFormat => {
  let format = formats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
    formats.set(timeZone, format);
  }
  return format;
};

interface Local {
  year: number;
  month: number; // 1 to 12
  day: number;
  minutes: number; // since local midnight
}

/** What the clock and calendar say in a time zone at an instant. */
function localTime(time: number, timeZone: string): Local {
  const get: Record<string, string> = {};
  for (const part of formatFor(timeZone).formatToParts(time)) get[part.type] = part.value;
  return {
    year: Number(get.year),
    month: Number(get.month),
    day: Number(get.day),
    minutes: Number(get.hour) * 60 + Number(get.minute),
  };
}

/** The instant at which a time zone's clock reads this date and time. Worked out twice, so a change of offset on that day is allowed for. */
function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): number {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 2; i++) {
    const local = localTime(guess, timeZone);
    const shown = Date.UTC(local.year, local.month - 1, local.day, Math.floor(local.minutes / 60), local.minutes % 60);
    guess += Date.UTC(year, month - 1, day, hour, minute) - shown;
  }
  return guess;
}

/** The opening and closing instants of the session on a calendar day (months and days as the local calendar reads them). */
function sessionOn(hours: Hours, year: number, month: number, day: number): { open: number; close: number } {
  return {
    open: zonedToUtc(year, month, day, hours.open[0], hours.open[1], hours.timeZone),
    close: zonedToUtc(year, month, day, hours.close[0], hours.close[1], hours.timeZone),
  };
}

/** The calendar day `offset` days from a local date (the calendar is the same whatever the zone). */
function addDays(year: number, month: number, day: number, offset: number): { year: number; month: number; day: number } {
  const moved = new Date(Date.UTC(year, month - 1, day + offset));
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

/**
 * The session a one-day chart is of at a moment: the one that opened most recently (today's, once the day's open has passed,
 * otherwise yesterday's), and where it closes. The chart runs from that open to **now**, so it always reaches the live price
 * and agrees with the timestamps of the live trades: before the close it stops partway, and after the close (or at a
 * weekend) it runs on past the close, since the feed does not stop. For a market that trades round the clock it is the last
 * 24 hours.
 */
export function sessionAt(market: Market, time: number): SessionInfo {
  const hours = MARKETS[market];
  const base = { market, timeZone: hours.timeZone, continuous: hours.continuous };
  if (hours.continuous) return { ...base, open: time - DAY, close: time };

  const local = localTime(time, hours.timeZone);
  const startOfOpen = hours.open[0] * 60 + hours.open[1];
  const day = addDays(local.year, local.month, local.day, local.minutes >= startOfOpen ? 0 : -1);
  const session = sessionOn(hours, day.year, day.month, day.day);
  return { ...base, open: session.open, close: session.close };
}
