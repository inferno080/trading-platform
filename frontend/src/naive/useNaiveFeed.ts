import { useEffect, useState } from "react";
import { WS_URL } from "../feed/url";
import { collector } from "../hud/collector";
import { decodeServerMessage, encodeClientMessage } from "../protocol/codec";
import {
  PROTOCOL_VERSION,
  type InstrumentReference,
  type Quote,
  type QuoteUpdate,
  type Session,
} from "../protocol/messages";

export type FeedStatus = "connecting" | "live" | "closed" | "error";

/** How long to wait for the reference data after the session before giving up and saying so. */
export const REFERENCE_TIMEOUT_MS = 10_000;

/** Reference data by instrument id. */
export type ReferenceById = ReadonlyMap<number, InstrumentReference>;

/** Naive on purpose: copies the whole array on every frame, then replaces the quotes that changed. */
export const applyUpdates = (quotes: Quote[], updates: QuoteUpdate[]): Quote[] => {
  const next = quotes.slice();
  for (const update of updates) {
    const current = next[update.id];
    if (current) next[update.id] = { ...current, ...update };
  }
  return next;
};

/**
 * DELIBERATELY NAIVE baseline: every WebSocket message goes straight into React state,
 * and the whole table re-renders. No worker, no batching, no memoization.
 * It exists to be measured and beaten by the optimized pipeline.
 *
 * Once per connection, right after the session, it asks the server for the reference data (names, currencies,
 * decimals and previous closes). That data is static, so it is kept apart from the quotes that change every frame.
 */
export function useNaiveFeed() {
  const [status, setStatus] = useState<FeedStatus>("connecting");
  const [session, setSession] = useState<Session | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [reference, setReference] = useState<ReferenceById | null>(null);
  const [referenceMissing, setReferenceMissing] = useState(false);
  const [badVersion, setBadVersion] = useState<number | null>(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.binaryType = "arraybuffer";
    let lastSeq = -1; // -1 means "waiting for a snapshot": deltas are ignored until one arrives
    let referenceTimer: number | undefined;

    ws.onopen = () => setStatus("live");
    ws.onclose = () => setStatus((s) => (s === "error" ? s : "closed"));
    ws.onerror = () => setStatus("error");

    ws.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      const msg = decodeServerMessage(new Uint8Array(event.data));

      switch (msg.t) {
        case "session":
          // Refuse to talk to a server speaking a protocol we don't understand.
          if (msg.v !== PROTOCOL_VERSION) {
            setBadVersion(msg.v);
            setStatus("error");
            ws.close();
            return;
          }
          setSession(msg);
          // The only reference request of this connection. Without the reply the prices cannot be read.
          ws.send(encodeClientMessage({ t: "reference" }));
          referenceTimer = window.setTimeout(() => setReferenceMissing(true), REFERENCE_TIMEOUT_MS);
          break;

        case "reference":
          window.clearTimeout(referenceTimer);
          setReferenceMissing(false);
          setReference(new Map(msg.instruments.map((instrument) => [instrument.id, instrument])));
          break;

        case "snapshot":
          lastSeq = msg.seq;
          setQuotes(msg.quotes);
          break;

        case "delta":
          if (lastSeq < 0) return; // gap recovery in progress
          if (msg.seq !== lastSeq + 1) {
            // Missed a frame: ask for a fresh snapshot and ignore deltas until it arrives.
            collector.onGap();
            lastSeq = -1;
            ws.send(encodeClientMessage({ t: "resync" }));
            return;
          }
          lastSeq = msg.seq;
          collector.onDelta(msg.updates.length, Date.now() - msg.ts);
          setQuotes((previous) => applyUpdates(previous, msg.updates));
          break;
      }
    };

    return () => {
      window.clearTimeout(referenceTimer);
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
      ws.close();
    };
  }, []);

  return { status, session, quotes, reference, referenceMissing, badVersion };
}
