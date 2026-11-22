import { decode, encode } from "@msgpack/msgpack";
import type { ClientMessage, ServerMessage } from "./messages";

// Decode one binary WebSocket frame into a typed server message.
export const decodeServerMessage = (data: Uint8Array): ServerMessage => decode(data) as ServerMessage;

/**
 * Decode one frame, or null if it is not a server message at all (bytes that are not MessagePack, or a value that is not
 * an object with a type). Whatever is sent down a socket, a bad frame must be ignored, never throw inside the code that
 * is reading the socket (in the worker that would stop it).
 */
export const tryDecodeServerMessage = (data: Uint8Array): ServerMessage | null => {
  try {
    const message: unknown = decode(data);
    return typeof message === "object" && message !== null && typeof (message as { t?: unknown }).t === "string" ? (message as ServerMessage) : null;
  } catch {
    return null;
  }
};

// Encode a client message (such as a resync request) for sending.
// Copied into a plain ArrayBuffer-backed array, which is what WebSocket.send accepts.
export const encodeClientMessage = (msg: ClientMessage): Uint8Array<ArrayBuffer> => new Uint8Array(encode(msg));
