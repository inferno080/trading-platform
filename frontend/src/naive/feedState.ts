import { LIVE_RANGE, rangeKey } from "../chart/range";
import { appendTick, flatten } from "../chart/series";
import type { Depth, HistoryData, InstrumentReference, Quote, QuoteUpdate, Rejected, SessionInfo, Trade, Trades } from "../protocol/messages";

/*
 * What the Naive tab does to its state when a message arrives, as plain functions: each gets the setters it needs and
 * copies what it changes, on purpose (this tab is the baseline the optimized one is measured against). They are kept apart
 * from the hook so that it only has to wire a socket to them.
 */

/** Reference data by instrument id. */
export type ReferenceById = ReadonlyMap<number, InstrumentReference>;

/** Naive on purpose: copies the whole array on every frame, then replaces the quotes that changed. */
export const applyUpdates = (quotes: Quote[], updates: QuoteUpdate[]): Quote[] => {
  const next = quotes.slice();
  for (const update of updates) {
    const current = next[update.id];
    if (current) next[update.id] = { ...current, ...update };
  }
  return next;
};

/** The price charts of the tracked instruments (the open one and the watchlist's), by instrument id. */
export type Charts = Record<number, number[]>;

/** The open instrument's longer charts (a day, a month ...), by instrument and range. */
export type RangeCharts = Record<string, number[]>;

/** How many recent trades the tape keeps. */
const TAPE_LENGTH = 30;

/** The open instrument's order book and recent trades (newest first). */
export interface Book {
  depth: Depth | null;
  tape: Trade[];
}

/** Naive: a longer chart of the open instrument is copied, with its newest point set to the live price, on every update. */
export function foldRanges(setRanges: (update: (previous: RangeCharts) => RangeCharts) => void, open: number | null, updates: QuoteUpdate[]): void {
  if (open === null) return;
  for (const update of updates) {
    if (update.id !== open) continue;
    setRanges((previous) => {
      const keys = Object.keys(previous).filter((key) => key.startsWith(`${open}:`));
      if (keys.length === 0) return previous;
      const next = { ...previous };
      for (const key of keys) {
        const data = previous[key]!.slice();
        data[data.length - 1] = update.last;
        next[key] = data;
      }
      return next;
    });
  }
}

/** The sessions with only the open instrument's kept (the same object when nothing changes, so the page does not render again). */
export function onlySessionOf(sessions: Record<number, SessionInfo>, open: number | null): Record<number, SessionInfo> {
  const keep = open !== null ? sessions[open] : undefined;
  if (keep) return Object.keys(sessions).length === 1 ? sessions : { [open!]: keep };
  return Object.keys(sessions).length === 0 ? sessions : {};
}

/** A longer chart for the open instrument arrived: keep it. Returns false for a reply that is not one (the five-minute chart, or a refusal). */
export function applyRangeReply(
  msg: HistoryData | Rejected,
  open: number | null,
  setRanges: (update: (previous: RangeCharts) => RangeCharts) => void,
  setSessions: (update: (previous: Record<number, SessionInfo>) => Record<number, SessionInfo>) => void,
): boolean {
  if (msg.t !== "history" || !msg.range || msg.range === LIVE_RANGE) return false;
  if (msg.id !== open) return true;
  setRanges((previous) => ({ ...previous, [rangeKey(msg.id, msg.range)]: flatten(msg.points) }));
  const { session } = msg;
  if (session) setSessions((previous) => ({ ...previous, [msg.id]: session }));
  return true;
}

/** Naive: every update of a tracked instrument copies its whole chart (and the lot of them) and sets state again. */
export function foldTicks(setCharts: (update: (previous: Charts) => Charts) => void, tracked: ReadonlySet<number>, updates: QuoteUpdate[]): void {
  for (const update of updates) {
    if (!tracked.has(update.id)) continue;
    setCharts((previous) => {
      const current = previous[update.id];
      if (!current) return previous; // its history has not arrived yet
      const data = current.slice();
      appendTick(data, update.ts, update.last);
      return { ...previous, [update.id]: data };
    });
  }
}

/** Naive: each order book and each batch of trades makes a new book, with the trades copied in front of the old tape. */
export function applyBookMessage(msg: Depth | Trades, open: number | null, setBook: (update: (previous: Book) => Book) => void): void {
  if (msg.id !== open) return; // for an instrument that is not the open one
  if (msg.t === "depth") setBook((previous) => ({ ...previous, depth: msg }));
  else setBook((previous) => ({ ...previous, tape: [...msg.trades.slice().reverse(), ...previous.tape].slice(0, TAPE_LENGTH) }));
}

/** The server's answer to a request for a tracked instrument's history: the data, or a refusal. */
export function applyChartReply(
  msg: HistoryData | Rejected,
  tracked: ReadonlySet<number>,
  setCharts: (update: (previous: Charts) => Charts) => void,
  setUnavailable: (update: (previous: number[]) => number[]) => void,
): void {
  if (!tracked.has(msg.id)) return; // an answer for an instrument that is no longer tracked
  if (msg.t === "history") setCharts((previous) => ({ ...previous, [msg.id]: flatten(msg.points) }));
  else if (msg.request === "history") setUnavailable((previous) => (previous.includes(msg.id) ? previous : [...previous, msg.id]));
}

