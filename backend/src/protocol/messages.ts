/**
 * Wire protocol. Encoded as MessagePack binary frames.
 *
 * Flow: on connect the server sends a Snapshot, then sequence-numbered Deltas.
 * If a client sees `seq` skip (gap), or the server dropped frames for it due to
 * backpressure, the client sends { t: "resync" } and gets a fresh Snapshot.
 */

/** Full level-1 quote for one instrument. */
export interface Quote {
  id: number; // numeric instrument id (compact on the wire)
  sym: string; // e.g. "AAPL" (only in snapshots; deltas use id)
  bid: number; // highest price a buyer will pay
  ask: number; // lowest price a seller will accept
  bidSz: number; // quantity available at the bid
  askSz: number; // quantity available at the ask
  last: number;
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

export type ServerMessage = Snapshot | Delta;

export interface ResyncRequest {
  t: "resync";
}

export type ClientMessage = ResyncRequest;
