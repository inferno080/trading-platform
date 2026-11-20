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

export type ServerMessage = Session | Snapshot | Delta | ReferenceData;

export interface ResyncRequest {
  t: "resync";
}

/** Asks for the reference data. The server replies only to the client that asked. */
export interface ReferenceRequest {
  t: "reference";
}

export type ClientMessage = ResyncRequest | ReferenceRequest;
