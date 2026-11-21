import type { ChartUpdate, DepthUpdate, TradesUpdate } from "../feed/messages";
import type { InstrumentReference, Quote, Trade } from "../protocol/messages";

/** How many recent trades are kept for the tape. */
export const TAPE_LENGTH = 30;

/** An instrument with no update for this long is shown as stale. */
export const STALE_AFTER_MS = 5_000;

/** Which way a value last moved: 1 up, -1 down, 0 not yet known. */
export type Direction = -1 | 0 | 1;

/**
 * One grid row: a quote joined with its reference data. Prices are real numbers (wire integer divided by the
 * instrument's scale), so sorting and filtering compare like with like across instruments with different decimals.
 */
export interface Row {
  id: number;
  sym: string;
  name: string;
  currency: string;
  decimals: number;
  tickSize: number;
  prevClose: number;
  bid: number;
  ask: number;
  spread: number;
  last: number;
  change: number | null; // last against the previous close, as a fraction; null when there is no previous close
  bidSz: number;
  askSz: number;
  vol: number;
  dirBid: Direction;
  dirAsk: Direction;
  dirLast: Direction;
  stale: boolean;
  updatedAt: number; // when this page last received an update for it, in ms
}

/** What changed, for whoever draws the rows. */
export type RowsChange = { kind: "reset"; rows: Row[] } | { kind: "update"; rows: Row[] };

/** Which way `next` moved from the previous row's value, or the direction it had before when it did not move. */
function direction(next: number, previous: Row | undefined, field: "bid" | "ask" | "last", key: "dirBid" | "dirAsk" | "dirLast"): Direction {
  const before = previous?.[field];
  if (previous === undefined || before === undefined || next === before) return previous?.[key] ?? 0; // no movement: keep showing the last move
  return next > before ? 1 : -1;
}

/**
 * What the page knows about the market, kept apart from React. The worker's messages go in here; the grid
 * subscribes and draws what changes. Keeping it outside React means a batch of updates costs one pass over the
 * changed rows, not a render of the whole page.
 */
export class FeedStore {
  private reference: ReadonlyMap<number, InstrumentReference> | null = null;
  private quotes = new Map<number, Quote>(); // the latest quote of each instrument
  private rowsById = new Map<number, Row>();
  private built = false; // rows exist once both the snapshot and the reference data have arrived
  private readonly listeners = new Set<(change: RowsChange) => void>();

  get rows(): Row[] {
    return [...this.rowsById.values()];
  }

  /** One row, or undefined if there is none (yet) for that instrument. */
  row(id: number): Row | undefined {
    return this.rowsById.get(id);
  }

  /** The reference data of one instrument, once it has arrived. */
  instrument(id: number): InstrumentReference | undefined {
    return this.reference?.get(id);
  }

  /** The open instrument's order book (the whole ladder, as last sent), and its recent trades, newest first. */
  book: DepthUpdate | null = null;
  tape: Trade[] = [];
  private readonly bookListeners = new Set<() => void>();

  setBook(depth: DepthUpdate): void {
    this.book = depth;
    this.notifyBook();
  }

  /** Add trades to the front of the tape, which keeps only the most recent. */
  addTrades(update: TradesUpdate): void {
    this.tape = [...update.trades.slice().reverse(), ...this.tape].slice(0, TAPE_LENGTH);
    this.notifyBook();
  }

  /** Forget the book and the tape, when another instrument is opened or none. */
  clearBook(): void {
    this.book = null;
    this.tape = [];
    this.notifyBook();
  }

  /** Be told when the book or the tape changes. Returns the way to stop. */
  subscribeBook(listener: () => void): () => void {
    this.bookListeners.add(listener);
    return () => this.bookListeners.delete(listener);
  }

  private notifyBook(): void {
    for (const listener of this.bookListeners) listener();
  }

  /** The price charts of the tracked instruments (the open one and the watchlist's), as last sent by the worker. */
  private readonly charts = new Map<number, Float64Array>();
  private readonly chartListeners = new Set<(ids: number[]) => void>();

  /** One instrument's chart: the flat [time, price, ...] list, or undefined until its history has arrived. */
  chart(id: number): Float64Array | undefined {
    return this.charts.get(id);
  }

  setCharts(updates: ChartUpdate[]): void {
    for (const update of updates) this.charts.set(update.id, update.data);
    this.notifyCharts(updates.map((update) => update.id));
  }

  /** Forget the charts of instruments that are no longer tracked, so a later one starts from its skeleton again. */
  keepCharts(ids: ReadonlySet<number>): void {
    for (const id of [...this.charts.keys()]) if (!ids.has(id)) this.charts.delete(id);
  }

  /** Be told, with the instrument ids, when charts change. Returns the way to stop. */
  subscribeCharts(listener: (ids: number[]) => void): () => void {
    this.chartListeners.add(listener);
    return () => this.chartListeners.delete(listener);
  }

  private notifyCharts(ids: number[]): void {
    for (const listener of this.chartListeners) listener(ids);
  }

  subscribe(listener: (change: RowsChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setReference(instruments: InstrumentReference[], now: number): void {
    this.reference = new Map(instruments.map((instrument) => [instrument.id, instrument]));
    this.rebuild(now);
  }

  /** A full snapshot replaces everything, on connect and again after a gap. */
  setSnapshot(quotes: Quote[], now: number): void {
    this.quotes = new Map(quotes.map((quote) => [quote.id, quote]));
    this.rebuild(now);
  }

  /** Apply one batch: the latest state of each instrument that changed. Notifies once, however many rows changed. */
  applyBatch(updates: Quote[], now: number): void {
    for (const quote of updates) this.quotes.set(quote.id, quote);
    if (!this.built) return;

    const changed: Row[] = [];
    for (const quote of updates) {
      const row = this.buildRow(quote, now);
      if (row) {
        this.rowsById.set(row.id, row);
        changed.push(row);
      }
    }
    if (changed.length > 0) this.notify({ kind: "update", rows: changed });
  }

  /** Mark rows that have gone quiet. Returns, and notifies about, the rows whose stale state changed. */
  sweepStale(now: number): Row[] {
    const changed: Row[] = [];
    for (const row of this.rowsById.values()) {
      const stale = now - row.updatedAt > STALE_AFTER_MS;
      if (stale === row.stale) continue;
      const next = { ...row, stale };
      this.rowsById.set(row.id, next);
      changed.push(next);
    }
    if (changed.length > 0) this.notify({ kind: "update", rows: changed });
    return changed;
  }

  private rebuild(now: number): void {
    if (!this.reference || this.quotes.size === 0) return;
    this.rowsById = new Map();
    for (const quote of this.quotes.values()) {
      const row = this.buildRow(quote, now);
      if (row) this.rowsById.set(row.id, row);
    }
    this.built = true;
    this.notify({ kind: "reset", rows: this.rows });
  }

  // An instrument with no reference data is left out: without its decimals its prices cannot be read.
  private buildRow(quote: Quote, now: number): Row | null {
    const instrument = this.reference?.get(quote.id);
    if (!instrument) return null;
    const previous = this.rowsById.get(quote.id);
    const scale = 10 ** instrument.decimals; // wire units per real price unit
    const bid = quote.bid / scale;
    const ask = quote.ask / scale;
    const last = quote.last / scale;
    return {
      id: quote.id,
      sym: quote.sym,
      name: instrument.name,
      currency: instrument.currency,
      decimals: instrument.decimals,
      tickSize: instrument.tickSize,
      prevClose: instrument.prevClose / scale,
      bid,
      ask,
      spread: (quote.ask - quote.bid) / scale,
      last,
      change: instrument.prevClose === 0 ? null : quote.last / instrument.prevClose - 1,
      bidSz: quote.bidSz,
      askSz: quote.askSz,
      vol: quote.vol,
      dirBid: direction(bid, previous, "bid", "dirBid"),
      dirAsk: direction(ask, previous, "ask", "dirAsk"),
      dirLast: direction(last, previous, "last", "dirLast"),
      stale: false,
      updatedAt: now,
    };
  }

  private notify(change: RowsChange): void {
    for (const listener of this.listeners) listener(change);
  }
}
