/**
 * Wire types, mirrored from backend/src/protocol/messages.ts.
 * Keep the two files in sync by hand until the project shares a types package.
 * Prices are fixed-point integers in each instrument's own scale: real price = wire value / 10^decimals, where
 * `decimals` comes from that instrument's reference data (ask for it with { t: "reference" }).
 */

/** The protocol version this client understands. Version 2 scales prices per instrument. */
export const PROTOCOL_VERSION = 2;

/** Session handshake, sent once per connection before the first snapshot. */
export interface Session {
  t: "session";
  v: number; // protocol version
  serverTime: number; // epoch ms at send
  instruments: number;
  tickMs: number; // how often a delta frame is sent
  updatesPerSecond: number; // target update rate across all instruments
}

/** Full level-1 quote for one instrument. */
export interface Quote {
  id: number;
  sym: string;
  bid: number; // fixed-point integer
  ask: number; // fixed-point integer
  bidSz: number;
  askSz: number;
  last: number; // fixed-point integer
  vol: number; // cumulative traded volume
  ts: number; // server event time, epoch ms
}

/** Delta entry: a quote without the static symbol. */
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
  ts: number; // server send time, epoch ms
  updates: QuoteUpdate[];
}

/**
 * Static facts about one instrument. A price on the wire is an integer counting units of 10^-decimals of the
 * instrument's currency, so real price = wire value / 10^decimals.
 */
export interface InstrumentReference {
  id: number;
  name: string;
  currency: string; // ISO code, e.g. "USD"
  tickSize: number; // real price units, e.g. 0.01
  decimals: number; // decimal places of a price, e.g. 2
  prevClose: number; // previous close, as a wire integer (divide by 10^decimals for the real price)
}

/** Reference data for every instrument. Sent only in reply to a ReferenceRequest. */
export interface ReferenceData {
  t: "reference";
  instruments: InstrumentReference[];
}

/** One rung of the order book: a price (wire integer) and the quantity waiting at it. */
export type DepthLevel = [price: number, size: number];

/** The order book of one instrument the client subscribed to. The whole ladder every time, best price first. */
export interface Depth {
  t: "depth";
  id: number;
  ts: number;
  bids: DepthLevel[];
  asks: DepthLevel[];
}

/** One completed trade. A "buy" trades at the ask, a "sell" at the bid. */
export interface Trade {
  ts: number;
  price: number;
  size: number;
  side: "buy" | "sell";
}

/** The trades of one subscribed instrument since the last frame, oldest first. */
export interface Trades {
  t: "trades";
  id: number;
  trades: Trade[];
}

/**
 * How far back a price history goes: "5m" is the last five minutes (the server's real buffer, one point a second); the
 * others are made up by the server when asked, ending at the current price: "1d" the last 24 hours, "1m" the last month,
 * "1y" the last year, "ytd" since 1 January, and "max" since the instrument "started trading" (a different date for each).
 */
export const HISTORY_RANGES = ["5m", "1d", "1m", "1y", "ytd", "max"] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];

/** Price history of one instrument, oldest first: [epoch ms, last price as a wire integer]. Sent in reply to a HistoryRequest; `range` says which range it is. */
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

export interface HistoryData {
  t: "history";
  id: number;
  range: HistoryRange;
  /** The instrument's market at the time (not sent for the five-minute range): for a day, the session the series is of. */
  session?: SessionInfo;
  points: [ts: number, price: number][];
}

/** Why a request was refused. */
export interface Rejected {
  t: "rejected";
  request: "subscribe" | "history";
  id: number;
  reason: "limit" | "unknown-instrument";
}

/** Which way a client wants to trade. */
export type Side = "buy" | "sell";

/** A quote the dealer is offering for a request, good for `validForMs` from when it arrives. Prices are wire integers. */
export interface RfqQuote {
  t: "rfqQuote";
  ref: number; // the client's own id for the request
  id: number;
  side: Side;
  quantity: number;
  price: number;
  screenPrice: number; // what the screen showed: the ask for a buy, the bid for a sell
  validForMs: number;
}

/** How a request ended. "unknown": the server has no such request (for example after a reconnect). */
export type RfqOutcome = "filled" | "rejected" | "expired" | "declined" | "unknown";

/** The end of a request: the trade, or why there was none. Asking again about an ended request repeats this. */
export interface RfqResult {
  t: "rfqResult";
  ref: number;
  outcome: RfqOutcome;
  id?: number;
  side?: Side;
  quantity?: number;
  price?: number; // the price traded at, when filled
  tradeId?: number; // the server's reference for the trade, when filled
  reason?: "quantity" | "unknown-instrument" | "busy"; // why a request was declined
}

export type ServerMessage = Session | Snapshot | Delta | ReferenceData | Depth | Trades | HistoryData | Rejected | RfqQuote | RfqResult;

export interface ResyncRequest {
  t: "resync";
}

/** Asks for the reference data. The server replies only to the client that asked. */
export interface ReferenceRequest {
  t: "reference";
}

/** Starts the depth ladder and trades feed for one instrument. */
export interface SubscribeRequest {
  t: "subscribe";
  id: number;
}

/** Stops them. */
export interface UnsubscribeRequest {
  t: "unsubscribe";
  id: number;
}

/** Asks once for the price history of one instrument: the last five minutes unless `range` says otherwise. */
export interface HistoryRequest {
  t: "history";
  id: number;
  range?: HistoryRange;
}

/** Asks the dealer for a price for a size. `ref` is the client's own id for the request. */
export interface RfqRequest {
  t: "rfq";
  ref: number;
  id: number;
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

/** The faults a client can ask the server to inject (the server has the same list). */
export const CHAOS_ACTIONS = ["pause", "resume", "gap", "drop", "burst", "latency", "reset"] as const;
export type ChaosAction = (typeof CHAOS_ACTIONS)[number];

/** Asks the server to misbehave on purpose. `value` is seconds for `burst` and milliseconds for `latency`. */
export interface ChaosRequest {
  t: "chaos";
  action: ChaosAction;
  value?: number;
}

export type ClientMessage =
  | ResyncRequest
  | ReferenceRequest
  | SubscribeRequest
  | UnsubscribeRequest
  | HistoryRequest
  | RfqRequest
  | RfqAccept
  | RfqReject
  | ChaosRequest;
