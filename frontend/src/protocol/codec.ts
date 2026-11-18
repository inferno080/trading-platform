import { decode, encode } from "@msgpack/msgpack";
import type { ClientMessage, ServerMessage } from "./messages";

// Decode one binary WebSocket frame into a typed server message.
export const decodeServerMessage = (data: Uint8Array): ServerMessage => decode(data) as ServerMessage;

// Encode a client message (such as a resync request) for sending.
// Copied into a plain ArrayBuffer-backed array, which is what WebSocket.send accepts.
export const encodeClientMessage = (msg: ClientMessage): Uint8Array<ArrayBuffer> => new Uint8Array(encode(msg));
