import { LIVE_RANGE, rangeKey, type HistoryRange } from "../chart/range";
import { appendTick, flatten } from "../chart/series";
import type { ClientMessage, HistoryData, QuoteUpdate, Rejected, SessionInfo } from "../protocol/messages";
import type { ChartUpdate } from "./messages";

/** Remove from a map or a set every key the test picks out. */
function dropWhere<K>(collection: Map<K, unknown> | Set<K>, test: (key: K) => boolean): void {
  for (const key of [...collection.keys()]) if (test(key)) collection.delete(key);
}

/**
 * Which instruments the page follows, and the charts kept for them: the open instrument and the watchlist each have a
 * five-minute chart (and a subscription), and the open instrument also has the longer ranges the page asked for. It works
 * out which requests the server needs, keeps the charts current from the live updates, and hands over what changed. It
 * knows nothing about sockets: FeedConnection sends the requests it asks for and tells it what arrives.
 */
export class ChartTracker {
  /** The instrument whose chart the page shows (null: none). */
  selectedId: number | null = null;
  private watched = new Set<number>(); // the instruments on the watchlist
  private range: HistoryRange = LIVE_RANGE; // how far back the open chart goes
  private series = new Map<number, number[]>(); // a five-minute chart per tracked instrument: the flat [time, price, ...] list, once its history has arrived
  private changedSeries = new Set<number>(); // charts that changed since the last take
  private requested = new Set<number>(); // instruments whose history was asked for on this connection
  private subscribed = new Set<number>(); // instruments subscribed to on this connection
  private rangeSeries = new Map<string, number[]>(); // the open instrument's longer charts, by instrument and range
  private changedRanges = new Set<string>(); // longer charts that changed since the last take
  private requestedRanges = new Set<string>(); // longer charts asked for on this connection
  private sessions = new Map<number, SessionInfo>(); // the market session each open instrument's longer charts were made for

  /** The page now shows the price chart of this instrument (or none). */
  select(id: number | null): void {
    this.selectedId = id;
    this.forgetUntracked();
  }

  /** The watchlist is now these instruments. */
  watch(ids: number[]): void {
    this.watched = new Set(ids);
    this.forgetUntracked();
  }

  /** The open chart now goes back this far. */
  setRange(range: HistoryRange): void {
    this.range = range;
  }

  isTracked(id: number): boolean {
    return id === this.selectedId || this.watched.has(id);
  }

  /** Forget the charts and requests of instruments that are no longer followed, so one that comes back is asked for again. */
  private forgetUntracked(): void {
    const untracked = (id: number) => !this.isTracked(id);
    dropWhere(this.series, untracked);
    dropWhere(this.requested, untracked);
    // Longer charts are only kept for the open instrument.
    const prefix = this.selectedId === null ? null : `${this.selectedId}:`;
    const ofAnother = (key: string) => !prefix || !key.startsWith(prefix);
    dropWhere(this.rangeSeries, ofAnother);
    dropWhere(this.requestedRanges, ofAnother);
    dropWhere(this.sessions, (id) => id !== this.selectedId);
  }

  /**
   * The requests that bring the server up to date, each made once: the history of each followed instrument, subscriptions
   * added or dropped, and the open instrument's longer chart. The watchlist and the open instrument are all followed (the
   * open one needs the subscription for its order book and trades), at most five, which is what the server allows.
   */
  requests(): ClientMessage[] {
    const messages: ClientMessage[] = [];
    const wanted = new Set(this.watched);
    if (this.selectedId !== null) wanted.add(this.selectedId);
    for (const id of wanted) {
      if (this.requested.has(id)) continue;
      this.requested.add(id);
      messages.push({ t: "history", id });
    }
    for (const id of [...this.subscribed]) {
      if (wanted.has(id)) continue;
      this.subscribed.delete(id);
      messages.push({ t: "unsubscribe", id });
    }
    for (const id of wanted) {
      if (this.subscribed.has(id)) continue;
      this.subscribed.add(id);
      messages.push({ t: "subscribe", id });
    }
    const longer = this.longerChartRequest();
    if (longer) messages.push(longer);
    return messages;
  }

  /** The request for the open instrument's chart over the chosen range, if it has not been made (the five-minute chart is among the tracked ones). */
  private longerChartRequest(): ClientMessage | null {
    if (this.selectedId === null || this.range === LIVE_RANGE) return null;
    const key = rangeKey(this.selectedId, this.range);
    if (this.requestedRanges.has(key)) return null;
    this.requestedRanges.add(key);
    return { t: "history", id: this.selectedId, range: this.range };
  }

  /**
   * The server's answer to a request for a chart: the data, or that there is none. Returns the instrument whose five-minute
   * history the server does not have, so the page can say so, and null otherwise.
   */
  handleReply(message: HistoryData | Rejected): number | null {
    if (message.t === "history" && message.range && message.range !== LIVE_RANGE) {
      this.keepRange(message);
      return null;
    }
    if (!this.isTracked(message.id)) return null; // an answer for an instrument that is no longer followed
    if (message.t === "history") {
      this.series.set(message.id, message.points.flat());
      this.changedSeries.add(message.id);
      return null;
    }
    return message.request === "history" ? message.id : null;
  }

  /** A longer chart for the open instrument arrived (one for another instrument, which is no longer open, is dropped). */
  private keepRange(message: HistoryData): void {
    if (message.id !== this.selectedId) return;
    const key = rangeKey(message.id, message.range);
    this.rangeSeries.set(key, flatten(message.points));
    this.changedRanges.add(key);
    if (message.session) this.sessions.set(message.id, message.session);
  }

  /** Keep the charts current from the live updates. */
  fold(updates: QuoteUpdate[]): void {
    this.foldIntoSeries(updates);
    this.foldIntoRanges(updates);
  }

  /** Each update of a followed instrument is folded into its five-minute chart's newest point, or starts a new one. */
  private foldIntoSeries(updates: QuoteUpdate[]): void {
    if (this.series.size === 0) return; // no history yet: it will include these
    for (const update of updates) {
      const data = this.series.get(update.id);
      if (!data || data.length === 0) continue;
      appendTick(data, update.ts, update.last);
      this.changedSeries.add(update.id);
    }
  }

  /** The open instrument's longer charts follow its price: their newest point shows the live price. */
  private foldIntoRanges(updates: QuoteUpdate[]): void {
    if (this.rangeSeries.size === 0 || this.selectedId === null) return;
    const prefix = `${this.selectedId}:`;
    for (const update of updates) {
      if (update.id !== this.selectedId) continue;
      for (const [key, data] of this.rangeSeries) {
        if (!key.startsWith(prefix) || data.length < 2) continue;
        data[data.length - 1] = update.last;
        this.changedRanges.add(key);
      }
    }
  }

  /** The charts that changed since the last call, each as a fresh copy (the page gets its own): the five-minute charts, and the open instrument's longer ones. */
  takeCharts(): ChartUpdate[] {
    const charts: ChartUpdate[] = [];
    for (const id of this.changedSeries) {
      const data = this.series.get(id);
      if (data) charts.push({ id, data: Float64Array.from(data) });
    }
    this.changedSeries.clear();
    for (const key of this.changedRanges) {
      const data = this.rangeSeries.get(key);
      const [id, range] = key.split(":");
      const session = this.sessions.get(Number(id));
      if (data) charts.push({ id: Number(id), range: range as HistoryRange, ...(session ? { session } : {}), data: Float64Array.from(data) });
    }
    this.changedRanges.clear();
    return charts;
  }

  /** A new connection knows nothing of what was asked before: forget it all, and keep what the page chose to follow. */
  reset(): void {
    this.series.clear();
    this.changedSeries.clear();
    this.rangeSeries.clear();
    this.changedRanges.clear();
    this.sessions.clear();
    this.requestedRanges.clear();
    this.requested.clear();
    this.subscribed.clear();
  }
}
