import type { RfqResult, Side } from "../protocol/messages";

/** The largest quantity the dealer quotes (the server enforces the same limit). */
export const MAX_QUANTITY = 1_000_000;

/** What was asked for. */
export interface Request {
  ref: number; // this request's id, which the server uses to match the quote, the accept and the result
  id: number; // the instrument
  side: Side;
  quantity: number;
}

/** The dealer's price, with when it arrived here, since it is good for `validForMs` from then. */
export interface Quote {
  price: number;
  screenPrice: number;
  validForMs: number;
  receivedAt: number;
}

export type DeclineReason = "quantity" | "unknown-instrument" | "busy";

/**
 * Where a request for a quote is, as one of a few states. Each state carries exactly what makes sense in it, so an
 * impossible mix (a quote while idle, an accept before there is a quote) cannot be written down.
 *
 *   idle -> requesting -> quoted -> accepting -> accepted
 *                |           |-> rejected, expired
 *                |-> declined          (any of the four unfinished states -> failed, if the connection is lost)
 */
export type RfqState =
  | { status: "idle" }
  | { status: "requesting"; request: Request }
  | { status: "quoted"; request: Request; quote: Quote }
  | { status: "accepting"; request: Request; quote: Quote }
  | { status: "accepted"; request: Request; price: number; tradeId: number }
  | { status: "rejected"; request: Request }
  | { status: "expired"; request: Request }
  | { status: "declined"; request: Request; reason: DeclineReason }
  | { status: "failed"; request: Request; whileAccepting: boolean }; // the connection was lost, or the server did not know the request

export type RfqEvent =
  | { type: "request"; request: Request }
  | { type: "quote"; ref: number; quote: Quote }
  | { type: "result"; result: RfqResult }
  | { type: "accept" }
  | { type: "reject" }
  | { type: "tick"; now: number }
  | { type: "disconnected" }
  | { type: "reset" };

export const initialRfqState: RfqState = { status: "idle" };

/** The states a new request can start from: nothing in progress. */
const FINISHED = new Set<RfqState["status"]>(["idle", "accepted", "rejected", "expired", "declined", "failed"]);

/** Can a request be sent now? */
export const canRequest = (state: RfqState): boolean => FINISHED.has(state.status);

/** Milliseconds left on a quote, or 0 if there is none (or it has run out). */
export const remainingMs = (state: RfqState, now: number): number =>
  state.status === "quoted" ? Math.max(0, state.quote.receivedAt + state.quote.validForMs - now) : 0;

// A result from the server, in each state that waits for one. Each says where the request goes next.
function resultWhileRequesting(state: Extract<RfqState, { status: "requesting" }>, result: RfqResult): RfqState {
  if (result.outcome === "declined") return { status: "declined", request: state.request, reason: result.reason ?? "quantity" };
  if (result.outcome === "unknown") return { status: "failed", request: state.request, whileAccepting: false };
  return state;
}

function resultWhileQuoted(state: Extract<RfqState, { status: "quoted" }>, result: RfqResult): RfqState {
  if (result.outcome === "expired") return { status: "expired", request: state.request };
  if (result.outcome === "unknown") return { status: "failed", request: state.request, whileAccepting: false };
  return state;
}

function resultWhileAccepting(state: Extract<RfqState, { status: "accepting" }>, result: RfqResult): RfqState {
  if (result.outcome === "filled") return { status: "accepted", request: state.request, price: result.price ?? state.quote.price, tradeId: result.tradeId ?? 0 };
  if (result.outcome === "expired") return { status: "expired", request: state.request };
  if (result.outcome === "unknown") return { status: "failed", request: state.request, whileAccepting: true };
  return state;
}

/** How a result from the server moves a request that is waiting on it. */
function applyResult(state: RfqState, result: RfqResult): RfqState {
  if (!("request" in state) || state.request.ref !== result.ref) return state; // not about this request
  switch (state.status) {
    case "requesting":
      return resultWhileRequesting(state, result);
    case "quoted":
      return resultWhileQuoted(state, result);
    case "accepting":
      return resultWhileAccepting(state, result);
    default:
      return state; // already finished: a repeat of what is already known
  }
}

const startRequest = (state: RfqState, request: Request): RfqState => (canRequest(state) ? { status: "requesting", request } : state);

const receiveQuote = (state: RfqState, ref: number, quote: Quote): RfqState =>
  state.status === "requesting" && state.request.ref === ref ? { status: "quoted", request: state.request, quote } : state;

const acceptQuote = (state: RfqState): RfqState => (state.status === "quoted" ? { status: "accepting", request: state.request, quote: state.quote } : state);

const rejectQuote = (state: RfqState): RfqState => (state.status === "quoted" ? { status: "rejected", request: state.request } : state);

const tickClock = (state: RfqState, now: number): RfqState =>
  state.status === "quoted" && remainingMs(state, now) === 0 ? { status: "expired", request: state.request } : state;

function loseConnection(state: RfqState): RfqState {
  if (state.status === "requesting" || state.status === "quoted") return { status: "failed", request: state.request, whileAccepting: false };
  return state.status === "accepting" ? { status: "failed", request: state.request, whileAccepting: true } : state;
}

// An unfinished request cannot be wiped away.
const clear = (state: RfqState): RfqState => (canRequest(state) ? initialRfqState : state);

/** The next state after one event. Events that make no sense in the current state change nothing. */
export function reduceRfq(state: RfqState, event: RfqEvent): RfqState {
  switch (event.type) {
    case "request":
      return startRequest(state, event.request);
    case "quote":
      return receiveQuote(state, event.ref, event.quote);
    case "result":
      return applyResult(state, event.result);
    case "accept":
      return acceptQuote(state);
    case "reject":
      return rejectQuote(state);
    case "tick":
      return tickClock(state, event.now);
    case "disconnected":
      return loseConnection(state);
    case "reset":
      return clear(state);
  }
}
