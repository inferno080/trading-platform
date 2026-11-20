import { useEffect, useRef, useState } from "react";
import { appendTick, flatten } from "../chart/series";
import { WS_URL } from "../feed/url";
import { collector } from "../hud/collector";
import { decodeServerMessage, encodeClientMessage } from "../protocol/codec";
import {
  PROTOCOL_VERSION,
  type InstrumentReference,
  type Quote,
  type HistoryData,
  type QuoteUpdate,
  type Rejected,
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

type ChartState = { id: number; data: number[] } | null;

/** Naive: every update of the selected instrument copies its whole chart and sets state again. */
function foldTicks(setChart: (update: (previous: ChartState) => ChartState) => void, selected: number | null, updates: QuoteUpdate[]): void {
  for (const update of updates) {
    if (update.id !== selected) continue;
    setChart((previous) => {
      if (!previous || previous.id !== update.id) return previous;
      const data = previous.data.slice();
      appendTick(data, update.ts, update.last);
      return { id: previous.id, data };
    });
  }
}

/** The server's answer to a request for the selected instrument's history: the data, or a refusal. */
function applyChartReply(
  msg: HistoryData | Rejected,
  selected: number | null,
  setChart: (chart: ChartState) => void,
  setUnavailable: (unavailable: boolean) => void,
): void {
  if (msg.id !== selected) return; // an answer for an instrument that is no longer selected
  if (msg.t === "history") setChart({ id: msg.id, data: flatten(msg.points) });
  else if (msg.request === "history") setUnavailable(true);
}

/**
 * DELIBERATELY NAIVE baseline: every WebSocket message goes straight into React state,
 * and the whole table re-renders. No worker, no batching, no memoization.
 * It exists to be measured and beaten by the optimized pipeline.
 *
 * Once per connection, right after the session, it asks the server for the reference data (names, currencies,
 * decimals and previous closes). That data is static, so it is kept apart from the quotes that change every frame.
 */
export function useNaiveFeed(selectedId: number | null = null) {
  const [status, setStatus] = useState<FeedStatus>("connecting");
  const [session, setSession] = useState<Session | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [reference, setReference] = useState<ReferenceById | null>(null);
  const [referenceMissing, setReferenceMissing] = useState(false);
  const [badVersion, setBadVersion] = useState<number | null>(null);
  // The price chart of the selected instrument, as the flat [time, price, ...] list, and whether it could not be had.
  const [chart, setChart] = useState<ChartState>(null);
  const [chartUnavailable, setChartUnavailable] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const selected = useRef(selectedId); // read by the socket's handlers, which are set up once

  // A newly selected instrument starts with no chart, and its history is asked for (once connected).
  useEffect(() => {
    selected.current = selectedId;
    setChart(null);
    setChartUnavailable(false);
    if (selectedId !== null && socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(encodeClientMessage({ t: "history", id: selectedId }));
    }
  }, [selectedId]);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.binaryType = "arraybuffer";
    socket.current = ws;
    let lastSeq = -1; // -1 means "waiting for a snapshot": deltas are ignored until one arrives
    let referenceTimer: number | undefined;

    ws.onopen = () => {
      setStatus("live");
      if (selected.current !== null) ws.send(encodeClientMessage({ t: "history", id: selected.current }));
    };
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
          foldTicks(setChart, selected.current, msg.updates);
          break;

        case "history":
        case "rejected":
          applyChartReply(msg, selected.current, setChart, setChartUnavailable);
          break;
      }
    };

    return () => {
      window.clearTimeout(referenceTimer);
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
      ws.close();
    };
  }, []);

  return { status, session, quotes, reference, referenceMissing, badVersion, chart, chartUnavailable };
}
