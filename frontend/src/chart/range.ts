import { HISTORY_RANGES, type HistoryRange, type SessionInfo } from "../protocol/messages";

export { HISTORY_RANGES };
export type { HistoryRange };

/** The server's real, live buffer: the last five minutes. The watchlist's mini charts use it; the open chart has no button for it. */
export const LIVE_RANGE: HistoryRange = "5m";

/** The ranges the buttons offer, shortest first. All of them are made up by the server (see backend/src/sim/rangeHistory.ts). */
export const CHART_RANGES = ["1d", "1m", "1y", "ytd", "max"] as const satisfies readonly HistoryRange[];

/** The range the open chart starts on. */
export const DEFAULT_RANGE: HistoryRange = "1d";

/** The key of one instrument's series for one range, in a map. */
export const rangeKey = (id: number, range: HistoryRange): string => `${id}:${range}`;

/** The ranges measured against the previous close (the shorter ones, up to a day); the longer ones against where they start. */
const usesPrevClose = (range: HistoryRange): boolean => range === "5m" || range === "1d";

/**
 * The price a chart's colour, dotted line and "change" are measured against, as a wire integer (0: not known). For the
 * five-minute and one-day ranges it is the previous close; for a longer range it is the price where the range starts.
 */
export function baselineFor(range: HistoryRange, data: ArrayLike<number> | null | undefined, prevClose: number): number {
  if (usesPrevClose(range)) return prevClose;
  return data && data.length >= 2 ? data[1]! : 0;
}

/** Whether the dotted line is the previous close (so it is labelled that), or the start of the range. */
export const baselineIsPrevClose = usesPrevClose;

/**
 * How a chart is drawn for the market it belongs to: its times are written on the market's own clock (the live trades are
 * too), and a one-day chart of an exchange reaches the session's close even before the close has come, so the line stops
 * where "now" is; after the close the axis runs on to the end of the data. `dataEnd` is the time of the newest point.
 */
export function sessionView(range: HistoryRange, session: SessionInfo | undefined, dataEnd: number): { timeZone?: string; domain?: { start: number; end: number } } {
  if (!session || range === LIVE_RANGE) return {};
  if (range === "1d" && !session.continuous) return { timeZone: session.timeZone, domain: { start: session.open, end: Math.max(session.close, dataEnd) } };
  return { timeZone: session.timeZone };
}
