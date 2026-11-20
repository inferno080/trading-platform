import { encode, decode } from "@msgpack/msgpack";
import { CHAOS_ACTIONS, type ChaosAction, type ClientMessage, type ServerMessage } from "./messages.js";

export const encodeMessage = (msg: ServerMessage): Uint8Array => encode(msg);

// Used by tools that act as a client, such as the chaos command-line tool.
export const encodeClientMessage = (msg: ClientMessage): Uint8Array => encode(msg);

export const decodeServerMessage = (data: Uint8Array): ServerMessage =>
  decode(data) as ServerMessage;

// True only for messages the server understands. Anything else (an unknown type, an unknown chaos action,
// a missing or non-numeric field) is ignored.
const isClientMessage = (value: unknown): value is ClientMessage => {
  if (typeof value !== "object" || value === null) return false;
  const { t, action, value: argument } = value as { t?: unknown; action?: unknown; value?: unknown };
  if (t === "resync" || t === "reference") return true;
  const knownAction = CHAOS_ACTIONS.includes(action as ChaosAction);
  const validArgument = argument === undefined || (typeof argument === "number" && Number.isFinite(argument));
  return t === "chaos" && knownAction && validArgument;
};

export const decodeClientMessage = (data: Uint8Array): ClientMessage | null => {
  try {
    const msg: unknown = decode(data);
    return isClientMessage(msg) ? msg : null;
  } catch {
    return null; // not valid MessagePack
  }
};
