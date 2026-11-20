import type { InstrumentReference, Quote, Session } from "../protocol/messages";

/** Where the connection stands. */
export type FeedStatus = "connecting" | "live" | "closed" | "error";

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

/** From the page to the worker. */
export type WorkerCommand =
  | { type: "connect"; url: string }
  | { type: "pull" }; // "send me what changed since the last pull": the page asks once per animation frame

/** From the worker to the page. */
export type WorkerEvent =
  | { type: "ready"; scope: string } // the worker has started; `scope` is the name of its global scope
  | { type: "status"; status: FeedStatus }
  | { type: "session"; session: Session } // the handshake was accepted
  | { type: "badVersion"; version: number } // the server speaks a protocol version this client does not
  | { type: "reference"; instruments: InstrumentReference[] } // the reference data arrived
  | { type: "referenceTimeout" } // the reference data has not arrived in time
  | { type: "snapshot"; quotes: Quote[] } // the full state, sent on connect and again after a gap
  | { type: "batch"; updates: Quote[]; stats: FeedStats }; // the latest state of every instrument that changed since the last pull
