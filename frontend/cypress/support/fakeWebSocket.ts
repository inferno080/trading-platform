import { encode } from "@msgpack/msgpack";
import type { ServerMessage } from "../../src/protocol/messages";

const originalWebSocket = window.WebSocket;

/**
 * A stand-in for the browser WebSocket that tests drive by hand, so edge cases (a bad protocol version,
 * a missed frame, a dropped connection) can be produced exactly and on demand.
 */
export class FakeWebSocket {
  static readonly instances: FakeWebSocket[] = [];

  /** The most recently created socket, which is the one the app under test is using. */
  static get latest(): FakeWebSocket {
    const socket = FakeWebSocket.instances.at(-1);
    if (!socket) throw new Error("No FakeWebSocket has been created yet");
    return socket;
  }

  // The same numbers as the browser's WebSocket, so code that asks "is it open?" behaves the same.
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  binaryType = "blob";
  readyState = FakeWebSocket.CONNECTING;
  closed = false;
  sent: Uint8Array[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: Uint8Array): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = FakeWebSocket.CLOSED;
  }

  /** Test helper: the connection opens. */
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  /** Test helper: the server sends a message. */
  receive(message: ServerMessage): void {
    const bytes = encode(message);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    this.onmessage?.({ data: buffer } as MessageEvent<ArrayBuffer>);
  }

  /** Test helper: a connection error. */
  fail(): void {
    this.onerror?.();
  }

  /** Test helper: the server closes the connection. */
  drop(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

/** Make the app use FakeWebSocket instead of the real WebSocket. */
export function installFakeWebSocket(): void {
  FakeWebSocket.instances.length = 0;
  window.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
}

/** Put the real WebSocket back. */
export function restoreWebSocket(): void {
  window.WebSocket = originalWebSocket;
}
