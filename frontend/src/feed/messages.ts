import type { Session } from "../protocol/messages";

/** Where the connection stands. */
export type FeedStatus = "connecting" | "live" | "closed" | "error";

/**
 * The only messages that cross between the page and the Web Worker that owns the connection. They are small on
 * purpose: the page and the worker are separate threads, and everything sent between them is copied.
 */

/** From the page to the worker. */
export type WorkerCommand = { type: "connect"; url: string };

/** From the worker to the page. */
export type WorkerEvent =
  | { type: "ready"; scope: string } // the worker has started; `scope` is the name of its global scope
  | { type: "status"; status: FeedStatus }
  | { type: "session"; session: Session } // the handshake was accepted
  | { type: "badVersion"; version: number } // the server speaks a protocol version this client does not
  | { type: "reference"; count: number } // the reference data arrived, for this many instruments
  | { type: "referenceTimeout" }; // the reference data has not arrived in time
