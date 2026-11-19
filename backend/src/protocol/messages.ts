/**
 * Wire protocol. Encoded as MessagePack binary frames.
 *
 * Flow: on connect the server sends a Session, then a Snapshot, then sequence-numbered Deltas.
 * If a client sees `seq` skip (gap), or the server dropped frames for it due to
 * backpressure, the client sends { t: "resync" } and gets a fresh Snapshot.
 *
 * Prices are fixed-point integers: real price = wire value / Session.pxScale.
 */

/** Bump when the wire format changes incompatibly; clients should refuse unknown versions. */
export const PROTOCOL_VERSION = 1;

/** Price scale: 100 means 2 decimals, so 187.42 travels as 18742 (made per-instrument later). */
export const PRICE_SCALE = 100;

/** Session handshake, sent once per connection before the first snapshot (like a FIX Logon). */
export interface Session {
  t: "session";
  v: number; // protocol version, compare with PROTOCOL_VERSION
  serverTime: number; // epoch ms at send, lets the client estimate clock offset
  instruments: number; // number of instruments in the snapshot
  pxScale: number; // divide wire prices by this to get real prices
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

export type ServerMessage = Session | Snapshot | Delta;

export interface ResyncRequest {
  t: "resync";
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

export type ClientMessage = ResyncRequest | ChaosCommand;
