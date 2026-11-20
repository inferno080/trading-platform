import { decodeServerMessage, encodeClientMessage } from "../protocol/codec";
import { PROTOCOL_VERSION, type Quote, type QuoteUpdate } from "../protocol/messages";
import type { FeedStats, FeedStatus, WorkerEvent } from "./messages";

/** How long to wait for the reference data after the session before reporting that it is late. */
export const REFERENCE_TIMEOUT_MS = 10_000;

/** The parts of a WebSocket the connection uses. The real WebSocket and the fake used in tests both fit. */
export interface SocketLike {
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
  private status: FeedStatus = "connecting";
  private quotes: Quote[] = []; // the full state, by instrument id
  private changed = new Set<number>(); // instruments updated since the last pull
  private lastSeq = -1; // -1 means "waiting for a snapshot": deltas are ignored until one arrives
  private stats: FeedStats = emptyStats();

  constructor(
    private readonly createSocket: (url: string) => SocketLike,
    private readonly emit: (event: WorkerEvent) => void,
    private readonly now: () => number = Date.now,
  ) {}

  /** Open a connection, closing any earlier one first so there is only ever one. */
  connect(url: string): void {
    this.close();
    this.resetState();
    const socket = this.createSocket(url);
    this.socket = socket;
    socket.binaryType = "arraybuffer";
    this.setStatus("connecting");

    socket.onopen = () => this.setStatus("live");
    socket.onclose = () => this.setStatus(this.status === "error" ? "error" : "closed"); // an error stays an error
    socket.onerror = () => this.setStatus("error");
    socket.onmessage = (event) => this.handle(socket, event.data);
  }

  /** Close the connection and stop everything it started. */
  close(): void {
    clearTimeout(this.referenceTimer);
    const socket = this.socket;
    if (!socket) return;
    socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;
    socket.close();
    this.socket = null;
  }

  /** Hand over what changed since the last call: the latest state of each changed instrument, and the counters. */
  pull(): void {
    const updates: Quote[] = [];
    for (const id of this.changed) {
      const quote = this.quotes[id];
      if (quote) updates.push(quote);
    }
    this.changed.clear();
    const stats = this.stats;
    this.stats = emptyStats();
    this.emit({ type: "batch", updates, stats });
  }

  private resetState(): void {
    this.quotes = [];
    this.changed.clear();
    this.lastSeq = -1;
    this.stats = emptyStats();
  }

  private setStatus(status: FeedStatus): void {
    this.status = status;
    this.emit({ type: "status", status });
  }

  private handle(socket: SocketLike, data: ArrayBuffer): void {
    const message = decodeServerMessage(new Uint8Array(data));
    switch (message.t) {
      case "session":
        if (message.v !== PROTOCOL_VERSION) {
          // Refuse to talk to a server speaking a protocol we do not understand.
          this.emit({ type: "badVersion", version: message.v });
          this.setStatus("error");
          this.close();
          return;
        }
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
  }
}
