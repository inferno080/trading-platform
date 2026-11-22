import type { ChaosAction, DepthLevel, HistoryRange, InstrumentReference, Quote, RfqQuote, RfqRequest, RfqResult, Session, SessionInfo, Trade } from "../protocol/messages";

/** Where the connection stands. */
export type FeedStatus = "connecting" | "live" | "reconnecting" | "closed" | "error";

/**
 * The only messages that cross between the page and the Web Worker that owns the connection. They are small on
 * purpose: the page and the worker are separate threads, and everything sent between them is copied.
 */

/** What the worker counted since the page last asked for a batch. */
export interface FeedStats {
  messages: number; // delta frames applied
  updatesIn: number; // quote updates inside those frames, before conflation
  gaps: number; // sequence gaps detected
  latencies: number[]; // ms from the server's send time to arrival in the worker, one per delta frame
}

/** The price chart of one tracked instrument (the open one, or one on the watchlist): the flat [time, price, ...] list, all of it, replacing what the page had. */
export interface ChartUpdate {
  id: number;
  /** Which range this chart is (the last five minutes when absent). */
  range?: HistoryRange;
  /** The instrument's market at the time (sent with the longer ranges): which session a day is, and its time zone. */
  session?: SessionInfo;
  data: Float64Array;
}

/** The order book of the open instrument: the whole ladder, best price first, replacing the page's last one. */
export interface DepthUpdate {
  id: number;
  bids: DepthLevel[];
  asks: DepthLevel[];
}

/** The open instrument's trades since the page last asked, oldest first. */
export interface TradesUpdate {
  id: number;
  trades: Trade[];
}

/** From the page to the worker. */
export type WorkerCommand =
  | { type: "connect"; url: string }
  | { type: "pull" } // "send me what changed since the last pull": the page asks once per animation frame
  | { type: "select"; id: number | null } // the instrument whose price chart the page shows (null: none)
  | { type: "range"; range: HistoryRange } // how far back the open chart goes: the worker asks the server for that range of the open instrument
  | { type: "watch"; ids: number[] } // the instruments on the watchlist: each is subscribed to and has a chart kept up to date
  | { type: "rfq"; request: RfqRequest } // ask the dealer for a quote
  | { type: "rfqAccept"; ref: number } // accept a quote
  | { type: "rfqReject"; ref: number } // turn a quote down
  | { type: "retry" } // do not wait for the next reconnection attempt: make it now
  | { type: "chaos"; action: ChaosAction; value?: number }; // ask the server to misbehave on purpose

/** From the worker to the page. */
export type WorkerEvent =
  | { type: "ready"; scope: string } // the worker has started; `scope` is the name of its global scope
  | { type: "status"; status: FeedStatus }
  | { type: "session"; session: Session } // the handshake was accepted
  | { type: "badVersion"; version: number } // the server speaks a protocol version this client does not
  | { type: "reference"; instruments: InstrumentReference[] } // the reference data arrived
  | { type: "referenceTimeout" } // the reference data has not arrived in time
  | { type: "snapshot"; quotes: Quote[] } // the full state, sent on connect and again after a gap
  | { type: "batch"; updates: Quote[]; stats: FeedStats; charts?: ChartUpdate[]; depth?: DepthUpdate; trades?: TradesUpdate } // the latest state of every instrument that changed since the last pull, every tracked chart that changed, and the open instrument's order book and new trades
  | { type: "chartUnavailable"; id: number } // the server has no price history for a tracked instrument
  | { type: "rfqQuote"; quote: RfqQuote } // the dealer's quote for a request
  | { type: "rfqResult"; result: RfqResult } // how a request ended
  | { type: "reconnect"; attempt: number; retryAt: number }; // the connection was lost: the next attempt is number `attempt`, made at time `retryAt` (ms, like Date.now())

