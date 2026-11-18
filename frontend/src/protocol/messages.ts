/**
 * Wire types, mirrored from backend/src/protocol/messages.ts.
 * Keep the two files in sync by hand until the project shares a types package.
 * Prices are fixed-point integers: real price = wire value / Session.pxScale.
 */

/** The protocol version this client understands. */
export const PROTOCOL_VERSION = 1;

/** Session handshake, sent once per connection before the first snapshot. */
export interface Session {
  t: "session";
  v: number; // protocol version
  serverTime: number; // epoch ms at send
  instruments: number;
  pxScale: number; // divide wire prices by this to get real prices
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

export type ServerMessage = Session | Snapshot | Delta;

export interface ResyncRequest {
  t: "resync";
}

export type ClientMessage = ResyncRequest;
