import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkerFactory } from "../feed/FeedWorkerContext";
import type { FeedStatus, WorkerEvent } from "../feed/messages";
import type { WorkerLike } from "../feed/FeedWorkerContext";
import { WS_URL } from "../feed/url";
import { LIVE_RANGE, type HistoryRange } from "../chart/range";
import type { ReconnectInfo } from "../feed/reconnect";
import { collector } from "../hud/collector";
import type { ChaosAction, Session } from "../protocol/messages";
import { RfqBridge, type RfqPort } from "../rfq/bridge";
import { FeedStore } from "./feedStore";

/** What the page shows about the connection. The prices themselves live in the store, not here. */
export interface FeedWorkerState {
  status: FeedStatus;
  /** While the connection is down: which attempt is next and when it will be made. */
  reconnect: ReconnectInfo | null;
  session: Session | null;
  /** The name of the worker's global scope, once it has started; shows that the connection is not on the page's thread. */
  scope: string | null;
  /** How many instruments the reference data covers, once it has arrived. */
  referenceCount: number | null;
  /** True when the reference data did not arrive in time. */
  referenceMissing: boolean;
  /** The protocol version the server spoke, when it was not one this client understands. */
  badVersion: number | null;
  /** True once the first snapshot has arrived. */
  hasSnapshot: boolean;
  /** The instruments the server has no price history for. */
  chartUnavailable: number[];
}

export const initialFeedState: FeedWorkerState = {
  status: "connecting",
  reconnect: null,
  session: null,
  scope: null,
  referenceCount: null,
  referenceMissing: false,
  badVersion: null,
  hasSnapshot: false,
  chartUnavailable: [],
};

const withSnapshot = (state: FeedWorkerState): FeedWorkerState => (state.hasSnapshot ? state : { ...state, hasSnapshot: true });

const withUnavailable = (state: FeedWorkerState, id: number): FeedWorkerState =>
  state.chartUnavailable.includes(id) ? state : { ...state, chartUnavailable: [...state.chartUnavailable, id] };

/**
 * The new state after one event from the worker. Batches change nothing here, so the page does not render
 * 60 times a second: their rows go to the store and the grid draws them.
 */
export function reduceWorkerEvent(state: FeedWorkerState, event: WorkerEvent): FeedWorkerState {
  switch (event.type) {
    case "ready":
      return { ...state, scope: event.scope };
    case "status":
      return { ...state, status: event.status, reconnect: event.status === "reconnecting" ? state.reconnect : null };
    case "reconnect":
      return { ...state, reconnect: { attempt: event.attempt, retryAt: event.retryAt } };
    case "session":
      return { ...state, session: event.session };
    case "badVersion":
      return { ...state, badVersion: event.version };
    case "reference":
      return { ...state, referenceCount: event.instruments.length, referenceMissing: false }; // arriving late still clears the warning
    case "referenceTimeout":
      return { ...state, referenceMissing: true };
    case "snapshot":
      return withSnapshot(state);
    case "chartUnavailable":
      return withUnavailable(state, event.id);
    default:
      return state; // batches change nothing here (see above), and the dealer's replies go to the ticket, not to the page's state
  }
}

/** What goes to the ticket (the dealer's replies, a lost connection), apart from the store and the page's state. */
function forwardMessage(message: WorkerEvent, bridge: RfqBridge): void {
  if (message.type === "rfqQuote") bridge.emit({ type: "quote", quote: message.quote });
  else if (message.type === "rfqResult") bridge.emit({ type: "result", result: message.result });
  else if (message.type === "status" && message.status !== "live" && message.status !== "connecting") bridge.emit({ type: "disconnected" });
}

const NO_IDS: number[] = []; // a stable empty list, so a page with no watchlist does not look like it changed

/** How often rows that have gone quiet are marked as stale. */
const STALE_SWEEP_MS = 1_000;

/** If the worker has not answered a request for updates in this long, ask again rather than wait for ever. */
export const PULL_TIMEOUT_MS = 2_000;

/**
 * After the page comes back to the front, wait this long before marking rows stale. While it was hidden no frames
 * were drawn, so no updates were asked for; they arrive in the first moments after it returns, and rows would
 * wrongly look stale until then.
 */
export const RESUME_GRACE_MS = 1_000;

/**
 * Runs the connection in a Web Worker for as long as the component is mounted, and feeds what it reports into a
 * store. Leaving the page terminates the worker, which also ends its connection.
 *
 * Once per animation frame the page asks the worker for what changed ("pull"), and never has more than one
 * request outstanding. The pace is therefore set by the page: if drawing is slow, frames are late, requests are
 * late, and the worker simply conflates more.
 */
export function useFeedWorker(
  selectedId: number | null = null,
  watchlist: number[] = NO_IDS,
  range: HistoryRange = LIVE_RANGE,
): {
  state: FeedWorkerState;
  store: FeedStore;
  rfq: RfqPort;
  retry: () => void;
  chaos: (action: ChaosAction, value?: number) => void;
} {
  const createWorker = useWorkerFactory();
  const [state, setState] = useState<FeedWorkerState>(initialFeedState);
  const [store] = useState(() => new FeedStore());
  const worker = useRef<WorkerLike | null>(null);
  // How a ticket talks to the server: through the worker, which owns the connection. What comes back is passed on to it.
  const [bridge] = useState(
    () =>
      new RfqBridge({
        request: (request) => worker.current?.postMessage({ type: "rfq", request: { t: "rfq", ...request } }),
        accept: (ref) => worker.current?.postMessage({ type: "rfqAccept", ref }),
        reject: (ref) => worker.current?.postMessage({ type: "rfqReject", ref }),
      }),
  );
  const selected = useRef(selectedId); // what a worker started later should be told
  const watched = useRef(watchlist);
  const chosenRange = useRef(range);

  useEffect(() => {
    collector.reset(); // start clean: counters from a previously active tab must not leak in
    const connection = createWorker();
    worker.current = connection;
    let pullOutstanding = false;
    let pullSentAt = 0;
    let visibleSince = Date.now();

    connection.onmessage = (event) => {
      const message = event.data;
      forwardMessage(message, bridge);
      if (message.type === "reference") store.setReference(message.instruments, Date.now());
      else if (message.type === "snapshot") store.setSnapshot(message.quotes, Date.now());
      else if (message.type === "batch") {
        pullOutstanding = false;
        collector.onBatch(message.stats);
        store.applyBatch(message.updates, Date.now());
        if (message.charts) store.setCharts(message.charts);
        if (message.depth) store.setBook(message.depth);
        if (message.trades) store.addTrades(message.trades);
      }
      setState((previous) => reduceWorkerEvent(previous, message));
    };
    connection.postMessage({ type: "connect", url: WS_URL });
    if (selected.current !== null) connection.postMessage({ type: "select", id: selected.current });
    if (watched.current.length > 0) connection.postMessage({ type: "watch", ids: watched.current });
    if (chosenRange.current !== LIVE_RANGE) connection.postMessage({ type: "range", range: chosenRange.current });

    let frame = requestAnimationFrame(function onFrame() {
      const now = Date.now();
      // One request at a time, but never wait for an answer that is not coming.
      if (!pullOutstanding || now - pullSentAt > PULL_TIMEOUT_MS) {
        pullOutstanding = true;
        pullSentAt = now;
        connection.postMessage({ type: "pull" });
      }
      frame = requestAnimationFrame(onFrame);
    });

    const onVisibility = () => {
      if (!document.hidden) visibleSince = Date.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const sweep = window.setInterval(() => {
      const now = Date.now();
      // Rows only look stale when the page was in a position to hear about updates.
      if (!document.hidden && now - visibleSince > RESUME_GRACE_MS) store.sweepStale(now);
    }, STALE_SWEEP_MS);

    return () => {
      cancelAnimationFrame(frame);
      clearInterval(sweep);
      document.removeEventListener("visibilitychange", onVisibility);
      connection.onmessage = null;
      connection.terminate();
      worker.current = null;
    };
  }, [createWorker, store, bridge]);

  // Tell the worker which instrument's chart is open and which are on the watchlist, and drop the charts of any that no
  // longer are, so one that comes back starts from its skeleton again.
  useEffect(() => {
    selected.current = selectedId;
    store.clearBook(); // the old instrument's order book and trades are not the new one's
    worker.current?.postMessage({ type: "select", id: selectedId });
  }, [selectedId, store]);
  useEffect(() => {
    chosenRange.current = range;
    worker.current?.postMessage({ type: "range", range });
  }, [range]);
  useEffect(() => {
    watched.current = watchlist;
    worker.current?.postMessage({ type: "watch", ids: watchlist });
  }, [watchlist]);
  useEffect(() => {
    store.keepCharts(new Set([...watchlist, ...(selectedId === null ? [] : [selectedId])]));
  }, [store, selectedId, watchlist]);

  const rfq = useMemo(() => bridge.port, [bridge]);
  // Try to reconnect now, and ask the server to misbehave: both are commands for the worker, which owns the connection.
  const retry = useCallback(() => worker.current?.postMessage({ type: "retry" }), []);
  const chaos = useCallback((action: ChaosAction, value?: number) => worker.current?.postMessage({ type: "chaos", action, value }), []);
  return { state, store, rfq, retry, chaos };
}
