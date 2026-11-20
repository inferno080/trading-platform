/**
 * Wire protocol. Encoded as MessagePack binary frames.
 *
 * Flow: on connect the server sends a Session, then a Snapshot, then sequence-numbered Deltas.
 * If a client sees `seq` skip (gap), or the server dropped frames for it due to
 * backpressure, the client sends { t: "resync" } and gets a fresh Snapshot.
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

export type ServerMessage = Session | Snapshot | Delta | ReferenceData;

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

export type ClientMessage = ResyncRequest | ReferenceRequest | ChaosCommand;
