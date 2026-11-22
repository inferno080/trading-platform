/**
 * Wire protocol. Encoded as MessagePack binary frames.
 *
 * Flow: on connect the server sends a Session, then a Snapshot, then sequence-numbered Deltas.
 * If a client sees `seq` skip (gap), or the server dropped frames for it due to
 * backpressure, the client sends { t: "resync" } and gets a fresh Snapshot.
 *
 * A client can also ask for more detail about the instruments it cares about (all of this is opt-in, so a client that
 * never asks sees exactly the stream above): { t: "subscribe", id } starts a depth ladder and a trades feed for one
 * instrument, { t: "unsubscribe", id } stops them, and { t: "history", id } asks once for its recent price history.
 *
 * Prices are fixed-point integers in each instrument's own scale: real price = wire value / 10^decimals, where
 * `decimals` comes from that instrument's reference data (ask for it with { t: "reference" }).
 */

/**
 * Bump when the wire format changes incompatibly; clients should refuse unknown versions.
 * 2: prices are scaled per instrument (see ReferenceData) instead of by one global scale.
 */
export const PROTOCOL_VERSION = 2;

/** Session handshake, sent once per connection before the first snapshot (like a FIX Logon). */
export interface Session {
  t: "session";
  v: number; // protocol version, compare with PROTOCOL_VERSION
  serverTime: number; // epoch ms at send, lets the client estimate clock offset
  instruments: number; // number of instruments in the snapshot
  tickMs: number; // simulator tick interval, i.e. how often a delta frame is sent
  updatesPerSecond: number; // target update rate across all instruments
}

/** Full level-1 quote for one instrument. */
export interface Quote {
  id: number; // numeric instrument id (compact on the wire)
  sym: string; // e.g. "AAPL" (only in snapshots; deltas use id)
  bid: number; // highest price a buyer will pay (fixed-point integer)
  ask: number; // lowest price a seller will accept (fixed-point integer)
  bidSz: number; // quantity available at the bid
  askSz: number; // quantity available at the ask
  last: number; // last traded price (fixed-point integer)
  vol: number; // cumulative traded volume
  ts: number; // server event time, epoch ms
}

/** Delta entry: same as Quote minus the static symbol. */
export type QuoteUpdate = Omit<Quote, "sym">;

export interface Snapshot {
  t: "snapshot";
  seq: number; // seq of the last delta included in this snapshot
  ts: number;
  quotes: Quote[];
}

export interface Delta {
  t: "delta";
  seq: number; // strictly +1 per frame
  ts: number; // server send time, epoch ms (for end-to-end latency)
  updates: QuoteUpdate[];
}

/**
 * Static facts about one instrument. A price on the wire is an integer counting units of 10^-decimals of the
 * instrument's currency, so real price = wire value / 10^decimals. `tickSize` is the smallest allowed price move.
 */
export interface InstrumentReference {
  id: number;
  name: string;
  currency: string; // ISO code, e.g. "USD"
  tickSize: number; // real price units, e.g. 0.01
  decimals: number; // decimal places of a price, e.g. 2
  prevClose: number; // previous close, as a wire integer (divide by 10^decimals for the real price)
}

/** Reference data for every instrument. Sent only to a client that asked for it with a ReferenceRequest. */
export interface ReferenceData {
  t: "reference";
  instruments: InstrumentReference[];
}

/** One rung of the order book: a price (wire integer) and the quantity waiting at it. */
export type DepthLevel = [price: number, size: number];

/**
 * The order book (level 2) of one instrument the client subscribed to. Best price first on each side. It is the
 * whole ladder every time, not a change, so a client simply replaces what it had and needs no gap recovery.
 * Sent when the instrument updates (at most once per tick), and once right after subscribing.
 */
export interface Depth {
  t: "depth";
  id: number;
  ts: number; // server time, epoch ms
  bids: DepthLevel[]; // highest price first; bids[0] is the quote's bid
  asks: DepthLevel[]; // lowest price first; asks[0] is the quote's ask
}

/** One completed trade. A "buy" trades at the ask (the buyer crossed the spread), a "sell" at the bid. */
export interface Trade {
  ts: number; // server time, epoch ms
  price: number; // fixed-point integer
  size: number;
  side: "buy" | "sell";
}

/** The trades of one subscribed instrument since the last frame, oldest first. Only sent when there were some. */
export interface Trades {
  t: "trades";
  id: number;
  trades: Trade[];
}

/**
 * How far back a price history goes: "5m" is the last five minutes (the real buffer, one point a second); the others are
 * made up when asked, ending at the current price: "1d" the last 24 hours (5-minute bars, starting at the previous close),
 * "1m" the last month and "1y" the last year (daily bars), "ytd" since 1 January (daily), and "max" since the instrument
 * "started trading" (weekly bars), a date that is different for each instrument.
 */
export const HISTORY_RANGES = ["5m", "1d", "1m", "1y", "ytd", "max"] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];

/** Price history of one instrument, oldest first: [epoch ms, last price as a wire integer]. `range` says which range this is. */
export interface HistoryData {
  t: "history";
  id: number;
  range: HistoryRange;
  /** The instrument's market at the time (not sent for the five-minute range): for a day, the session the series is of. */
  session?: SessionInfo;
  points: [ts: number, price: number][];
}

/** The markets instruments trade on: US, European and Japanese equities, and round-the-clock FX. */
export type Market = "us" | "eu" | "jp" | "fx";

/** One market's session at some moment: all times are epoch ms, and the session is the open one, or else the last that ended. */
export interface SessionInfo {
  market: Market;
  timeZone: string; // IANA name, such as "America/New_York"
  continuous: boolean; // trades round the clock, so there is no open or close (the session is the last 24 hours)
  open: number;
  close: number;
}

/** Why a request was refused. */
export interface Rejected {
  t: "rejected";
  request: "subscribe" | "history";
  id: number;
  reason: "limit" | "unknown-instrument"; // limit: the client already has the most subscriptions allowed
}

/** Which way a client wants to trade. */
export type Side = "buy" | "sell";

/**
 * A quote the dealer is offering, in reply to an RfqRequest. It is good for `validForMs` from when it is sent. `price` is
 * a wire integer, like every price; `screenPrice` is what the screen showed (the ask for a buy, the bid for a sell), so
 * the client can show how much worse the price is for this size.
 */
export interface RfqQuote {
  t: "rfqQuote";
  ref: number; // the client's own id for the request
  id: number; // the instrument
  side: Side;
  quantity: number;
  price: number;
  screenPrice: number;
  validForMs: number;
}

/** How a request ended. */
export type RfqOutcome = "filled" | "rejected" | "expired" | "declined" | "unknown";

/**
 * The end of a request: the trade (filled), or why there was none. A request ends exactly once; asking again about an
 * ended request gets the same result back, so accepting twice cannot trade twice.
 */
export interface RfqResult {
  t: "rfqResult";
  ref: number;
  outcome: RfqOutcome; // "unknown": the server has no such request (for example after a reconnect)
  id?: number;
  side?: Side;
  quantity?: number;
  price?: number; // the price traded at, when filled
  tradeId?: number; // the server's reference for the trade, when filled
  reason?: "quantity" | "unknown-instrument" | "busy"; // why a request was declined
}

export type ServerMessage =
  | Session
  | Snapshot
  | Delta
  | ReferenceData
  | Depth
  | Trades
  | HistoryData
  | Rejected
  | RfqQuote
  | RfqResult;

export interface ResyncRequest {
  t: "resync";
}

/** Asks for the reference data. Only the requesting client gets the reply; everyone else's stream is unchanged. */
export interface ReferenceRequest {
  t: "reference";
}

/** The faults a client can ask the server to inject. */
export const CHAOS_ACTIONS = ["pause", "resume", "gap", "drop", "burst", "latency", "reset"] as const;
export type ChaosAction = (typeof CHAOS_ACTIONS)[number];

/**
 * Asks the server to misbehave on purpose (fault injection), so a client's recovery can be tested.
 * `value` is the optional argument some actions take: seconds for `burst`, milliseconds for `latency`.
 */
export interface ChaosCommand {
  t: "chaos";
  action: ChaosAction;
  value?: number;
}

/** Starts the depth ladder and trades feed for one instrument (up to the per-client limit). */
export interface SubscribeRequest {
  t: "subscribe";
  id: number;
}

/** Stops the depth ladder and trades feed for one instrument. */
export interface UnsubscribeRequest {
  t: "unsubscribe";
  id: number;
}

/** Asks once for the price history of one instrument (the last five minutes unless `range` says otherwise). Answered with HistoryData, to this client only. */
export interface HistoryRequest {
  t: "history";
  id: number;
  range?: HistoryRange;
}

/** Asks the dealer for a price for a size (a request for quote, RFQ). Answered with an RfqQuote, or an RfqResult if declined. */
export interface RfqRequest {
  t: "rfq";
  ref: number; // the client's own id for this request, which it uses to accept or reject
  id: number; // the instrument
  side: Side;
  quantity: number;
}

/** Accepts a quote: trades at its price, if it is still valid. */
export interface RfqAccept {
  t: "rfqAccept";
  ref: number;
}

/** Turns a quote down. */
export interface RfqReject {
  t: "rfqReject";
  ref: number;
}

export type ClientMessage =
  | RfqRequest
  | RfqAccept
  | RfqReject
  | ResyncRequest
  | ReferenceRequest
  | ChaosCommand
  | SubscribeRequest
  | UnsubscribeRequest
  | HistoryRequest;
