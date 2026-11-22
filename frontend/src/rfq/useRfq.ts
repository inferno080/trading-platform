import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Side } from "../protocol/messages";
import type { RfqPort } from "./bridge";
import { initialRfqState, reduceRfq, remainingMs, type RfqState } from "./machine";

/** How often the countdown is looked at while a quote is open. */
const TICK_MS = 250;

/** If the server has not answered a request (or an acceptance) in this long, the ticket gives up rather than wait for ever. */
export const ANSWER_TIMEOUT_MS = 8000;

// Request ids only need to be different from each other, within a connection; a changing start keeps a new page from reusing the last one's.
let nextRef = Date.now() % 1_000_000_000;

interface Rfq {
  state: RfqState;
  /** Milliseconds left on the open quote (0 when there is none). */
  remainingMs: number;
  request: (side: Side, quantity: number) => void;
  accept: () => void;
  reject: () => void;
  reset: () => void;
}

/**
 * Runs one ticket: the state machine, what the server says to it, and the countdown. If the ticket goes away (another
 * symbol is opened) while a quote is open, the quote is turned down, so no quote is left hanging on the server.
 */
export function useRfq(port: RfqPort, instrumentId: number): Rfq {
  const [state, dispatch] = useReducer(reduceRfq, initialRfqState);
  const [now, setNow] = useState(() => Date.now());
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  // What the server says, and the loss of the connection.
  useEffect(
    () =>
      port.subscribe((event) => {
        if (event.type === "quote") {
          const { ref, price, screenPrice, validForMs } = event.quote;
          dispatch({ type: "quote", ref, quote: { price, screenPrice, validForMs, receivedAt: Date.now() } });
        } else if (event.type === "result") {
          dispatch({ type: "result", result: event.result });
        } else {
          dispatch({ type: "disconnected" });
        }
      }),
    [port],
  );

  // The countdown, which only runs while a quote is open.
  const quoted = state.status === "quoted";
  useEffect(() => {
    if (!quoted) return;
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      dispatch({ type: "tick", now: time });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [quoted]);

  // A request the server never answers (a server that does not know quotes, a lost message) must not leave the ticket waiting.
  const waiting = state.status === "requesting" || state.status === "accepting";
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => dispatch({ type: "disconnected" }), ANSWER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  // Leaving with a quote open turns it down.
  useEffect(
    () => () => {
      const current = latest.current;
      if (current.status === "quoted") port.reject(current.request.ref);
    },
    [port],
  );

  const request = useCallback(
    (side: Side, quantity: number) => {
      const request = { ref: nextRef++, id: instrumentId, side, quantity };
      dispatch({ type: "request", request });
      port.request(request);
    },
    [port, instrumentId],
  );
  const accept = useCallback(() => {
    const current = latest.current;
    if (current.status !== "quoted") return;
    dispatch({ type: "accept" });
    port.accept(current.request.ref);
  }, [port]);
  const reject = useCallback(() => {
    const current = latest.current;
    if (current.status !== "quoted") return;
    dispatch({ type: "reject" });
    port.reject(current.request.ref);
  }, [port]);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  return { state, remainingMs: remainingMs(state, now), request, accept, reject, reset };
}
