import { decodeServerMessage, encodeClientMessage } from "../protocol/codec";
import { PROTOCOL_VERSION } from "../protocol/messages";
import type { FeedStatus, WorkerEvent } from "./messages";

/** How long to wait for the reference data after the session before reporting that it is late. */
export const REFERENCE_TIMEOUT_MS = 10_000;

/** The parts of a WebSocket the connection uses. The real WebSocket and the fake used in tests both fit. */
export interface SocketLike {
  binaryType: string;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null;
  send(data: Uint8Array<ArrayBuffer>): void; // bytes backed by a plain ArrayBuffer, which is what WebSocket.send accepts
  close(): void;
}

/**
 * The connection to the server, with its rules: check the protocol version, ask for the reference data once,
 * and report what happens. It runs inside the Web Worker, but it is an ordinary class that knows nothing about
 * workers: the socket and the way to report events are handed to it, which is what makes it easy to test.
 *
 * For now it ignores the price updates. Holding them (and recovering from gaps) comes in the next step.
 */
export class FeedConnection {
  private socket: SocketLike | null = null;
  private referenceTimer: ReturnType<typeof setTimeout> | undefined;
  private status: FeedStatus = "connecting";

  constructor(
    private readonly createSocket: (url: string) => SocketLike,
    private readonly emit: (event: WorkerEvent) => void,
  ) {}

  /** Open a connection, closing any earlier one first so there is only ever one. */
  connect(url: string): void {
    this.close();
    const socket = this.createSocket(url);
    this.socket = socket;
    socket.binaryType = "arraybuffer";
    this.setStatus("connecting");

    socket.onopen = () => this.setStatus("live");
    socket.onclose = () => this.setStatus(this.status === "error" ? "error" : "closed"); // an error stays an error
    socket.onerror = () => this.setStatus("error");
    socket.onmessage = (event) => this.handle(socket, event.data);
  }

  /** Close the connection and stop everything it started. */
  close(): void {
    clearTimeout(this.referenceTimer);
    const socket = this.socket;
    if (!socket) return;
    socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;
    socket.close();
    this.socket = null;
  }

  private setStatus(status: FeedStatus): void {
    this.status = status;
    this.emit({ type: "status", status });
  }

  private handle(socket: SocketLike, data: ArrayBuffer): void {
    const message = decodeServerMessage(new Uint8Array(data));
    switch (message.t) {
      case "session":
        if (message.v !== PROTOCOL_VERSION) {
          // Refuse to talk to a server speaking a protocol we do not understand.
          this.emit({ type: "badVersion", version: message.v });
          this.setStatus("error");
          this.close();
          return;
        }
        this.emit({ type: "session", session: message });
        // The only reference request of this connection. Without the reply the prices cannot be read.
        socket.send(encodeClientMessage({ t: "reference" }));
        this.referenceTimer = setTimeout(() => this.emit({ type: "referenceTimeout" }), REFERENCE_TIMEOUT_MS);
        break;
      case "reference":
        clearTimeout(this.referenceTimer);
        this.emit({ type: "reference", count: message.instruments.length });
        break;
      case "snapshot":
      case "delta":
        break; // not used yet
    }
  }
}
