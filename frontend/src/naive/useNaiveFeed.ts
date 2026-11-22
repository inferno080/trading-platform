import { useCallback, useEffect, useRef, useState } from "react";
import { LIVE_RANGE, rangeKey, type HistoryRange } from "../chart/range";
import { RfqBridge } from "../rfq/bridge";
import { Reconnector, type ReconnectInfo } from "../feed/reconnect";
import { WS_URL } from "../feed/url";
import { collector } from "../hud/collector";
import { encodeClientMessage, tryDecodeServerMessage } from "../protocol/codec";
import {
  PROTOCOL_VERSION,
  type ChaosAction,
  type Delta,
  type Quote,
  type ReferenceData,
  type ServerMessage,
  type Session,
  type SessionInfo,
  type Snapshot,
} from "../protocol/messages";
import {
  applyBookMessage,
  applyChartReply,
  applyRangeReply,
  applyUpdates,
  foldRanges,
  foldTicks,
  onlySessionOf,
  type Book,
  type Charts,
  type RangeCharts,
  type ReferenceById,
} from "./feedState";

export type FeedStatus = "connecting" | "live" | "reconnecting" | "closed" | "error";

/** How long to wait for the reference data after the session before giving up and saying so. */
export const REFERENCE_TIMEOUT_MS = 10_000;

const NO_IDS: number[] = []; // a stable empty list, so a page with no watchlist does not look like it changed

/**
 * DELIBERATELY NAIVE baseline: every WebSocket message goes straight into React state,
 * and the whole table re-renders. No worker, no batching, no memoization.
 * It exists to be measured and beaten by the optimized pipeline.
 *
 * Once per connection, right after the session, it asks the server for the reference data (names, currencies,
 * decimals and previous closes). That data is static, so it is kept apart from the quotes that change every frame.
 */
export function useNaiveFeed(selectedId: number | null = null, watchlist: number[] = NO_IDS, range: HistoryRange = LIVE_RANGE) {
  const [status, setStatus] = useState<FeedStatus>("connecting");
  const [reconnect, setReconnect] = useState<ReconnectInfo | null>(null);
  const retryNow = useRef<() => void>(() => undefined);
  const [session, setSession] = useState<Session | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [reference, setReference] = useState<ReferenceById | null>(null);
  const [referenceMissing, setReferenceMissing] = useState(false);
  const [badVersion, setBadVersion] = useState<number | null>(null);
  // The price charts of the tracked instruments, and the ones the server has no history for.
  const [charts, setCharts] = useState<Charts>({});
  const [chartUnavailable, setChartUnavailable] = useState<number[]>([]);
  const [rangeCharts, setRangeCharts] = useState<RangeCharts>({}); // the open instrument's longer charts
  const [sessions, setSessions] = useState<Record<number, SessionInfo>>({}); // the market session of the open instrument's longer charts
  const requestedRanges = useRef(new Set<string>()); // longer charts asked for on this connection
  const syncRange = useRef<() => void>(() => undefined);
  const [book, setBook] = useState<Book>({ depth: null, tape: [] });
  const socket = useRef<WebSocket | null>(null);
  const tracked = useRef<ReadonlySet<number>>(new Set()); // read by the socket's handlers, which are set up once
  const requested = useRef(new Set<number>()); // histories asked for on this connection
  const subscribed = useRef(new Set<number>()); // watchlist subscriptions made on this connection
  const sync = useRef<() => void>(() => undefined);
  // How a ticket talks to the server: this page sends from its own socket. What comes back is passed on to it.
  const [bridge] = useState(() => {
    const send = (message: Parameters<typeof encodeClientMessage>[0]): boolean => {
      const ws = socket.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      ws.send(encodeClientMessage(message));
      return true;
    };
    const bridge: RfqBridge = new RfqBridge({
      request: (request) => {
        // With no open connection the request cannot be made, which the ticket is told as a lost request.
        if (!send({ t: "rfq", ...request })) bridge.emit({ type: "result", result: { t: "rfqResult", ref: request.ref, outcome: "unknown" } });
      },
      accept: (ref) => void send({ t: "rfqAccept", ref }),
      reject: (ref) => void send({ t: "rfqReject", ref }),
    });
    return bridge;
  });
  const openId = useRef<number | null>(selectedId); // the open instrument, which the socket's handlers compare with

  // Make what the server knows match what the page wants: history for each tracked instrument, subscriptions for the
  // watchlist, and nothing kept for instruments that are no longer tracked. Runs when the choice changes, and again
  // whenever the connection opens.
  useEffect(() => {
    sync.current = () => {
      const wanted = new Set(watchlist);
      if (selectedId !== null) wanted.add(selectedId);
      tracked.current = wanted;
      openId.current = selectedId;
      setBook({ depth: null, tape: [] }); // the old instrument's book and trades are not the new one's
      for (const id of [...requested.current]) if (!wanted.has(id)) requested.current.delete(id);
      setCharts((previous) => {
        const kept = Object.keys(previous).filter((id) => wanted.has(Number(id)));
        return kept.length === Object.keys(previous).length ? previous : Object.fromEntries(kept.map((id) => [id, previous[Number(id)]!]));
      });
      setChartUnavailable((previous) => (previous.every((id) => wanted.has(id)) ? previous : previous.filter((id) => wanted.has(id))));

      const ws = socket.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return; // nothing can be sent until the connection is open
      for (const id of wanted) {
        if (requested.current.has(id)) continue;
        requested.current.add(id);
        ws.send(encodeClientMessage({ t: "history", id }));
      }
      // Subscribed to: the watchlist, and the open instrument, which needs it for its order book and trades.
      for (const id of [...subscribed.current]) {
        if (wanted.has(id)) continue;
        subscribed.current.delete(id);
        ws.send(encodeClientMessage({ t: "unsubscribe", id }));
      }
      for (const id of wanted) {
        if (subscribed.current.has(id)) continue;
        subscribed.current.add(id);
        ws.send(encodeClientMessage({ t: "subscribe", id }));
      }
    };
    sync.current();
  }, [selectedId, watchlist]);

  // Ask for the open instrument's chart over the chosen range, once, and forget the longer charts of any other instrument.
  // Apart from the effect above, so changing the range does not reset the order book.
  useEffect(() => {
    syncRange.current = () => {
      const prefix = selectedId === null ? null : `${selectedId}:`;
      for (const key of [...requestedRanges.current]) if (!prefix || !key.startsWith(prefix)) requestedRanges.current.delete(key);
      setRangeCharts((previous) => {
        const kept = Object.keys(previous).filter((key) => prefix !== null && key.startsWith(prefix));
        return kept.length === Object.keys(previous).length ? previous : Object.fromEntries(kept.map((key) => [key, previous[key]!]));
      });
      setSessions((previous) => onlySessionOf(previous, selectedId));
      const ws = socket.current;
      if (selectedId === null || range === LIVE_RANGE || !ws || ws.readyState !== WebSocket.OPEN) return;
      const key = rangeKey(selectedId, range);
      if (requestedRanges.current.has(key)) return;
      requestedRanges.current.add(key);
      ws.send(encodeClientMessage({ t: "history", id: selectedId, range }));
    };
    syncRange.current();
  }, [selectedId, range]);

  useEffect(() => {
    let referenceTimer: number | undefined;
    // When the connection is lost it is opened again after a growing wait (the same policy as the Optimized tab's worker).
    const reconnector = new Reconnector(
      () => open(),
      (info) => setReconnect(info),
    );
    retryNow.current = () => reconnector.retryNow();

    function open() {
      const ws = new WebSocket(WS_URL);
      ws.binaryType = "arraybuffer";
      socket.current = ws;
      let lastSeq = -1; // -1 means "waiting for a snapshot": deltas are ignored until one arrives
      setStatus("connecting");

      ws.onopen = () => {
        setStatus("live");
        setReconnect(null);
        requested.current.clear(); // a new connection knows nothing of what was asked before
        subscribed.current.clear();
        requestedRanges.current.clear();
        sync.current();
        syncRange.current();
      };
      // A socket that closes by itself was lost (one closed on purpose has its handlers removed first): wait, then try again.
      ws.onclose = () => {
        window.clearTimeout(referenceTimer);
        socket.current = null;
        setStatus("reconnecting");
        bridge.emit({ type: "disconnected" });
        reconnector.lost();
      };

      // The messages that are not the market itself: the open instrument's chart, order book and trades, and the dealer's replies.
      const handleDetail = (msg: Exclude<ServerMessage, Session | ReferenceData | Snapshot | Delta>): void => {
        switch (msg.t) {
          case "depth":
          case "trades":
            applyBookMessage(msg, openId.current, setBook);
            break;
          case "history":
          case "rejected":
            if (!applyRangeReply(msg, openId.current, setRangeCharts, setSessions)) applyChartReply(msg, tracked.current, setCharts, setChartUnavailable);
            break;
          case "rfqQuote":
            bridge.emit({ type: "quote", quote: msg });
            break;
          case "rfqResult":
            bridge.emit({ type: "result", result: msg });
            break;
        }
      };

      ws.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        const msg = tryDecodeServerMessage(new Uint8Array(event.data));
        if (!msg) return; // not a message this client knows: ignored

        switch (msg.t) {
          case "session":
            // Refuse to talk to a server speaking a protocol we don't understand.
            if (msg.v !== PROTOCOL_VERSION) {
              setBadVersion(msg.v);
              setStatus("error");
              ws.onclose = null; // a server this client cannot talk to is not retried
              ws.close();
              return;
            }
            reconnector.succeeded(); // a working connection: the next loss starts again from the shortest wait
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
            foldTicks(setCharts, tracked.current, msg.updates);
            foldRanges(setRangeCharts, openId.current, msg.updates);
            break;

          default:
            handleDetail(msg);
        }
      };
    }

    open();
    return () => {
      reconnector.stop();
      window.clearTimeout(referenceTimer);
      const ws = socket.current;
      if (ws) {
        ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
        ws.close();
      }
      socket.current = null;
    };
  }, [bridge]);

  const retry = useCallback(() => retryNow.current(), []);
  // Ask the server to misbehave on purpose, over this page's own connection (nothing is sent unless it is open).
  const chaos = useCallback((action: ChaosAction, value?: number) => {
    const ws = socket.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(encodeClientMessage(value === undefined ? { t: "chaos", action } : { t: "chaos", action, value }));
  }, []);

  return { sessions, retry, chaos, reconnect, status, session, quotes, reference, referenceMissing, badVersion, charts, rangeCharts, chartUnavailable, book, rfq: bridge.port };
}
