import type { RfqQuote, RfqResult } from "../protocol/messages";
import type { Request } from "./machine";

/** What comes back from the server, or from the connection, about requests. */
export type RfqPortEvent = { type: "quote"; quote: RfqQuote } | { type: "result"; result: RfqResult } | { type: "disconnected" };

/**
 * How a ticket talks to the server, without knowing how the connection is run. The Naive tab sends from the page; the
 * Optimized tab asks its worker to. Either way the ticket sends requests, and listens for what comes back.
 */
export interface RfqPort {
  request(request: Request): void;
  accept(ref: number): void;
  reject(ref: number): void;
  /** Listen for quotes, results and a lost connection. Returns the way to stop. */
  subscribe(listener: (event: RfqPortEvent) => void): () => void;
}

/** Builds a port from the three ways to send, and gives back `emit`, which the owner of the connection calls with what arrives. */
export class RfqBridge {
  private readonly listeners = new Set<(event: RfqPortEvent) => void>();
  readonly port: RfqPort;

  constructor(send: Pick<RfqPort, "request" | "accept" | "reject">) {
    this.port = {
      ...send,
      subscribe: (listener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
    };
  }

  emit(event: RfqPortEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
