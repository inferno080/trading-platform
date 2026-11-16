import { encode, decode } from "@msgpack/msgpack";
import type { ClientMessage, ServerMessage } from "./messages.js";

export const encodeMessage = (msg: ServerMessage): Uint8Array => encode(msg);

export const decodeServerMessage = (data: Uint8Array): ServerMessage =>
  decode(data) as ServerMessage;

export const decodeClientMessage = (data: Uint8Array): ClientMessage | null => {
  try {
    const msg = decode(data) as ClientMessage;
    return msg && msg.t === "resync" ? msg : null;
  } catch {
    return null;
  }
};
