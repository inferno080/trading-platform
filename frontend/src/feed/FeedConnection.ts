import { encodeClientMessage, tryDecodeServerMessage } from "../protocol/codec";
import type { HistoryRange } from "../chart/range";
import { ChartTracker } from "./ChartTracker";
import { Reconnector } from "./reconnect";
import {
  PROTOCOL_VERSION,
  type ChaosAction,
  type Delta,
  type HistoryData,
  type Quote,
  type QuoteUpdate,
  type ReferenceData,
  type Rejected,
  type RfqRequest,
  type ServerMessage,
  type Session,
  type Snapshot,
  type Trade,
} from "../protocol/messages";
import type { DepthUpdate, FeedStats, FeedStatus, WorkerEvent } from "./messages";

/** How long to wait for the reference data after the session before reporting that it is late. */
export const REFERENCE_TIMEOUT_MS = 10_000;

/** The parts of a WebSocket the connection uses. The real WebSocket and the fake used in tests both fit. */
interface SocketLike {
  binaryType: string;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null;
  send(data: Uint8Array<ArrayBuffer>): void; // bytes backed by a plain ArrayBuffer, which is what WebSocket.send accepts
  close(): void;
}

const emptyStats = (): FeedStats => ({ messages: 0, updatesIn: 0, gaps: 0, latencies: [] });

/**
 * The connection to the server, with its rules: check the protocol version, ask for the reference data once,
 * keep the full market state, recover from gaps, and conflate. It runs inside the Web Worker, but it is an
 * ordinary class that knows nothing about workers: the socket, the way to report events and the clock are
 * handed to it, which is what makes it easy to test.
 *
 * Conflation: every update is applied to the state at once, and the instrument is only marked as changed. When
 * the page asks (once per animation frame) it gets the latest state of each changed instrument, however many
 * updates that took. An instrument that ticked 20 times between two frames is sent once.
 */
export class FeedConnection {
  private socket: SocketLike | null = null;
  private referenceTimer: ReturnType<typeof setTimeout> | undefined;
  private quotes: Quote[] = []; // the full state, by instrument id
  private changed = new Set<number>(); // instruments updated since the last pull
  private lastSeq = -1; // -1 means "waiting for a snapshot": deltas are ignored until one arrives
  private stats: FeedStats = emptyStats();
  private depth: DepthUpdate | null = null; // the open instrument's newest order book, until the next pull
  private newTrades: Trade[] = []; // the open instrument's trades since the last pull, oldest first
  private open = false; // the socket is open, so requests can be sent
  private readonly tracker = new ChartTracker(); // what the page follows, and the charts kept for it
  private url = "";
  private readonly reconnector: Reconnector;

  constructor(
    private readonly createSocket: (url: string) => SocketLike,
    private readonly emit: (event: WorkerEvent) => void,
    private readonly now: () => number = Date.now,
  ) {
    // When the connection is lost it is opened again after a growing wait; the page is told when the next attempt will be.
    this.reconnector = new Reconnector(
      () => this.openSocket(),
      (info) => this.emit({ type: "reconnect", ...info }),
      now,
    );
  }

  /** Open a connection, closing any earlier one first so there is only ever one. If it is lost it is reopened (see Reconnector). */
  connect(url: string): void {
    this.close();
    this.url = url;
    this.openSocket();
  }

  /** Try again now instead of waiting for the next scheduled attempt. */
  retryNow(): void {
    this.reconnector.retryNow();
  }

  /** Ask the server to misbehave on purpose (it affects every client). Without an open connection nothing is sent. */
  sendChaos(action: ChaosAction, value?: number): void {
    if (this.open && this.socket) this.socket.send(encodeClientMessage(value === undefined ? { t: "chaos", action } : { t: "chaos", action, value }));
  }

  private openSocket(): void {
    this.resetState();
    const socket = this.createSocket(this.url);
    this.socket = socket;
    socket.binaryType = "arraybuffer";
    this.setStatus("connecting");

    socket.onopen = () => {
      this.open = true;
      this.setStatus("live");
      this.syncTracking(); // whatever was chosen before the connection was up
    };
    // A socket that closes by itself was lost (a socket closed on purpose has its handlers removed first). Whether it failed
    // to open or was cut later, the answer is the same: wait, then try again. An error is always followed by a close.
    socket.onclose = () => {
      clearTimeout(this.referenceTimer);
      this.open = false;
      this.socket = null;
      this.setStatus("reconnecting");
      this.reconnector.lost();
    };
    socket.onmessage = (event) => this.handle(socket, event.data);
  }

  /** Close the connection on purpose, stop everything it started, and stop trying to reconnect. */
  close(): void {
    this.reconnector.stop();
    clearTimeout(this.referenceTimer);
    const socket = this.socket;
    if (!socket) return;
    socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;
    socket.close();
    this.socket = null;
  }

  /** The page now shows the price chart of this instrument (or none). */
  select(id: number | null): void {
    this.tracker.select(id);
    this.depth = null; // the book and trades of the old one no longer matter
    this.newTrades = [];
    this.syncTracking();
  }

  /** The open chart now goes back this far (the last five minutes, a day, a month ...): ask the server for that range of the open instrument. */
  setRange(range: HistoryRange): void {
    this.tracker.setRange(range);
    this.syncTracking();
  }

  /** The watchlist is now these instruments: new ones are subscribed to, removed ones unsubscribed from. */
  watch(ids: number[]): void {
    this.tracker.watch(ids);
    this.syncTracking();
  }

  /** Send the requests that bring the server up to date. They are only sent while the socket is open; anything left over is sent when it opens. */
  private syncTracking(): void {
    if (!this.open || !this.socket) return;
    for (const message of this.tracker.requests()) this.socket.send(encodeClientMessage(message));
  }

  /** Ask the dealer for a quote. If there is no open connection, the request cannot be made, and the page is told so. */
  requestQuote(request: RfqRequest): void {
    if (this.open && this.socket) this.socket.send(encodeClientMessage(request));
    else this.emit({ type: "rfqResult", result: { t: "rfqResult", ref: request.ref, outcome: "unknown" } });
  }

  /** Accept or turn down a quote. Without a connection nothing is sent: the page learns that from the connection's status. */
  answerQuote(answer: "rfqAccept" | "rfqReject", ref: number): void {
    if (this.open && this.socket) this.socket.send(encodeClientMessage({ t: answer, ref }));
  }

  /** Hand over what changed since the last call: the latest state of each changed instrument, the counters, and the chart if it changed. */
  pull(): void {
    const updates: Quote[] = [];
    for (const id of this.changed) {
      const quote = this.quotes[id];
      if (quote) updates.push(quote);
    }
    this.changed.clear();
    const stats = this.stats;
    this.stats = emptyStats();
    const batch: Extract<WorkerEvent, { type: "batch" }> = { type: "batch", updates, stats };
    const charts = this.tracker.takeCharts();
    if (charts.length > 0) batch.charts = charts;
    if (this.depth) {
      batch.depth = this.depth;
      this.depth = null;
    }
    const open = this.tracker.selectedId;
    if (this.newTrades.length > 0 && open !== null) {
      batch.trades = { id: open, trades: this.newTrades };
      this.newTrades = [];
    }
    this.emit(batch);
  }

  private resetState(): void {
    this.quotes = [];
    this.changed.clear();
    this.lastSeq = -1;
    this.stats = emptyStats();
    this.tracker.reset(); // asked for again once the new connection is open
    this.depth = null;
    this.newTrades = [];
    this.open = false;
  }

  private setStatus(status: FeedStatus): void {
    this.emit({ type: "status", status });
  }

  private handle(socket: SocketLike, data: ArrayBuffer): void {
    const message = tryDecodeServerMessage(new Uint8Array(data));
    if (!message) return; // not a message this client knows: ignored, like any unknown one
    switch (message.t) {
      case "session":
        if (message.v !== PROTOCOL_VERSION) {
          // Refuse to talk to a server speaking a protocol we do not understand.
          this.emit({ type: "badVersion", version: message.v });
          this.setStatus("error");
          this.close();
          return;
        }
        this.reconnector.succeeded(); // a working connection: the next loss starts again from the shortest wait
        this.emit({ type: "session", session: message });
        // The only reference request of this connection. Without the reply the prices cannot be read.
        socket.send(encodeClientMessage({ t: "reference" }));
        this.referenceTimer = setTimeout(() => this.emit({ type: "referenceTimeout" }), REFERENCE_TIMEOUT_MS);
        break;
      case "reference":
        clearTimeout(this.referenceTimer);
        this.emit({ type: "reference", instruments: message.instruments });
        break;
      case "snapshot":
        this.lastSeq = message.seq;
        this.quotes = message.quotes;
        this.changed.clear(); // the snapshot already holds everything pending
        this.emit({ type: "snapshot", quotes: message.quotes });
        break;
      case "delta":
        this.applyDelta(socket, message.seq, message.ts, message.updates);
        break;
      default:
        this.handleDetail(message); // everything that is about one instrument, or about quotes
    }
  }

  /** The messages that are not the market itself: the open instrument's chart, order book and trades, and the dealer's replies. */
  private handleDetail(message: Exclude<ServerMessage, Session | ReferenceData | Snapshot | Delta>): void {
    switch (message.t) {
      case "history":
      case "rejected":
        this.handleChartReply(message);
        break;
      case "depth":
        // The ladder of the open instrument is kept (the newest replaces the last); the watchlist's are not shown anywhere.
        if (message.id === this.tracker.selectedId) this.depth = { id: message.id, bids: message.bids, asks: message.asks };
        break;
      case "trades":
        if (message.id === this.tracker.selectedId) this.newTrades.push(...message.trades);
        break;
      case "rfqQuote":
        this.emit({ type: "rfqQuote", quote: message });
        break;
      case "rfqResult":
        this.emit({ type: "rfqResult", result: message });
        break;
    }
  }

  private applyDelta(socket: SocketLike, seq: number, sentAt: number, updates: QuoteUpdate[]): void {
    if (this.lastSeq < 0) return; // waiting for a snapshot after a gap
    if (seq !== this.lastSeq + 1) {
      // Missed a frame: ask for a fresh snapshot and ignore deltas until it arrives.
      this.stats.gaps++;
      this.lastSeq = -1;
      socket.send(encodeClientMessage({ t: "resync" }));
      return;
    }
    this.lastSeq = seq;
    this.stats.messages++;
    this.stats.updatesIn += updates.length;
    this.stats.latencies.push(this.now() - sentAt);
    for (const update of updates) {
      const current = this.quotes[update.id];
      if (!current) continue;
      Object.assign(current, update);
      this.changed.add(update.id);
    }
    this.tracker.fold(updates);
  }

  /** The server's answer to a request for a chart: stored by the tracker, and the page is told if there is no history for an instrument. */
  private handleChartReply(message: HistoryData | Rejected): void {
    const unavailable = this.tracker.handleReply(message);
    if (unavailable !== null) this.emit({ type: "chartUnavailable", id: unavailable });
  }
}
